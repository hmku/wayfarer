import { test, expect } from "@playwright/test";
import { Journal } from "../lib/model";
import {
  open,
  place,
  readJournal,
  resetJournal,
  rows,
  seed,
} from "./app-helpers";

test.afterAll(resetJournal);

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    { ...place("k-tulum", "Tulum", "Mexico"), category: "beach" },
    {
      ...place("k-banff", "Banff", "Canada"),
      category: "nature",
      region: "north-america",
    },
    { ...place("k-paris", "Paris", "France"), category: "city" },
    place("k-oslo", "Oslo", ""),
  ],
};

test("the region is automatic from the country unless one is picked", async ({
  page,
}) => {
  // open() needs a non-empty list; keep the Been tab populated.
  await seed(page, { ...journal, places: [place("k-oslo", "Oslo", "")] });
  await open(page);
  await page.getByRole("button", { name: "Add a destination" }).first().click();
  const dialog = page.getByRole("dialog");
  const region = dialog.getByLabel("Region");
  const shown = region.locator("option:checked");
  await dialog.getByLabel("Destination").fill("Kyoto");
  await expect(dialog.getByRole("radio", { name: "None" })).toBeChecked();
  await dialog.getByText("Beach", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "Beach" })).toBeChecked();
  await dialog.getByLabel("Country").fill("Japan");
  await expect(region).toHaveValue("");
  await expect(shown).toHaveText("Automatic (Asia)");
  await dialog.getByLabel("Country").fill("Kyoto, Peru");
  await expect(shown).toHaveText("Automatic (South America)");
  await dialog.getByLabel("Country").fill("Nowhere");
  await expect(shown).toHaveText("Automatic (from country)");
  await dialog.getByLabel("Country").fill("Japan");
  await dialog.getByRole("button", { name: "Save destination" }).click();

  const details = page.getByRole("dialog", { name: "Kyoto" });
  await expect(details.locator('[data-tag="category"]')).toHaveText("Beach");
  await expect(details.locator('[data-tag="region"]')).toHaveText("Asia");
  let saved = (await readJournal(page)).journal.places.find(
    (p) => p.name === "Kyoto",
  )!;
  expect(saved.category).toBe("beach");
  // A suggested region is not stored; it is inferred from the country.
  expect(saved.region).toBeUndefined();

  // Editing shows the automatic region; a manual pick sticks.
  await details.getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name: "Edit destination" });
  await expect(edit.getByLabel("Region")).toHaveValue("");
  await expect(edit.getByLabel("Region").locator("option:checked")).toHaveText(
    "Automatic (Asia)",
  );
  await edit.getByLabel("Region").selectOption("oceania");
  await edit.getByLabel("Country").fill("Italy");
  await expect(edit.getByLabel("Region")).toHaveValue("oceania");
  await edit.getByText("None", { exact: true }).click();
  await edit.getByRole("button", { name: "Save destination" }).click();
  await expect(page.getByRole("dialog", { name: "Kyoto" })).toBeVisible();
  saved = (await readJournal(page)).journal.places.find(
    (p) => p.name === "Kyoto",
  )!;
  expect(saved.region).toBe("oceania");
  expect(saved.country).toBe("Italy");
  expect(saved.category).toBeUndefined();

  // Choosing Automatic again clears the pick, so it follows the country.
  await page
    .getByRole("dialog", { name: "Kyoto" })
    .getByRole("button", { name: "Edit details" })
    .click();
  const again = page.getByRole("dialog", { name: "Edit destination" });
  await expect(again.getByLabel("Region")).toHaveValue("oceania");
  await again.getByLabel("Region").selectOption("");
  await expect(again.getByLabel("Region").locator("option:checked")).toHaveText(
    "Automatic (Europe)",
  );
  await again.getByRole("button", { name: "Save destination" }).click();
  await expect(page.getByRole("dialog", { name: "Kyoto" })).toBeVisible();
  saved = (await readJournal(page)).journal.places.find(
    (p) => p.name === "Kyoto",
  )!;
  expect(saved.region).toBeUndefined();
});

test("the table shows category and region, and filters by category", async ({
  page,
}) => {
  await seed(page, journal);
  await open(page);
  await expect(rows(page)).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Tulum, Mexico, Beach", exact: true }),
  ).toBeVisible();
  const tulum = rows(page).filter({ hasText: "Tulum" });
  await expect(tulum.locator(".category-icon")).toHaveAttribute(
    "title",
    "Beach",
  );
  await expect(tulum.locator(".location-col")).toHaveText(
    "MexicoNorth America",
  );
  // No country or region: an em dash, as before.
  await expect(
    rows(page).filter({ hasText: "Oslo" }).locator(".location-col"),
  ).toHaveText("—");

  const filter = page.getByLabel("Filter by category");
  await filter.selectOption("beach");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Tulum");
  await filter.selectOption("city");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Paris");

  await page.getByLabel("Search destinations").fill("zzz");
  await expect(page.getByText("No matching destinations")).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filter" }).click();
  await expect(filter).toHaveValue("");
  await expect(rows(page)).toHaveCount(4);

  // The details dialog shows both tags next to the list badge.
  await page.getByRole("button", { name: /^Banff/ }).click();
  const details = page.getByRole("dialog", { name: "Banff" });
  await expect(details.locator(".category-badge")).toHaveText("Been");
  await expect(details.locator('[data-tag="category"]')).toHaveText("Nature");
  await expect(details.locator('[data-tag="region"]')).toHaveText(
    "North America",
  );
});
