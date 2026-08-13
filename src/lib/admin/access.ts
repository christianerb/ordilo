import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const ADMIN_SESSION_COOKIE = "ordilo_admin_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function sessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && configuredAdminEmails().has(email.trim().toLowerCase()));
}

export function verifyAdminAccessCode(code: string): boolean {
  const expected = process.env.ADMIN_ACCESS_CODE;
  return Boolean(expected && code && safeEqual(code, expected));
}

export function createAdminSessionValue(userId: string): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured securely.");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${Buffer.from(payload).toString("base64url")}.${signature(payload, secret)}`;
}

export function readAdminSession(value: string | undefined, userId: string): boolean {
  const secret = sessionSecret();
  if (!value || !secret) return false;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;

  const encodedPayload = value.slice(0, separator);
  const receivedSignature = value.slice(separator + 1);
  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return false;
  }

  const [sessionUserId, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (
    sessionUserId !== userId ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(receivedSignature, signature(payload, secret));
}

async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the logged-in, allowlisted admin before the second-factor check.
 * Call this only from the access-code form endpoint.
 */
export async function getCodeEligibleAdmin(): Promise<User | null> {
  const user = await currentUser();
  return user && isAllowedAdminEmail(user.email) ? user : null;
}

/**
 * Requires both the authenticated, allowlisted user and their current
 * signed second-factor session. Use this at every admin page/API boundary.
 */
export async function getVerifiedAdmin(): Promise<User | null> {
  const user = await getCodeEligibleAdmin();
  if (!user) return null;

  const cookieStore = await cookies();
  return readAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value, user.id)
    ? user
    : null;
}

export const adminSessionCookie = {
  name: ADMIN_SESSION_COOKIE,
  maxAge: SESSION_MAX_AGE_SECONDS,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    // The guard is shared by /admin pages and /api/admin endpoints.
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
};
