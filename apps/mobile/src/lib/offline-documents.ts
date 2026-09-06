import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";

export type OfflineSnapshot = {
  id: string;
  title: string;
  mimeType: string;
  summary: string | null;
  ocrText: string | null;
};
export type OfflineDocument = OfflineSnapshot & {
  userId: string;
  familyId: string;
  savedAt: string;
  original: string;
};
export type OfflineDocumentSummary = Omit<OfflineDocument, "original">;
const KEY = "ordilo.offline.aes.v1";
const MAX_BYTES = 15 * 1024 * 1024;
let epoch = 0;
const allowedFamilies = new Map<string, string | null>();
function assertFamilyAccess(userId: string, familyId: string) {
  if (allowedFamilies.has(userId) && allowedFamilies.get(userId) !== familyId) throw new Error("Du hast keinen Zugriff mehr auf diese Familienkopie.");
}
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
function root() { return new Directory(Paths.document, "offline-v1"); }
function exportsDirectory() { return new Directory(Paths.cache, "offline-exports"); }
function safeId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("Ungültiges Dokument.");
  return value;
}
function documentFile(userId: string, familyId: string, id: string) {
  return new File(root(), `${safeId(userId)}.${safeId(familyId)}.${safeId(id)}.sealed`);
}
async function key(create: boolean) {
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored) return AESEncryptionKey.import(stored, "base64");
  if (!create) throw new Error("Die Offline-Kopie ist nicht mehr verfügbar.");
  const generated = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(KEY, await generated.encoded("base64"), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return generated;
}
/** Keeps plaintext only in memory. Random GCM nonces authenticate the entire snapshot. */
export function saveOfflineDocument(
  userId: string, familyId: string, snapshot: OfflineSnapshot, getDownloadUrl: () => Promise<string>,
): Promise<OfflineDocument> {
  const generation = epoch;
  return serial(async () => {
    assertFamilyAccess(userId, familyId);
    const destination = documentFile(userId, familyId, snapshot.id);
    if (!/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(snapshot.mimeType)) {
      throw new Error("Dieses Dateiformat lässt sich noch nicht offline speichern.");
    }
    const response = await fetch(await getDownloadUrl());
    if (!response.ok) throw new Error("Die Datei konnte nicht geladen werden.");
    const declaredSize = Number(response.headers.get("content-length"));
    if (declaredSize > MAX_BYTES) throw new Error("Offline-Kopien dürfen höchstens 15 MB groß sein.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error("Offline-Kopien dürfen höchstens 15 MB groß sein.");
    // Encode binary without spreading a large array onto the JS stack.
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const document: OfflineDocument = { ...snapshot, userId, familyId, savedAt: new Date().toISOString(), original: btoa(binary) };
    const encrypted = await aesEncryptAsync(new TextEncoder().encode(JSON.stringify(document)), await key(true));
    const sealed = await encrypted.combined("base64");
    if (generation !== epoch) throw new Error("Das Speichern wurde abgebrochen.");
    root().create({ intermediates: true, idempotent: true });
    // Commit only a fully encrypted payload; an interrupted replacement fails closed on read.
    destination.write(sealed);
    return document;
  });
}
export function listOfflineDocuments(userId: string, familyId?: string): Promise<OfflineDocumentSummary[]> {
  const generation = epoch;
  return serial(async () => {
    safeId(userId);
    if (allowedFamilies.has(userId)) {
      const allowed = allowedFamilies.get(userId);
      if (!allowed || (familyId && familyId !== allowed)) return [];
      familyId = allowed;
    }
    if (familyId) safeId(familyId);
    const directory = root();
    if (!directory.exists) return [];
    const files = directory.list().filter((entry): entry is File => entry instanceof File && entry.name.startsWith(`${userId}.`) && (!familyId || entry.name.startsWith(`${userId}.${familyId}.`)));
    if (!files.length) return [];
    const encryptionKey = await key(false);
    const documents: OfflineDocumentSummary[] = [];
    for (const file of files) {
      const bytes = await aesDecryptAsync(AESSealedData.fromCombined(await file.text()), encryptionKey);
      const document = JSON.parse(new TextDecoder().decode(bytes)) as OfflineDocument;
      if (document.userId !== userId || (familyId && document.familyId !== familyId)) throw new Error("Diese Kopie gehört zu einem anderen Konto.");
      const summary: OfflineDocumentSummary & { original?: string } = { ...document };
      delete summary.original;
      documents.push(summary);
    }
    return generation === epoch ? documents.sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
  });
}
export function readOfflineDocument(userId: string, familyId: string, id: string): Promise<OfflineDocument> {
  const generation = epoch;
  return serial(async () => {
    assertFamilyAccess(userId, familyId);
    const file = documentFile(userId, familyId, id);
    const bytes = await aesDecryptAsync(AESSealedData.fromCombined(await file.text()), await key(false));
    const document = JSON.parse(new TextDecoder().decode(bytes)) as OfflineDocument;
    if (generation !== epoch || document.userId !== userId || document.familyId !== familyId || document.id !== id) {
      throw new Error("Diese Offline-Kopie ist nicht mehr verfügbar.");
    }
    return document;
  });
}
export function removeOfflineDocument(userId: string, familyId: string, id: string): Promise<void> {
  return serial(async () => { const file = documentFile(userId, familyId, id); if (file.exists) file.delete(); });
}
/** Restricts reads immediately, then removes copies from former memberships. */
export function retainOfflineFamily(userId: string, familyId: string | null): Promise<void> {
  safeId(userId);
  if (familyId) safeId(familyId);
  const changed = !allowedFamilies.has(userId) || allowedFamilies.get(userId) !== familyId;
  allowedFamilies.set(userId, familyId);
  if (changed) epoch += 1;
  return serial(async () => {
    try {
      const directory = root();
      if (!directory.exists) return;
      for (const entry of directory.list()) {
        if (entry instanceof File && entry.name.startsWith(`${userId}.`) && (!familyId || !entry.name.startsWith(`${userId}.${familyId}.`))) entry.delete();
      }
    } catch (error) {
      // If the filesystem refuses removal, destroy the shared encryption key.
      // The in-memory restriction still denies access if keychain deletion fails.
      await SecureStore.deleteItemAsync(KEY);
      throw error;
    }
  });
}
export function clearOfflineExports(): void {
  const directory = exportsDirectory();
  if (directory.exists) directory.delete();
}
/** Call on sign-out/account removal. Invalidates in-flight saves before asynchronous cleanup. */
export function clearOfflineDocuments(): Promise<void> {
  epoch += 1;
  allowedFamilies.clear();
  return serial(async () => {
    try { await SecureStore.deleteItemAsync(KEY); }
    finally {
      const directory = root();
      try { if (directory.exists) directory.delete(); }
      finally { clearOfflineExports(); }
    }
  });
}
/** Export is explicit: another app may retain its own copy after the share sheet closes. */
export async function shareOfflineOriginal(document: OfflineDocument): Promise<void> {
  const generation = epoch;
  assertFamilyAccess(document.userId, document.familyId);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Teilen ist auf diesem Gerät nicht verfügbar.");
  if (generation !== epoch) throw new Error("Das Öffnen wurde abgebrochen.");
  const directory = exportsDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const extension = document.mimeType === "application/pdf" ? "pdf" : document.mimeType.split("/")[1];
  const file = new File(directory, `${safeId(document.id)}.${extension}`);
  try {
    file.write(document.original, { encoding: "base64" });
    await Sharing.shareAsync(file.uri, { mimeType: document.mimeType, dialogTitle: "Original öffnen oder teilen" });
  } finally {
    if (file.exists) file.delete();
  }
}
