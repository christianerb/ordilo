import { exportFamilyData } from "@/lib/account/export-family-data";
import { FRIENDLY_ERROR } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/require-user";

/**
 * GET /api/me/export
 *
 * Downloads a portable JSON snapshot of the caller's account and currently
 * accessible family data. The export intentionally contains no storage paths,
 * signed URLs, invite/feed tokens, encrypted secrets or service credentials.
 */
export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  try {
    const data = await exportFamilyData(auth.user);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="ordilo-daten-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[me/export] Data export failed:", error);
    return Response.json(
      { success: false, error: FRIENDLY_ERROR },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
