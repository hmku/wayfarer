import { test, expect } from "@playwright/test";
import { Journal } from "../lib/model";
import { open, place, rows, seed, resetJournal } from "./app-helpers";

test.afterAll(resetJournal);

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    place("c-rome", "Rome", "Italy", "been", "2023-06-01"),
    place("c-milan", "Milan", "italy", "been", "2021-02-10"),
    place("c-paris", "Paris", "France", "been", "2024-09-12"),
    place("c-bari", "Bari", "Italy", "want"),
    place("c-kyoto", "Kyoto", "Japan", "want"),
  ],
};

test("country breakdown filters the list with a removable chip", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  await expect(page.getByLabel("Travel summary")).toContainText(
    "2Countries / regions",
  );
  await page.getByRole("button", { name: /Countries \/ regions/ }).click();
  const dialog = page.getByRole("dialog", { name: "Countries & regions" });
  const options = dialog.locator(".country-option");
  await expect(options).toHaveCount(3);
  // Grouped case-insensitively and sorted by count.
  await expect(options.first()).toHaveAccessibleName(
    "Italy: 2 been, 1 want to go",
  );
  await options.first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Paris/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /Want to go/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Bari, Italy" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Italy filter" }).click();
  await expect(rows(page)).toHaveCount(2);

  // Choosing a wishlist-only location switches to that list.
  await page.getByRole("tab", { name: /Been/ }).click();
  await page.getByRole("button", { name: /Countries \/ regions/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Japan/ })
    .click();
  await expect(page.getByRole("tab", { name: /Want to go/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(rows(page)).toHaveCount(1);

  // A search with no results offers to clear both search and filter.
  await page.getByLabel("Search destinations").fill("nowhere");
  await expect(
    page.getByRole("heading", { name: "No matching destinations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filter" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator(".filter-chip")).toHaveCount(0);
});

test("visit-date sorts exist only for Been and # follows the sort", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  const sort = page.getByLabel("Sort destinations");
  await sort.selectOption("oldest");
  await expect(rows(page).first()).toHaveAttribute("data-place-id", "c-milan");
  await expect(rows(page).first().locator(".rank-col")).toHaveText("1");
  await sort.selectOption("recent");
  await expect(rows(page).first()).toHaveAttribute("data-place-id", "c-paris");
  await sort.selectOption("country");
  await expect(rows(page).first()).toHaveAttribute("data-place-id", "c-paris");
  await page.getByRole("tab", { name: /Want to go/ }).click();
  await expect(sort.locator("option[value=recent]")).toHaveCount(0);
  await expect(sort.locator("option[value=oldest]")).toHaveCount(0);
  await expect(sort).toHaveValue("country");
});

test("empty list offers next steps", async ({ page }) => {
  await seed(page, { version: 1, people: ["Alex", "Sam"], places: [] });
  await open(page);
  await expect(
    page.getByRole("heading", { name: "No destinations yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import from CSV" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Add a visited place" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add a destination" }),
  ).toBeVisible();
});
