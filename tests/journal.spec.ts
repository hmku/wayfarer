import { test, expect, request } from "@playwright/test";
import { emptyJournal } from "../lib/model";
import { validateJournal, Journal } from "../lib/model";
import {
  personalGroups,
  saveRanking,
  scoreMap,
  removeFromGroups,
  insertIntoGroups,
} from "../lib/ranking";
const origin = `http://localhost:${process.env.E2E_PORT || 3001}`;
const key = "test-pass";
async function login(context: import("@playwright/test").APIRequestContext) {
  const response = await context.post("/api/session", {
    headers: { origin },
    data: { key },
  });
  expect(response.status()).toBe(200);
}
test("private API, validation, concurrent edits, and cookie tampering", async ({
  request: api,
}) => {
  expect((await api.get("/api/journal")).status()).toBe(401);
  expect(
    (
      await api.put("/api/journal", {
        data: { journal: emptyJournal(), revision: "new" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await api.post("/api/session", {
        headers: { origin },
        data: { key: "wrong" },
      })
    ).status(),
  ).toBe(401);
  await login(api);
  const cookies = (await api.storageState()).cookies;
  expect(cookies[0].httpOnly).toBe(true);
  expect(cookies[0].sameSite).toBe("Strict");
  const current = await (await api.get("/api/journal")).json();
  expect(current.journal.places).toEqual([]);
  const seed = {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [
      {
        id: "test-lisbon",
        name: "Lisbon",
        country: "Portugal",
        status: "been",
        date: "2025-05-17",
        notes: "Sunset by the river",
        ratings: [9, 8],
      },
    ],
  };
  const [a, b] = await Promise.all([
    api.put("/api/journal", {
      headers: { origin },
      data: { journal: seed, revision: current.revision },
    }),
    api.put("/api/journal", {
      headers: { origin },
      data: { journal: seed, revision: current.revision },
    }),
  ]);
  expect([a.status(), b.status()].sort()).toEqual([200, 409]);
  const fresh = await (await api.get("/api/journal")).json();
  expect(fresh.journal.places[0].name).toBe("Lisbon");
  expect(
    (
      await api.put("/api/journal", {
        headers: { origin },
        data: {
          journal: {
            ...seed,
            places: [{ ...seed.places[0], ratings: [11, 8] }],
          },
          revision: fresh.revision,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.put("/api/journal", {
        headers: { origin: "https://attacker.example" },
        data: { journal: seed, revision: fresh.revision },
      })
    ).status(),
  ).toBe(403);
  const tampered = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      Cookie: `wayfarer-session=${cookies[0].value.slice(0, -1)}x`,
    },
  });
  expect((await tampered.get("/api/journal")).status()).toBe(401);
  await tampered.dispose();
  expect((await api.get("/data/journal.json")).status()).toBe(404);
  expect((await api.get("/.env.local")).status()).toBe(404);
  await api.delete("/api/session", { headers: { origin } });
  expect((await api.get("/api/journal")).status()).toBe(401);
});
test("mobile journal editing, both lists, CSV preview, export, and lock", async ({
  page,
  request: api,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Travel journal" }),
  ).toBeVisible();
  await page.getByLabel("Your shared key").fill(key);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(
    page.getByRole("heading", { name: "Destinations" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: /Lisbon.*Portugal/ }) }),
  ).toContainText("10.0");
  await page.getByRole("tab", { name: "Want to go" }).click();
  await page
    .getByRole("button", { name: "Add a destination", exact: true })
    .click();
  await page.getByLabel("Destination", { exact: true }).fill("Kyoto");
  await page.getByLabel("Country or region").fill("Japan");
  await page.getByLabel("Notes").fill("Gardens in the autumn");
  await page.getByRole("button", { name: "Save destination" }).click();
  await expect(
    page.getByRole("heading", { name: "Kyoto", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: /Kyoto.*Japan/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Destinations" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Want to go" }).click();
  await expect(
    page.getByRole("button", { name: /Kyoto.*Japan/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "travel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Destination,Country,Status,Rating 1,Rating 2,Notes\nKyoto,Japan,Want to go,,,Existing\nRome,Italy,Been,8.5,9,"Art, food, wandering"\nSeoul,South Korea,Want to go,,,Night markets',
    ),
  });
  await expect(
    page.getByText("2 destinations to add · 1 duplicates skipped"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import 2 destinations" }).click();
  await expect(
    page.getByRole("button", { name: /Seoul.*South Korea/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Been/ }).click();
  await expect(page.getByRole("button", { name: /Rome.*Italy/ })).toBeVisible();
  await page.getByRole("button", { name: /Lisbon.*Portugal/ }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Country or region").fill("Portugal Coast");
  await login(api);
  const concurrent = await (await api.get("/api/journal")).json();
  concurrent.journal.places.find(
    (p: { name: string }) => p.name === "Lisbon",
  ).notes = "A note from the other phone";
  expect(
    (
      await api.put("/api/journal", { headers: { origin }, data: concurrent })
    ).status(),
  ).toBe(200);
  // Different fields: the save merges with the partner's note, no conflict.
  await page.getByRole("button", { name: "Save destination" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: /Lisbon.*Portugal/ }) }),
  ).toContainText("5.0");
  await expect(page.getByRole("dialog")).toContainText(
    "A note from the other phone",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Search destinations").fill("no-such-place");
  await expect(
    page.getByRole("heading", { name: "No matching destinations" }),
  ).toBeVisible();
  await page.getByLabel("Search destinations").fill("");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "wayfarer-travel.csv",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/wayfarer-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/wayfarer-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Rome.*Italy/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("button", { name: /Rome.*Italy/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Lock journal", exact: true }).click();
  await expect(page.getByLabel("Your shared key")).toBeVisible();
  expect((await page.request.get("/api/journal")).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("comparison ranking preserves ties, original ratings, categories, and partner order", async ({
  page,
  request: api,
}) => {
  await login(api);
  const current = await (await api.get("/api/journal")).json();
  const seed: Journal = {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [
      ...["A", "B", "C", "D", "E"].map((name, i) => ({
        id: `compare-${name}`,
        name,
        country: "",
        status: "been" as const,
        date: "",
        notes: "Region: Europe",
        ratings: [4 - i, i] as [number, number],
      })),
      {
        id: "compare-wish",
        name: "Wishlist only",
        country: "Asia",
        status: "want",
        date: "",
        notes: "",
        ratings: [4, 4],
      },
    ],
  };
  const initial = personalGroups(seed, 0, "been");
  const reordered = insertIntoGroups(
    removeFromGroups(initial, "compare-E"),
    "compare-E",
    0,
    true,
  );
  const next = saveRanking(seed, seed.places[4], 0, reordered);
  expect(next.places).toEqual(seed.places);
  expect(personalGroups(next, 1, "been")).toEqual(
    personalGroups(seed, 1, "been"),
  );
  expect(scoreMap(next, 0, "been").get("compare-E")).toBe(
    scoreMap(next, 0, "been").get("compare-A"),
  );
  expect(personalGroups(next, 0, "want")).toEqual([["compare-wish"]]);
  expect(() =>
    validateJournal({ ...next, rankings: [[["missing-id"]], []] }),
  ).toThrow("Invalid rankings");
  expect(() =>
    validateJournal({ ...next, rankings: [[["compare-A", "compare-A"]], []] }),
  ).toThrow("Invalid rankings");
  expect(
    (
      await api.put("/api/journal", {
        headers: { origin },
        data: { journal: seed, revision: current.revision },
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Your shared key").fill(key);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Travel summary")).toContainText(
    "1Countries / regions",
  );
  expect(
    await page
      .locator("tbody tr")
      .first()
      .evaluate((row) => row.getBoundingClientRect().height),
  ).toBeLessThan(65);
  await page.getByRole("button", { name: "E, Europe", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("tab")).toHaveCount(0);
  await page.getByRole("button", { name: "Adjust Alex's rating" }).click();
  await expect(page.getByRole("dialog")).not.toContainText("Wishlist only");
  await page.locator(".comparison-choice").filter({ hasText: /^E/ }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator(".comparison-choice").filter({ hasText: /^E/ }).click();
  await page.locator(".comparison-choice").filter({ hasText: /^E/ }).click();
  // The partner saves before the last choice, which saves immediately.
  const concurrent = await (await api.get("/api/journal")).json();
  const partnerGroups = personalGroups(
    concurrent.journal,
    1,
    "been",
  ).toReversed();
  const partner = saveRanking(
    concurrent.journal,
    concurrent.journal.places[0],
    1,
    partnerGroups,
  );
  expect(
    (
      await api.put("/api/journal", {
        headers: { origin },
        data: { journal: partner, revision: concurrent.revision },
      })
    ).status(),
  ).toBe(200);
  // The partner ranked their own list, so this ranking merges cleanly.
  await page.getByRole("button", { name: "Too close to call" }).click();
  await expect(
    page.getByRole("heading", { name: "E", exact: true }),
  ).toBeVisible();
  const saved = (await (await api.get("/api/journal")).json())
    .journal as Journal;
  expect(saved.rankings?.[1]).toEqual(partner.rankings![1]);
  expect(scoreMap(saved, 0, "been").get("compare-E")).toBe(10);
  expect(saved.places.find((p) => p.id === "compare-E")?.ratings).toEqual([
    0, 4,
  ]);
  await page.reload();
  await page.getByRole("button", { name: "E, Europe", exact: true }).click();
  await expect(
    page.locator(".detail-ratings").getByText("10.0", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Move to Want to go", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "Want to go" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "E, Europe", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Been" }).click();
  await expect(
    page.getByRole("button", { name: "E, Europe", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
