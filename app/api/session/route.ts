import { NextResponse } from "next/server";
import {
  authorized,
  configured,
  COOKIE,
  issue,
  matches,
  sameOrigin,
} from "@/lib/auth";
export async function GET() {
  return NextResponse.json(
    { authorized: await authorized(), configured: configured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  if (!configured())
    return NextResponse.json(
      { error: "The journal owner needs to configure the shared key." },
      { status: 503 },
    );
  try {
    if (Number(request.headers.get("content-length")) > 1000) throw new Error();
    const { key } = await request.json();
    if (typeof key !== "string" || key.length > 256 || !matches(key))
      return NextResponse.json(
        { error: "That key does not match. Check it and try again." },
        { status: 401 },
      );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE, issue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Please enter your shared key." },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
