import { test, expect } from "@playwright/test";
import { Journal } from "../lib/model";
import { open, place, seed, resetJournal } from "./app-helpers";

test.afterAll(resetJournal);

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [place("s-lima", "Lima", "Peru"), place("s-cusco", "Cusco", "Peru", "want")],
};

test("keyboard shortcuts and tab arrow navigation", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  const been = page.getByRole("tab", { name: /Been/ });
  const want = page.getByRole("tab", { name: /Want to go/ });
  const search = page.getByLabel("Search destinations");

  await page.keyboard.press("2");
  await expect(want).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("1");
  await expect(been).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  // Typing in the search box never triggers shortcuts.
  await page.keyboard.type("n2");
  await expect(search).toHaveValue("n2");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(been).toHaveAttribute("aria-selected", "true");
  await search.fill("");
  await search.blur();

  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add a destination" });
  await expect(dialog).toBeVisible();
  // Shortcuts are ignored while a dialog is open.
  await page.getByRole("button", { name: "Close dialog" }).focus();
  await page.keyboard.press("2");
  await expect(been).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Tabs: roving tabindex with arrow keys.
  await expect(been).toHaveAttribute("tabindex", "0");
  await expect(want).toHaveAttribute("tabindex", "-1");
  await been.focus();
  await page.keyboard.press("ArrowRight");
  await expect(want).toBeFocused();
  await expect(want).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: /Want to go/ })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(been).toBeFocused();
  await page.keyboard.press("End");
  await expect(want).toBeFocused();

  // Hints are discoverable.
  await expect(
    page.getByRole("button", { name: "Add a destination", exact: true }),
  ).toHaveAttribute("title", /N/);
  await page.getByRole("button", { name: "Journal settings" }).click();
  await expect(page.getByRole("dialog")).toContainText("Keyboard shortcuts");
});

test("brand returns to the top without reloading", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  await page.getByLabel("Search destinations").fill("zzz");
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.getByRole("button", { name: /back to top/ }).click();
  await expect(page.getByLabel("Search destinations")).toHaveValue("");
  expect(
    await page.evaluate(() => (window as unknown as { marker?: number }).marker),
  ).toBe(1);
});
