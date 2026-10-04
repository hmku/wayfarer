import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Journal } from "../lib/model";
import { open, place, readJournal, seed, writeJournal, resetJournal } from "./app-helpers";

test.afterAll(resetJournal);

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    place("b-rome", "Rome", "Italy", "been", "2024-04-02"),
    place("b-nice", "Nice", "France"),
    place("b-oslo", "Oslo", "Norway", "want"),
  ],
  rankings: [[["b-nice"], ["b-rome"]], [["b-rome", "b-nice"]]],
};

test("download a JSON backup and restore it over a changed journal", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Journal settings" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^wayfarer-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(backup).toEqual((await readJournal(page)).journal);
  expect(backup.rankings).toEqual(journal.rankings);
  await page.getByRole("button", { name: "Close dialog" }).click();

  // The journal changes after the backup was taken.
  await writeJournal(page, {
    version: 1,
    people: ["Alex", "Sam"],
    places: [place("b-new", "Porto", "Portugal")],
  });
  await page.getByRole("button", { name: "Refresh journal" }).click();
  await expect(page.getByRole("button", { name: /Porto/ })).toBeVisible();

  await page.getByRole("button", { name: "Journal settings" }).click();
  const dialog = page.getByRole("dialog");
  // Invalid files are rejected inside the dialog.
  await dialog.getByLabel("Restore from backup").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version": 1, "people": ["A"]}'),
  });
  await expect(dialog.getByRole("alert")).toContainText("can't be restored");
  await dialog.getByLabel("Restore from backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const confirm = dialog.locator(".restore-confirm");
  await expect(confirm).toContainText("Replace everything?");
  await expect(confirm).toContainText("1 destination (1 been, 0 want to go)");
  await expect(confirm).toContainText("3 destinations (2 been, 1 want to go)");
  await confirm.getByRole("button", { name: "Replace journal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("restored from backup");
  await expect(page.getByRole("button", { name: /Rome, Italy/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Porto/ })).toHaveCount(0);
  const restored = (await readJournal(page)).journal;
  expect(restored).toEqual(backup);
});

test("settings errors stay in the settings dialog", async ({ page }) => {
  await seed(page, journal);
  await open(page);
  await page.getByRole("button", { name: "Journal settings" }).click();
  // Someone else saves first: the names save hits a stale revision.
  const latest = (await readJournal(page)).journal;
  await writeJournal(page, { ...latest, people: ["Alexa", "Sam"] });
  await page.getByLabel("First person").fill("Al");
  await page.getByRole("button", { name: "Save names" }).click();
  // Shown once, inside the dialog — not repeated in the page banner.
  await expect(page.locator(".error")).toHaveCount(1);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Your partner changed",
  );
});
