import { File } from "expo-file-system";

import { apiFetch, apiJson } from "./api";

/**
 * Family member profile photos — the mobile side of the web app's
 * MemberPhotoPicker feature. The "avatars" Storage bucket is private, so a
 * stored `photo_url` is only a path; every screen that shows one needs a
 * short-lived signed URL from the web API, which alone holds the
 * service-role key that can sign it.
 */

export type MemberPhotoAsset = {
  uri: string;
  name: string;
};

/**
 * Batch-resolve signed photo URLs for every member of a family, keyed by
 * member id. Members without an uploaded photo are simply absent from the
 * result — callers fall back to the colored-initial avatar.
 */
export async function fetchMemberPhotoUrls(
  familyId: string,
): Promise<Record<string, string>> {
  try {
    const body = await apiJson<{ urls: Record<string, string> }>(
      `/api/family-members/photos?family_id=${encodeURIComponent(familyId)}`,
    );
    return body.urls;
  } catch {
    // A member's photo is a nice-to-have, not the reason to block the
    // screen — the initial-letter avatar is always a safe fallback.
    return {};
  }
}

/** Uploads (or replaces) a member's photo. Returns a signed URL to render immediately. */
export async function uploadMemberPhoto(
  memberId: string,
  asset: MemberPhotoAsset,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", new File(asset.uri), asset.name);
  const response = await apiFetch(`/api/family-members/${memberId}/photo`, {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as { url: string };
  return body.url;
}

/** Removes a member's photo, if any. */
export async function removeMemberPhoto(memberId: string): Promise<void> {
  await apiFetch(`/api/family-members/${memberId}/photo`, {
    method: "DELETE",
  });
}
