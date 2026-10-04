import { test, expect, Page } from "@playwright/test";
import { open, place, resetJournal, seed } from "./app-helpers";
import { statsJournal } from "./stats-fixtures";

test.afterAll(resetJournal);

const panel = (page: Page, name: string) =>
  page.getByRole("article", { name, exact: true });

test("stats show each person's category and region preferences", async ({
  page,
}) => {
  await seed(page, statsJournal);
  await open(page);
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  const heading = page.getByRole("heading", { name: "Stats", level: 1 });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("button", { name: "Stats", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The list is hidden, not shown alongside.
  await expect(page.getByRole("heading", { name: "Destinations", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: /^Been/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const harrison = panel(page, "Harrison, by category");
  await expect(harrison).toContainText("Harrison’s favourite: Beach (8.3)");
  await expect(harrison.getByRole("listitem")).toHaveText([
    /City\s*2\.5\s*· n = 2/,
    /Nature\s*5\.0\s*· n = 2/,
    /Beach\s*8\.3\s*· n = 3/,
  ]);
  await expect(panel(page, "Maya, by category")).toContainText(
    "Maya’s favourite: Nature (9.2)",
  );
  await expect(panel(page, "Together, by category")).toContainText(
    "Your shared favourite",
  );
  // Lisbon has no category: it is called out and noted as not counted.
  await expect(page.getByText("1 of 8 Been destinations has no category.")).toBeVisible();
  await expect(harrison).toContainText("1 place ranked without a category is not counted.");

  // Regions: rows without ranked places are hidden.
  const harrisonRegions = panel(page, "Harrison, by region");
  await expect(harrisonRegions).toContainText("Harrison’s favourite region: Oceania (8.3)");
  await expect(harrisonRegions.getByRole("listitem")).toHaveCount(4);
  await expect(harrisonRegions).not.toContainText("Africa");
  // Maya never ranked the Fiji place, the only Oceania one.
  await expect(panel(page, "Maya, by region")).not.toContainText("Oceania");

  // Want to go: little data, so no favourites are claimed.
  await page.getByRole("button", { name: /^Want to go/ }).click();
  await expect(page.getByRole("button", { name: /^Want to go/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel(page, "Harrison, by category")).toContainText(
    "Rank places in another category to compare.",
  );
  await expect(panel(page, "Maya, by category")).toContainText(
    "No ranked places with a category yet.",
  );

  // The list toggle follows the list shortcuts; search is not reachable.
  await page.keyboard.press("1");
  await expect(page.getByRole("button", { name: /^Been/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search destinations")).not.toBeFocused();

  // Back to the list, which kept the chosen tab.
  await page.getByRole("button", { name: "Back to list" }).click();
  const listHeading = page.getByRole("heading", { name: "Destinations", exact: true });
  await expect(listHeading).toBeFocused();
  await expect(page.getByRole("tab", { name: /Been/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // S toggles the view from the keyboard.
  await page.keyboard.press("s");
  await expect(heading).toBeFocused();
  await page.keyboard.press("s");
  await expect(listHeading).toBeFocused();
  await expect(heading).toHaveCount(0);
});

test("stats explain what to do when there is nothing to show", async ({ page }) => {
  await seed(page, {
    version: 1,
    people: ["Alex", "Sam"],
    places: [place("se-lima", "Lima", "Peru")],
  });
  await open(page);
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing ranked yet" })).toBeVisible();
  await page.getByRole("button", { name: /^Want to go/ }).click();
  await expect(
    page.getByRole("heading", { name: "No Want to go destinations yet" }),
  ).toBeVisible();
  // The brand also returns to the list.
  await page.getByRole("button", { name: /back to top/ }).click();
  await expect(page.getByRole("heading", { name: "Destinations", exact: true })).toBeVisible();
});

test("stats fit a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, statsJournal);
  await open(page);
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(panel(page, "Together, by region")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Panels stack: each is nearly the full width of the screen.
  const box = await panel(page, "Harrison, by category").boundingBox();
  expect(box!.width).toBeGreaterThan(330);
});
