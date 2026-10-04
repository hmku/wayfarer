import { test, expect } from "@playwright/test";
import { Journal } from "../lib/model";
import { open, place, readJournal, resetJournal, seed } from "./app-helpers";

test.afterAll(resetJournal);

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    { ...place("c-a", "Alpha", "Italy", "been", "2024-05-01"), notes: "Kept", ratings: [9, 7] },
    { ...place("c-b", "Bravo", "France"), ratings: [4, null] },
    { ...place("c-w", "Wish", "Japan", "want"), ratings: [null, 8] },
  ],
  rankings: [[["c-a"], ["c-b"]], [["c-a", "c-b"], ["c-w"]]],
};

test("clearing all ratings leaves every place unrated and keeps details", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Journal settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Clear all ratings" }).click();
  await expect(dialog).toContainText("Clear every rating?");
  // Cancelling saves nothing.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await readJournal(page)).journal.places[0].ratings).toEqual([9, 7]);

  await dialog.getByRole("button", { name: "Clear all ratings" }).click();
  await dialog
    .getByRole("alertdialog")
    .getByRole("button", { name: "Clear all ratings" })
    .click();
  await expect(page.getByRole("status")).toContainText("All ratings cleared");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const saved = (await readJournal(page)).journal;
  expect(saved.rankings).toBeUndefined();
  expect(saved.places).toEqual(
    journal.places.map((p) => ({ ...p, ratings: [null, null] })),
  );
  await expect(page.locator("tbody")).not.toContainText(/\d\.\d/);
});
