type IsoBmffAtom = {
  payloadOffset: number;
  end: number;
  type: string;
};

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

/** Reads the movie-header duration from an M4A ISO Base Media container. */
export function getM4aDurationMillis(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  let offset = 0;
  let moov: IsoBmffAtom | null = null;
  while (offset < view.byteLength) {
    const atom = readIsoBmffAtom(view, offset, view.byteLength);
    if (!atom) return null;
    if (atom.type === "moov") {
      moov = atom;
      break;
    }
    offset = atom.end;
  }
  if (!moov) return null;

  offset = moov.payloadOffset;
  while (offset < moov.end) {
    const atom = readIsoBmffAtom(view, offset, moov.end);
    if (!atom) return null;
    if (atom.type === "mvhd") {
      if (atom.payloadOffset + 20 > atom.end) return null;
      const version = view.getUint8(atom.payloadOffset);
      const timeScaleOffset = atom.payloadOffset + (version === 1 ? 20 : 12);
      const durationOffset = atom.payloadOffset + (version === 1 ? 24 : 16);
      if (durationOffset + (version === 1 ? 8 : 4) > atom.end) return null;
      const timeScale = view.getUint32(timeScaleOffset);
      const duration = version === 1
        ? Number(view.getBigUint64(durationOffset))
        : view.getUint32(durationOffset);
      if (!timeScale || !Number.isFinite(duration)) return null;
      return Math.round((duration / timeScale) * 1_000);
    }
    offset = atom.end;
  }
  return null;
}
