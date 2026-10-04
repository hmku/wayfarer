import { test, expect } from "@playwright/test";
import { Journal } from "../lib/model";
import { open, place, readJournal, resetJournal, seed } from "./app-helpers";

test.afterAll(resetJournal);

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [place("r-a", "Accra", "Ghana"), place("r-b", "Bergen", "Norway")],
};

test("a slow focus refresh never overwrites a newer save", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  // Hold the next journal GET until the delete has saved.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let holding = true;
  await page.route("**/api/journal", async (route) => {
    if (route.request().method() !== "GET" || !holding) return route.fallback();
    holding = false;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Accra, Ghana", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("status")).toContainText("Destination deleted");
  expect(holding).toBe(false); // the focus refresh really was in flight
  release();
  await page.waitForTimeout(500);
  await expect(page.getByRole("button", { name: /Accra/ })).toHaveCount(0);
  expect((await readJournal(page)).journal.places).toHaveLength(1);
});

test("non-JSON error responses show a friendly message", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  await page.route("**/api/journal", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 502,
          contentType: "text/html",
          body: "<html>Bad gateway</html>",
        })
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Bergen, Norway", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("dialog").locator(".error")).toContainText(
    "server is unavailable",
  );
});

test("signed-in reloads show a neutral loading state, not the lock form", async ({
  page,
}) => {
  await seed(page, journal);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Opening your journal…" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your shared key")).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Destinations" })).toBeVisible();
});
