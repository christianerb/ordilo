type IsoBmffAtom = {
  payloadOffset: number;
  end: number;
  type: string;
};

type Descriptor = {
  payloadOffset: number;
  end: number;
  tag: number;
};

const MAX_SUPPORTED_AAC_SAMPLES = 100_000;
const MAX_SUPPORTED_TABLE_ENTRIES = 100_000;

function readIsoBmffAtom(
  view: DataView,
  offset: number,
  end: number,
): IsoBmffAtom | null {
  if (offset + 8 > end) return null;
  let size = view.getUint32(offset);
  const type = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  );
  let payloadOffset = offset + 8;
  if (size === 1) {
    if (offset + 16 > end) return null;
    size = Number(view.getBigUint64(offset + 8));
    payloadOffset = offset + 16;
  } else if (size === 0) {
    size = end - offset;
  }
  if (!Number.isSafeInteger(size) || size < payloadOffset - offset || offset + size > end) {
    return null;
  }
  return { payloadOffset, end: offset + size, type };
}

function findChild(
  view: DataView,
  start: number,
  end: number,
  type: string,
): IsoBmffAtom | null {
  let offset = start;
  while (offset < end) {
    const atom = readIsoBmffAtom(view, offset, end);
    if (!atom) return null;
    if (atom.type === type) return atom;
    offset = atom.end;
  }
  return null;
}

function readDescriptor(
  view: DataView,
  offset: number,
  end: number,
): Descriptor | null {
  if (offset >= end) return null;
  const tag = view.getUint8(offset);
  let length = 0;
  let cursor = offset + 1;
  for (let index = 0; index < 4; index += 1) {
    if (cursor >= end) return null;
    const byte = view.getUint8(cursor);
    cursor += 1;
    length = length * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      if (cursor + length > end) return null;
      return { payloadOffset: cursor, end: cursor + length, tag };
    }
  }
  return null;
}

function readAacFrameInfo(
  view: DataView,
  esds: IsoBmffAtom,
): { frameSamples: number; sampleRate: number } | null {
  const fullBoxEnd = esds.payloadOffset + 4;
  if (fullBoxEnd > esds.end) return null;
  const esDescriptor = readDescriptor(view, fullBoxEnd, esds.end);
  if (!esDescriptor || esDescriptor.tag !== 0x03 || esDescriptor.payloadOffset + 3 > esDescriptor.end) {
    return null;
  }

  let cursor = esDescriptor.payloadOffset + 2;
  const flags = view.getUint8(cursor);
  cursor += 1;
  if (flags & 0x80) cursor += 2;
  if (flags & 0x40) {
    if (cursor >= esDescriptor.end) return null;
    cursor += 1 + view.getUint8(cursor);
  }
  if (flags & 0x20) cursor += 2;

  const decoderConfig = readDescriptor(view, cursor, esDescriptor.end);
  if (
    !decoderConfig ||
    decoderConfig.tag !== 0x04 ||
    decoderConfig.payloadOffset + 13 > decoderConfig.end
  ) {
    return null;
  }
  const decoderSpecific = readDescriptor(
    view,
    decoderConfig.payloadOffset + 13,
    decoderConfig.end,
  );
  if (!decoderSpecific || decoderSpecific.tag !== 0x05) return null;

  let bitOffset = decoderSpecific.payloadOffset * 8;
  const bitEnd = decoderSpecific.end * 8;
  const readBits = (count: number): number | null => {
    if (bitOffset + count > bitEnd) return null;
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = view.getUint8(Math.floor(bitOffset / 8));
      value = value * 2 + ((byte >> (7 - (bitOffset % 8))) & 1);
      bitOffset += 1;
    }
    return value;
  };

  let audioObjectType = readBits(5);
  if (audioObjectType === null) return null;
  if (audioObjectType === 31) {
    const extension = readBits(6);
    if (extension === null) return null;
    audioObjectType = 32 + extension;
  }
  // Expo's HIGH_QUALITY preset records AAC-LC. Reject other profiles rather
  // than guessing their frame length.
  if (audioObjectType !== 2) return null;

  const sampleRateIndex = readBits(4);
  if (sampleRateIndex === null) return null;
  const sampleRates = [
    96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000,
    22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
  ];
  const explicitSampleRate = sampleRateIndex === 15 ? readBits(24) : null;
  const sampleRate = sampleRateIndex === 15
    ? explicitSampleRate
    : sampleRates[sampleRateIndex];
  if (!sampleRate) return null;
  if (readBits(4) === null) return null; // channelConfiguration
  const frameLengthFlag = readBits(1);
  if (frameLengthFlag === null) return null;
  return { frameSamples: frameLengthFlag ? 960 : 1_024, sampleRate };
}

