import { requireUser } from "@/lib/auth/require-user";

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
