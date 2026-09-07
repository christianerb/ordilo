import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { clearSharedPayloads, getResolvedSharedPayloadsAsync, getSharedPayloads } from "expo-sharing";
import type { ResolvedSharePayload } from "expo-sharing";
import { z } from "zod";

const attachment = z.object({
  value: z.string(), shareType: z.enum(["file", "image"]), mimeType: z.string(),
  contentUri: z.string(), contentType: z.enum(["file", "image"]),
  contentMimeType: z.string(), originalName: z.string(), contentSize: z.number().positive(),
});
type Attachment = z.infer<typeof attachment>;
export type ShareDelivery = { id: string; payloads: ResolvedSharePayload[]; acknowledge: () => void };

const MANIFEST = "ready.json";
const UNREADABLE = "Der Eingang konnte nicht gelesen werden. Deine Dateien bleiben gespeichert.";

function inbox(): Directory | null {
  const group = Paths.appleSharedContainers["group.com.ordilo.app"];
  return group ? new Directory(group, "ordilo-inbox") : null;
}

/**
 * The manifest carries absolute file URLs written by the share extension, in a
 * different process. A prefix check against the app's own URL for that same
 * file rejected every real delivery, so do not compare those strings at all:
 * take the file name and resolve it inside this delivery directory — the very
 * directory the manifest was just read from. An attachment then cannot point
 * outside its own share, by construction, whatever either side spells.
 */
function resolveAttachment(dir: Directory, payload: Attachment): Attachment | null {
  const segment = payload.contentUri.split(/[/\\]/).pop() ?? "";
  let name = segment;
  try { name = decodeURIComponent(segment); } catch { /* a malformed escape stays literal */ }
  if (!name || name === "." || name === ".." || name === MANIFEST || /[/\\]/.test(name)) return null;
  const file = new File(dir, name);
  if (!file.exists) return null;
  return { ...payload, value: file.uri, contentUri: file.uri };
}

/** Read only committed deliveries; acknowledging one cannot erase a newer share. */
export async function readShareInbox(): Promise<ShareDelivery[]> {
  if (Platform.OS !== "ios") {
    if (!getSharedPayloads().length) return [];
    return [{ id: "android", payloads: await getResolvedSharedPayloadsAsync(), acknowledge: clearSharedPayloads }];
  }
  const root = inbox();
  if (!root?.exists) return [];
  const deliveries: ShareDelivery[] = [];
  for (const dir of root.list()) {
    if (!(dir instanceof Directory)) continue;
    const manifest = new File(dir, MANIFEST);
    if (!manifest.exists) continue;
    const parsed = z.array(attachment).min(1).max(10).parse(JSON.parse(await manifest.text()));
    const payloads: Attachment[] = [];
    for (const payload of parsed) {
      const resolved = resolveAttachment(dir, payload);
      if (!resolved) throw new Error(UNREADABLE);
      payloads.push(resolved);
    }
    deliveries.push({ id: dir.name, payloads, acknowledge: () => dir.delete() });
  }
  return deliveries;
}

export function hasIncomingShare(): boolean {
  if (Platform.OS !== "ios") return getSharedPayloads().length > 0;
  const root = inbox();
  return Boolean(root?.exists && root.list().some((dir) => dir instanceof Directory && new File(dir, MANIFEST).exists));
}

/** Explicit user cancellation only; staged family queues and source apps are untouched. */
export function discardIncomingShares(): void {
  if (Platform.OS !== "ios") { clearSharedPayloads(); return; }
  const root = inbox();
  if (!root?.exists) return;
  for (const dir of root.list()) {
    if (dir instanceof Directory && new File(dir, MANIFEST).exists) dir.delete();
  }
}