function readAudioTrackDurationMillis(
  view: DataView,
  track: IsoBmffAtom,
  mediaRanges: Array<{ start: number; end: number }>,
): { durationMillis: number; sampleBytes: number } | null {
  const media = findChild(view, track.payloadOffset, track.end, "mdia");
  if (!media) return null;
  const handler = findChild(view, media.payloadOffset, media.end, "hdlr");
  if (!handler || handler.payloadOffset + 12 > handler.end) return null;
  const handlerType = String.fromCharCode(
    view.getUint8(handler.payloadOffset + 8),
    view.getUint8(handler.payloadOffset + 9),
    view.getUint8(handler.payloadOffset + 10),
    view.getUint8(handler.payloadOffset + 11),
  );
  if (handlerType !== "soun") return null;

  const mediaHeader = findChild(view, media.payloadOffset, media.end, "mdhd");
  const mediaInfo = findChild(view, media.payloadOffset, media.end, "minf");
  const sampleTable = mediaInfo
    ? findChild(view, mediaInfo.payloadOffset, mediaInfo.end, "stbl")
    : null;
  if (!mediaHeader || !sampleTable || mediaHeader.payloadOffset + 20 > mediaHeader.end) {
    return null;
  }
  const version = view.getUint8(mediaHeader.payloadOffset);
  if (version !== 0 && version !== 1) return null;
  const timeScaleOffset = mediaHeader.payloadOffset + (version === 1 ? 20 : 12);
  if (timeScaleOffset + 4 > mediaHeader.end) return null;
  const timeScale = view.getUint32(timeScaleOffset);
  if (!timeScale) return null;

  const sampleSizes = findChild(view, sampleTable.payloadOffset, sampleTable.end, "stsz");
  const timeToSample = findChild(view, sampleTable.payloadOffset, sampleTable.end, "stts");
  const sampleDescriptions = findChild(
    view,
    sampleTable.payloadOffset,
    sampleTable.end,
    "stsd",
  );
  const sampleToChunk = findChild(
    view,
    sampleTable.payloadOffset,
    sampleTable.end,
    "stsc",
  );
  const chunkOffsets32 = findChild(
    view,
    sampleTable.payloadOffset,
    sampleTable.end,
    "stco",
  );
  const chunkOffsets64 = findChild(
    view,
    sampleTable.payloadOffset,
    sampleTable.end,
    "co64",
  );
  if (
    !sampleSizes ||
    !timeToSample ||
    !sampleDescriptions ||
    !sampleToChunk ||
    Number(Boolean(chunkOffsets32)) + Number(Boolean(chunkOffsets64)) !== 1
  ) {
    return null;
  }

  if (sampleSizes.payloadOffset + 12 > sampleSizes.end) return null;
  const constantSampleSize = view.getUint32(sampleSizes.payloadOffset + 4);
  const sampleCount = view.getUint32(sampleSizes.payloadOffset + 8);
  if (!sampleCount || sampleCount > MAX_SUPPORTED_AAC_SAMPLES) return null;
  if (
    constantSampleSize === 0 &&
    sampleSizes.payloadOffset + 12 + sampleCount * 4 > sampleSizes.end
  ) {
    return null;
  }
  let sampleBytes = constantSampleSize * sampleCount;
  if (constantSampleSize === 0) {
    sampleBytes = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      sampleBytes += view.getUint32(sampleSizes.payloadOffset + 12 + index * 4);
      if (!Number.isSafeInteger(sampleBytes)) return null;
    }
  }
  if (!sampleBytes || !Number.isSafeInteger(sampleBytes)) return null;
  const availableMediaBytes = mediaRanges.reduce(
    (total, range) => total + range.end - range.start,
    0,
  );
  if (sampleBytes !== availableMediaBytes) return null;

  const chunkOffsetTable = chunkOffsets32 ?? chunkOffsets64;
  if (!chunkOffsetTable || chunkOffsetTable.payloadOffset + 8 > chunkOffsetTable.end) {
    return null;
  }
  const chunkCount = view.getUint32(chunkOffsetTable.payloadOffset + 4);
  const chunkOffsetWidth = chunkOffsets64 ? 8 : 4;
  if (
    !chunkCount ||
    chunkCount > MAX_SUPPORTED_TABLE_ENTRIES ||
    chunkOffsetTable.payloadOffset + 8 + chunkCount * chunkOffsetWidth
      > chunkOffsetTable.end
  ) {
    return null;
  }
  const chunkOffsets: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const offset = chunkOffsetTable.payloadOffset + 8 + index * chunkOffsetWidth;
    const chunkOffset = chunkOffsets64
      ? Number(view.getBigUint64(offset))
      : view.getUint32(offset);
    if (!Number.isSafeInteger(chunkOffset)) return null;
    chunkOffsets.push(chunkOffset);
  }

  if (sampleToChunk.payloadOffset + 8 > sampleToChunk.end) return null;
  const sampleToChunkCount = view.getUint32(sampleToChunk.payloadOffset + 4);
  if (
    !sampleToChunkCount ||
    sampleToChunkCount > MAX_SUPPORTED_TABLE_ENTRIES ||
    sampleToChunk.payloadOffset + 8 + sampleToChunkCount * 12 > sampleToChunk.end
  ) {
    return null;
  }
  const chunkMappings: Array<{
    firstChunk: number;
    samplesPerChunk: number;
  }> = [];
  for (let index = 0; index < sampleToChunkCount; index += 1) {
    const offset = sampleToChunk.payloadOffset + 8 + index * 12;
    const firstChunk = view.getUint32(offset);
    const samplesPerChunk = view.getUint32(offset + 4);
    const descriptionIndex = view.getUint32(offset + 8);
    if (
      !firstChunk ||
      !samplesPerChunk ||
      descriptionIndex !== 1 ||
      (index === 0 && firstChunk !== 1) ||
      (index > 0 && firstChunk <= chunkMappings[index - 1]!.firstChunk)
    ) {
      return null;
    }
    chunkMappings.push({ firstChunk, samplesPerChunk });
  }

  const sampleSizeAt = (index: number): number =>
    constantSampleSize ||
    view.getUint32(sampleSizes.payloadOffset + 12 + index * 4);
  const referencedRanges: Array<{ start: number; end: number }> = [];
  let sampleIndex = 0;
  let mappingIndex = 0;
  for (let chunkIndex = 0; chunkIndex < chunkOffsets.length; chunkIndex += 1) {
    const chunkNumber = chunkIndex + 1;
    while (
      mappingIndex + 1 < chunkMappings.length &&
      chunkMappings[mappingIndex + 1]!.firstChunk <= chunkNumber
    ) {
      mappingIndex += 1;
    }
    const samplesPerChunk = chunkMappings[mappingIndex]!.samplesPerChunk;
    if (sampleIndex + samplesPerChunk > sampleCount) return null;
    let chunkBytes = 0;
    for (let index = 0; index < samplesPerChunk; index += 1) {
      chunkBytes += sampleSizeAt(sampleIndex);
      sampleIndex += 1;
      if (!Number.isSafeInteger(chunkBytes)) return null;
    }
    const start = chunkOffsets[chunkIndex]!;
    const end = start + chunkBytes;
    if (
      !chunkBytes ||
      !Number.isSafeInteger(end) ||
      !mediaRanges.some((range) => start >= range.start && end <= range.end)
    ) {
      return null;
    }
    referencedRanges.push({ start, end });
  }
  if (sampleIndex !== sampleCount) return null;
  referencedRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < referencedRanges.length; index += 1) {
    if (referencedRanges[index]!.start < referencedRanges[index - 1]!.end) {
      return null;
    }
  }

  if (timeToSample.payloadOffset + 8 > timeToSample.end) return null;
  const entryCount = view.getUint32(timeToSample.payloadOffset + 4);
  if (
    entryCount > MAX_SUPPORTED_TABLE_ENTRIES ||
    timeToSample.payloadOffset + 8 + entryCount * 8 > timeToSample.end
  ) {
    return null;
  }
  let decodingSampleCount = 0;
  let decodingDuration = 0;
  for (let index = 0; index < entryCount; index += 1) {
    const offset = timeToSample.payloadOffset + 8 + index * 8;
    const count = view.getUint32(offset);
    const delta = view.getUint32(offset + 4);
    decodingSampleCount += count;
    decodingDuration += count * delta;
    if (
      !Number.isSafeInteger(decodingSampleCount) ||
      !Number.isSafeInteger(decodingDuration)
    ) {
      return null;
    }
  }
  if (decodingSampleCount !== sampleCount) return null;

  if (sampleDescriptions.payloadOffset + 8 > sampleDescriptions.end) return null;
  const descriptionCount = view.getUint32(sampleDescriptions.payloadOffset + 4);
  if (descriptionCount !== 1) return null;
  const audioSampleEntry = readIsoBmffAtom(
    view,
    sampleDescriptions.payloadOffset + 8,
    sampleDescriptions.end,
  );
  if (!audioSampleEntry || audioSampleEntry.type !== "mp4a") return null;
  const esds = findChild(
    view,
    audioSampleEntry.payloadOffset + 28,
    audioSampleEntry.end,
    "esds",
  );
  if (!esds) return null;
  const frameInfo = readAacFrameInfo(view, esds);
  if (!frameInfo) return null;

  const sampleDuration = (sampleCount * frameInfo.frameSamples * 1_000)
    / frameInfo.sampleRate;
  const tableDuration = (decodingDuration * 1_000) / timeScale;
  const duration = Math.max(sampleDuration, tableDuration);
  return Number.isFinite(duration)
    ? { durationMillis: Math.ceil(duration), sampleBytes }
    : null;
}

