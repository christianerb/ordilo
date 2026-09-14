import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ApiError, apiFetch } from "./api";

/**
 * Account deletion (DSGVO Art. 17) via the web API.
 *
 * The route is shared with the web settings page: `DELETE /api/me` with
 * the family name as confirmation. Owners delete the whole family
 * (documents, tasks, members, storage files, auth user); invited members
 * delete only their own account and membership.
 */
export async function deleteFamilyAccount(confirmName: string): Promise<void> {
  const response = await apiFetch("/api/me", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  }).catch((error: unknown) => {
    // apiFetch throws ApiError with the server's German message when the
    // route provided one (e.g. the name mismatch) — keep it verbatim.
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Das hat nicht geklappt. Bitte versuch's nochmal.",
      0,
    );
  });

  // Defensive: apiFetch already rejects non-2xx, so a 200 here means the
  // account is gone. Nothing left to parse.
  void response;
}

/**
 * Download the authenticated account/family export and hand the JSON file to
 * the system share sheet. The temporary plaintext file is removed afterwards,
 * including when sharing is cancelled or fails.
 */
export async function shareAccountDataExport(): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Teilen ist auf diesem Gerät nicht verfügbar.");
  }

  const response = await apiFetch("/api/me/export");
  const json = await response.text();
  const directory = new Directory(Paths.cache, "account-exports");
  directory.create({ intermediates: true, idempotent: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(directory, `ordilo-daten-${date}.json`);

  try {
    file.write(json);
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Ordilo-Daten sichern oder teilen",
      UTI: "public.json",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
