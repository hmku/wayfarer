// Request helpers shared by the API routes.
export const NO_STORE = { "Cache-Control": "private, no-store" };

export class BodyTooLarge extends Error {}

// Reads at most maxBytes of the body as UTF-8 text. Content-Length is only a
// hint: it can be missing or wrong, so the stream itself is counted.
export async function readBody(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) throw new BodyTooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Parses a JSON object body; null for invalid JSON, arrays, or primitives.
export function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Best-effort client address. Vercel sets these headers itself; without a
// trusted proxy they can be spoofed, which is why logins also have a global
// limit.
export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return (
    forwarded?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
  );
}