/**
 * Reads duration from the AAC sample table, not the client-controlled movie
 * header. Only the single AAC-LC audio track produced by Expo is accepted.
 */
export function getM4aDurationMillis(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  let topLevelOffset = 0;
  let mediaBytes = 0;
  const mediaRanges: Array<{ start: number; end: number }> = [];
  let movie: IsoBmffAtom | null = null;
  while (topLevelOffset < view.byteLength) {
    const atom = readIsoBmffAtom(view, topLevelOffset, view.byteLength);
    if (!atom) return null;
    if (atom.type === "moov") {
      if (movie) return null;
      movie = atom;
    } else if (atom.type === "mdat") {
      mediaBytes += atom.end - atom.payloadOffset;
      mediaRanges.push({ start: atom.payloadOffset, end: atom.end });
    }
    topLevelOffset = atom.end;
  }
  if (!movie || !mediaBytes) return null;

  let offset = movie.payloadOffset;
  let duration: number | null = null;
  let trackCount = 0;
  let referencedMediaBytes = 0;
  while (offset < movie.end) {
    const atom = readIsoBmffAtom(view, offset, movie.end);
    if (!atom) return null;
    if (atom.type === "trak") {
      trackCount += 1;
      const track = readAudioTrackDurationMillis(view, atom, mediaRanges);
      if (!track || duration !== null) return null;
      duration = track.durationMillis;
      referencedMediaBytes = track.sampleBytes;
    }
    offset = atom.end;
  }
  return trackCount === 1 && referencedMediaBytes === mediaBytes ? duration : null;
}
