import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import type { ResolvedSharePayload } from "expo-sharing";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { getScanMimeType, stageScannedDocument, loadPersistedScanQueue, reconcileScanQueue, validateScannedDocument } from "./scan";

export function sharedDocumentInput(payload: ResolvedSharePayload, id: string) {
  if (!payload.contentUri || !/^(file|content):\/\//.test(payload.contentUri)) {
    throw new Error("Bitte teile eine PDF-Datei oder ein Foto. Links und Texte kannst du per E-Mail weiterleiten.");
  }
  const name = payload.originalName || `Dokument-${id}`;
  return { id, name, uri: payload.contentUri, mimeType: getScanMimeType(payload.contentMimeType, name), size: payload.contentSize ?? undefined };
}

/** Commit each attachment before acknowledging the native share. A replay is harmless. */
export async function stageSharedDocuments(payloads: ResolvedSharePayload[], familyId: string): Promise<number> {
  if (!payloads.length) throw new Error("Es wurde keine Datei übergeben. Bitte teile das Dokument erneut mit Ordilo.");
  if (payloads.length > 10) throw new Error("Bitte teile höchstens 10 Dateien auf einmal.");
  let queue = await loadPersistedScanQueue(familyId);
  for (const payload of payloads) {
    // The native extension copies to a new UUID directory for each share. Stable
    // within that delivery so a failed checkpoint cannot create duplicate imports.
    const source = payload.contentUri ?? "";
    const id = `shared-${await digestStringAsync(CryptoDigestAlgorithm.SHA256, source)}`;
    if (queue.some((item) => item.id === id)) continue;
    let document = sharedDocumentInput(payload, id);
    // iPhone HEIC photos and large camera images enter the same JPEG pipeline.
    if (payload.contentType === "image") {
      const image = await manipulateAsync(document.uri, [{ resize: { width: 1600 } }], { compress: 0.72, format: SaveFormat.JPEG });
      document = { ...document, uri: image.uri, name: `${document.name.replace(/\.[^.]+$/, "")}.jpg`, mimeType: "image/jpeg", size: undefined };
    }
    const validation = validateScannedDocument(document);
    if (validation) throw new Error(validation);
    const staged = await stageScannedDocument(document, familyId);
    queue = [...queue, { ...staged, state: "queued" }];
    queue = await reconcileScanQueue(queue, familyId, []);
  }
  return payloads.length;
}
