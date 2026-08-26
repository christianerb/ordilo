/**
 * GET /.well-known/assetlinks.json
 *
 * Android Digital Asset Links. The app's intent filter for
 * https://(www.)ordilo.de/invite/* requests `autoVerify`, and Android
 * verifies it against this file: package name plus the SHA-256
 * fingerprints of the signing certificates (upload keystore and, on
 * Play, the Play App Signing certificate — comma-separated).
 *
 * Served only when ANDROID_SHA256_CERT_FINGERPRINTS is configured;
 * without fingerprints verification can never succeed, so the route
 * 404s and Android keeps its previous behaviour (browser/chooser).
 */
export async function GET(): Promise<Response> {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((fingerprint) => fingerprint.trim())
    .filter((fingerprint) => fingerprint.length > 0);

  if (fingerprints.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.ordilo.app",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { status: 200 },
  );
}
