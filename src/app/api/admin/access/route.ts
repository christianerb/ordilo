import { getCodeEligibleAdmin, createAdminSessionValue, adminSessionCookie, verifyAdminAccessCode } from "@/lib/admin/access";
import {
  isAdminCodeRateLimited,
  recordFailedAdminCodeAttempt,
} from "@/lib/admin/rate-limit";

const ACCESS_DENIED = {
  error: "Zugang konnte nicht bestätigt werden.",
  code: "ADMIN_ACCESS_DENIED",
};

export async function POST(request: Request): Promise<Response> {
  const admin = await getCodeEligibleAdmin();
  if (!admin) {
    return Response.json(ACCESS_DENIED, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const code =
    body &&
    typeof body === "object" &&
    "code" in body &&
    typeof body.code === "string"
      ? body.code
      : "";

  if (!code || code.length > 256 || (await isAdminCodeRateLimited(admin.id))) {
    return Response.json(ACCESS_DENIED, { status: 403 });
  }

  if (!verifyAdminAccessCode(code)) {
    await recordFailedAdminCodeAttempt(admin.id);
    return Response.json(ACCESS_DENIED, { status: 403 });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${adminSessionCookie.name}=${createAdminSessionValue(admin.id)}; Path=${adminSessionCookie.options.path}; Max-Age=${adminSessionCookie.maxAge}; HttpOnly; SameSite=Strict${
      adminSessionCookie.options.secure ? "; Secure" : ""
    }`,
  );
  return response;
}

export async function DELETE(): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${adminSessionCookie.name}=; Path=${adminSessionCookie.options.path}; Max-Age=0; HttpOnly; SameSite=Strict${
      adminSessionCookie.options.secure ? "; Secure" : ""
    }`,
  );
  return response;
}
