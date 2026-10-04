import { NextResponse } from "next/server";
import {
  authorized,
  configured,
  issueSessionToken,
  passwordMatches,
  sameOrigin,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { clientAddress, NO_STORE, parseObject, readBody } from "@/lib/http";
import { loginLimiter } from "@/lib/login-limiter";

const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

function tooManyAttempts(waitMs: number) {
  const seconds = Math.ceil(waitMs / 1000);
  const minutes = Math.ceil(seconds / 60);
  const response = reply(
    {
      error: `Too many unlock attempts. Wait ${minutes === 1 ? "a minute" : `${minutes} minutes`}, then try again.`,
    },
    429,
  );
  response.headers.set("Retry-After", String(seconds));
  return response;
}

export async function GET() {
  return reply({ authorized: await authorized(), configured: configured() });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request rejected." }, 403);
  if (!configured())
    return reply(
      { error: "The journal owner needs to configure the shared key." },
      503,
    );
  const address = clientAddress(request);
  const wait = loginLimiter.retryAfter(address);
  if (wait > 0) return tooManyAttempts(wait);
  // Oversized or unreadable bodies are treated like a missing key.
  const body = await readBody(request, 1000).then(parseObject, () => null);
  const key = body?.key;
  if (typeof key !== "string" || !key)
    return reply({ error: "Please enter your shared key." }, 400);
  if (key.length > 256 || !passwordMatches(key)) {
    loginLimiter.fail(address);
    return reply(
      { error: "That key does not match. Check it and try again." },
      401,
    );
  }
  loginLimiter.succeed(address);
  const response = reply({ ok: true });
  response.cookies.set(SESSION_COOKIE, issueSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return response;
}
// Clears this device's cookie only. Rotating JOURNAL_KEY revokes all sessions.
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request rejected." }, 403);
  const response = reply({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
