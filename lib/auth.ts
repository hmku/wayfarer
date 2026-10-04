import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
export const COOKIE = "wayfarer-session";
export function configured() {
  return (
    !!process.env.JOURNAL_KEY &&
    process.env.JOURNAL_KEY.length >= 32 &&
    (process.env.JOURNAL_PASSWORD === undefined ||
      process.env.JOURNAL_PASSWORD.length > 0)
  );
}
function key() {
  if (!configured())
    throw new Error("Set a random JOURNAL_KEY of at least 32 characters.");
  return process.env.JOURNAL_KEY!;
}
function password() {
  return process.env.JOURNAL_PASSWORD ?? key();
}
function sessionKey() {
  return createHmac("sha256", key()).update(password()).digest();
}
export function matches(input: string) {
  const a = createHmac("sha256", key()).update(input).digest();
  const b = createHmac("sha256", key()).update(password()).digest();
  return timingSafeEqual(a, b);
}
export function issue() {
  const payload = `${Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${createHmac("sha256", sessionKey()).update(payload).digest("hex")}`;
}
export async function authorized() {
  if (!configured()) return false;
  const token = (await cookies()).get(COOKIE)?.value;
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
  const expected = createHmac("sha256", sessionKey())
    .update(`${expires}.${nonce}`)
    .digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
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
