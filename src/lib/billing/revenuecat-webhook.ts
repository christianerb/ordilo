import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRevenueCatSignature(
  body: string,
  header: string,
  secret: string,
  nowSeconds = Date.now() / 1_000,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (
    !timestamp ||
    !signature ||
    !/^\d+$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
