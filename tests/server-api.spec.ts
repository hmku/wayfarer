import { test, expect } from "@playwright/test";
import { createLoginLimiter } from "../lib/login-limiter";

const key = "test-pass";

test("login limiter backs off per address and globally", () => {
  const limiter = createLoginLimiter({
    lockoutAfter: 3,
    baseDelayMs: 1000,
    maxDelayMs: 4000,
    globalMax: 7,
    globalWindowMs: 60_000,
  });
  const t = 1_000_000;
  limiter.fail("a", t);
  limiter.fail("a", t);
  expect(limiter.retryAfter("a", t)).toBe(0);
  limiter.fail("a", t);
  expect(limiter.retryAfter("a", t)).toBe(1000);
  expect(limiter.retryAfter("b", t)).toBe(0);
  limiter.fail("a", t + 1000);
  expect(limiter.retryAfter("a", t + 1000)).toBe(2000);
  limiter.fail("a", t + 3000);
  limiter.fail("a", t + 7000);
  expect(limiter.retryAfter("a", t + 7000)).toBe(4000);
  expect(limiter.retryAfter("b", t + 7000)).toBe(0);
  // Seven failures in the window block every address until the oldest expires.
  limiter.fail("c", t + 8000);
  expect(limiter.retryAfter("b", t + 8000)).toBe(52_000);
  expect(limiter.retryAfter("b", t + 61_000)).toBe(0);
  limiter.succeed("a");
  expect(limiter.retryAfter("a", t + 61_000)).toBe(0);
});

test("session API: no-store, 429 after repeated failures, body limits", async ({
  request: api,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  // A dedicated address keeps this lockout away from other tests' logins.
  const headers = { origin, "x-forwarded-for": "203.0.113.77" };
  const status = await api.get("/api/session");
  expect(status.headers()["cache-control"]).toBe("private, no-store");

  for (let i = 0; i < 5; i++) {
    const wrong = await api.post("/api/session", {
      headers,
      data: { key: `wrong-${i}` },
    });
    expect(wrong.status()).toBe(401);
    expect(wrong.headers()["cache-control"]).toBe("private, no-store");
  }
  const blocked = await api.post("/api/session", { headers, data: { key } });
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await blocked.json()).error).toContain("Too many unlock attempts");

  const other = { origin, "x-forwarded-for": "203.0.113.78" };
  const ok = await api.post("/api/session", { headers: other, data: { key } });
  expect(ok.status()).toBe(200);
  expect(ok.headers()["cache-control"]).toBe("private, no-store");

  const oversized = await api.post("/api/session", {
    headers: { ...other, "content-type": "application/json" },
    data: JSON.stringify({ key, padding: "x".repeat(2000) }),
  });
  expect(oversized.status()).toBe(400);
});

test("journal API rejects non-object bodies with 400 and counts bytes", async ({
  request: api,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const headers = {
    origin,
    "x-forwarded-for": "203.0.113.79",
    "content-type": "application/json",
  };
  expect(
    (await api.post("/api/session", { headers, data: { key } })).status(),
  ).toBe(200);
  for (const body of ["null", "42", '"text"', "[]", "{not json"]) {
    const response = await api.put("/api/journal", { headers, data: body });
    expect(response.status(), body).toBe(400);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  // 700k three-byte characters: under 2M characters, over 2 MB.
  const wide = JSON.stringify({ journal: { notes: "€".repeat(700_000) } });
  expect(wide.length).toBeLessThan(2_000_000);
  expect(
    (await api.put("/api/journal", { headers, data: wide })).status(),
  ).toBe(413);
});
