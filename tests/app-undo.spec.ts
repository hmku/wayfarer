import { test, expect } from "@playwright/test";
import { Journal } from "../lib/model";
import { personalGroups } from "../lib/ranking";
import { open, place, readJournal, rows, seed, writeJournal, resetJournal } from "./app-helpers";

test.afterAll(resetJournal);

/** Both people's orders for both lists, independent of storage layout. */
const orders = (j: Journal) =>
  ([0, 1] as const).flatMap((person) =>
    (["been", "want"] as const).map((status) =>
      personalGroups(j, person, status),
    ),
  );

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    place("u-a", "Alpha", "Italy"),
    place("u-b", "Bravo", "Italy"),
    place("u-c", "Charlie", "France"),
    place("u-d", "Delta", "Spain"),
    place("u-w", "Wish", "Japan", "want"),
  ],
  rankings: [
    [["u-a"], ["u-b", "u-c"], ["u-d"], ["u-w"]],
    [["u-d"], ["u-b"], ["u-a", "u-c"], ["u-w"]],
  ],
};

test("undo restores a deleted place with both rankings", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Bravo, Italy", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("button", { name: "Bravo, Italy" })).toHaveCount(0);
  const status = page.getByRole("status");
  await expect(status).toContainText("Destination deleted");
  await status.getByRole("button", { name: "Undo" }).click();
  await expect(status).toContainText("Bravo restored");
  await expect(page.getByRole("button", { name: "Bravo, Italy" })).toBeVisible();
  const saved = (await readJournal(page)).journal;
  expect(saved.places).toEqual(journal.places);
  expect(orders(saved)).toEqual(orders(journal));
});

test("undo reverses a move, and moving to Been keeps the dialog open", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Alpha, Italy", exact: true }).click();
  await page.getByRole("button", { name: "Move to Want to go" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Want to go/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Move undone");
  await expect(page.getByRole("tab", { name: /Been/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(rows(page).first()).toHaveAttribute("data-place-id", "u-a");
  let saved = (await readJournal(page)).journal;
  expect(saved.places).toEqual(journal.places);
  expect(orders(saved)).toEqual(orders(journal));

  // Moving to Been leaves the details open so it can be ranked right away.
  await page.getByRole("tab", { name: /Want to go/ }).click();
  await page.getByRole("button", { name: "Wish, Japan", exact: true }).click();
  await page.getByRole("button", { name: "Move to Been" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Wish" })).toBeVisible();
  await expect(dialog.locator(".category-badge")).toHaveText("Been");
  await expect(
    dialog.getByRole("button", { name: "Adjust Alex's rating" }),
  ).toHaveText("Rank");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("tab", { name: /Been/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  saved = (await readJournal(page)).journal;
  expect(saved.places.find((p) => p.id === "u-w")?.status).toBe("been");
  // The undo offer survived while the dialog covered it.
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Move undone");
  saved = (await readJournal(page)).journal;
  expect(saved.places.find((p) => p.id === "u-w")?.status).toBe("want");
  expect(orders(saved)).toEqual(orders(journal));
});

test("undo against a stale revision shows the conflict message", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Delta, Spain", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("status")).toContainText("Destination deleted");
  const other = (await readJournal(page)).journal;
  await writeJournal(page, { ...other, people: ["Alex", "Samantha"] });
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".error.banner")).toContainText(
    "Your partner changed",
  );
  expect(
    (await readJournal(page)).journal.places.some((p) => p.id === "u-d"),
  ).toBe(false);
});

test("success notices clear themselves", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Refresh journal" }).click();
  await expect(page.getByRole("status")).toContainText("Journal refreshed");
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 7000 });
});
