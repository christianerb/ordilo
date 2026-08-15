import { createClient as createAdminClient } from "@/lib/supabase/admin";

/**
 * Member photo URLs.
 *
 * Server-side only: this module uses the service-role admin client, which
 * must never reach the browser bundle.
 */

/** How long member photo signed URLs stay valid, in seconds. */
export const PHOTO_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Resolve short-lived signed URLs for every member that has an uploaded
 * photo, keyed by member id.
 *
 * The avatars bucket is private, so a stored `photo_url` is a storage
 * path, not something an <img> can load. Failures are non-critical: a
 * member without a resolved URL simply falls back to the colored-initial
 * avatar, so callers never need an error state for this.
 */
export async function resolveMemberPhotoUrls(
  members: { id: string; photo_url: string | null }[],
): Promise<Record<string, string>> {
  const withPhoto = members.filter((m) => m.photo_url);
  if (withPhoto.length === 0) return {};

  const adminClient = createAdminClient();
  const paths = withPhoto.map((m) => m.photo_url as string);
  const { data } = await adminClient.storage
    .from("avatars")
    .createSignedUrls(paths, PHOTO_SIGNED_URL_TTL_SECONDS);

  const urls: Record<string, string> = {};
  if (data) {
    for (let i = 0; i < withPhoto.length; i++) {
      const signedUrl = data[i]?.signedUrl;
      if (signedUrl) urls[withPhoto[i].id] = signedUrl;
    }
  }
  return urls;
}
