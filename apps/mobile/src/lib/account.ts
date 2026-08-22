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
