import { requireUser } from "@/lib/auth/require-user";
import { deleteFamilyAccountData } from "@/lib/account/delete-family-account";
import { FRIENDLY_ERROR } from "@/lib/actions/result";

/**
 * Minimal protected API route.
 *
 * Returns the authenticated user's identity, or a structured 401 error when
 * called without a valid session. This demonstrates the API auth guard and
 * gives validators an endpoint to test the "unauthenticated → 401" contract.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  return Response.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
    },
  });
}

/**
 * DELETE /api/me
 *
 * Deletes the authenticated user's family and account (DSGVO Art. 17 —
 * right to erasure). Used by the mobile app, which cannot call server
 * actions. The body must confirm the deletion with the exact family name:
 *
 *   { "confirmName": "Familie Müller" }
 *
 * The heavy lifting lives in `deleteFamilyAccountData`, shared with the
 * `/familie` server action, so both entry points behave identically.
 */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "Ungültige Anfrage." },
        { status: 400 },
      );
    }

    const confirmName = (body as { confirmName?: unknown })?.confirmName;
    if (typeof confirmName !== "string") {
      return Response.json(
        { success: false, error: "Ungültige Anfrage." },
        { status: 400 },
      );
    }

    const result = await deleteFamilyAccountData(auth.user, confirmName);
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    console.error("[me] Account deletion failed:", err);
    return Response.json(
      { success: false, error: FRIENDLY_ERROR },
      { status: 500 },
    );
  }
}
