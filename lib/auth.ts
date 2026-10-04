import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
export const SESSION_COOKIE = "wayfarer-session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export function configured() {
  return (
    !!process.env.JOURNAL_KEY &&
    process.env.JOURNAL_KEY.length >= 32 &&
    (process.env.JOURNAL_PASSWORD === undefined ||
      process.env.JOURNAL_PASSWORD.length > 0)
  );
}
function signingSecret() {
  if (!configured())
    throw new Error("Set a random JOURNAL_KEY of at least 32 characters.");
  return process.env.JOURNAL_KEY!;
}
function loginPassword() {
  return process.env.JOURNAL_PASSWORD ?? signingSecret();
}
function hmac(secret: string | Buffer, data: string) {
  return createHmac("sha256", secret).update(data).digest();
}
// Derived from both secrets, so changing either one revokes every session.
function sessionKey() {
  return hmac(signingSecret(), loginPassword());
}
export function passwordMatches(input: string) {
  return timingSafeEqual(hmac(signingSecret(), input), sessionKey());
}
export function issueSessionToken() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${expires}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${hmac(sessionKey(), payload).toString("hex")}`;
}
export async function authorized() {
  if (!configured()) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [expires, nonce, signature] = token.split(".");
  if (
    !expires ||
    !nonce ||
    !signature ||
    !/^\d+$/.test(expires) ||
    Number(expires) < Date.now() / 1000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    hmac(sessionKey(), `${expires}.${nonce}`),
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.host === request.headers.get("host") &&
      (url.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && url.protocol === "http:"))
    );
  } catch {
    return false;
  }
}
