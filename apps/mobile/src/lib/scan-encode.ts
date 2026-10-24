import { buildPdfFromJpegs } from "@ordilo/document-contract";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Image } from "react-native";
import { MAX_SCAN_FILE_SIZE, type ScannedDocument } from "./scan";
import {
  prepareScanDocument,
  type EncodedPage,
  type ResizeAction,
  type ScanImageSource,
} from "./scan-image";

/** A4 width in PDF points: pages print at paper size, pixels stay intact. */
const A4_WIDTH_PT = 595;

function createDocumentId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fileSize(uri: string): Promise<number | undefined> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? info.size : undefined;
}

async function passthroughScanPage(source: ScanImageSource): Promise<EncodedPage> {
  return { uri: source.uri, size: await fileSize(source.uri) };
}

async function encodeScanPage(
  source: ScanImageSource,
  actions: ResizeAction[],
  compress: number,
): Promise<EncodedPage> {
  const image = await manipulateAsync(source.uri, actions, {
    compress,
    format: SaveFormat.JPEG,
  });
  return { uri: image.uri, size: await fileSize(image.uri) };
}

/**
 * One page stays a JPEG; several become one PDF whose pages embed the JPEG
 * bytes verbatim (no WebView print, no re-encode, no downsampling).
 */
async function finishScanDocument(
  pages: EncodedPage[],
  sources: ScanImageSource[],
): Promise<ScannedDocument> {
  if (pages.length === 1) {
    return {
      id: createDocumentId(),
      uri: pages[0].uri,
      name: sources[0].name.replace(/\.[^.]+$/, "") + ".jpg",
      mimeType: "image/jpeg",
      size: pages[0].size,
    };
  }
  const jpegs = await Promise.all(pages.map((page) => new File(page.uri).bytes()));
  const pdf = buildPdfFromJpegs(jpegs, { pageWidthPt: A4_WIDTH_PT });
  const id = createDocumentId();
  const output = new File(Paths.cache, `scan-${id}.pdf`);
  output.write(pdf);
  return {
    id,
    uri: output.uri,
    name: `Scan-${new Date().toISOString().slice(0, 10)}.pdf`,
    mimeType: "application/pdf",
    size: pdf.byteLength,
  };
}

/** Fill in missing pixel sizes so small images are never upscaled. */
async function withDimensions(source: ScanImageSource): Promise<ScanImageSource> {
  if (source.width && source.height) return source;
  try {
    const { width, height } = await Image.getSize(source.uri);
    return { ...source, width, height };
  } catch {
    return source;
  }
}

/** Turn scanner pages or photos into one upload at the best quality that fits. */
export async function prepareScan(sources: ScanImageSource[]): Promise<ScannedDocument> {
  const measured = await Promise.all(sources.map(withDimensions));
  return prepareScanDocument(measured, MAX_SCAN_FILE_SIZE, {
    passthrough: passthroughScanPage,
    encode: encodeScanPage,
    finish: finishScanDocument,
  });
}
