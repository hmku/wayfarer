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
  // Rows are sorted by average, highest first.
  await expect(harrison.getByRole("listitem")).toHaveText([
    /Beach\s*8\.3\s*· n = 3/,
    /Nature\s*5\.0\s*· n = 2/,
    /City\s*2\.5\s*· n = 2/,
  ]);
  const maya = panel(page, "Maya, by category");
  await expect(maya).toContainText("Maya’s favourite: Nature (9.2)");
  await expect(maya.getByRole("listitem")).toHaveText([/^Nature/, /^City/, /^Beach/]);
  await expect(panel(page, "Together, by category")).toContainText(
    "Your shared favourite",
  );
  // Lisbon has no category: it is called out and noted as not counted.
  await expect(page.getByText("1 of 8 Been destinations has no category.")).toBeVisible();
  await expect(harrison).toContainText("1 place ranked without a category is not counted.");

  // Regions: rows without ranked places are hidden.
  const harrisonRegions = panel(page, "Harrison, by region");
  await expect(harrisonRegions).toContainText("Harrison’s favourite region: Oceania (8.3)");
  await expect(harrisonRegions.getByRole("listitem")).toHaveText([
    /^Oceania\s*8\.3/,
    /^Caribbean\s*6\.7/,
    /^Europe\s*5\.8/,
    /^Asia\s*5\.0/,
    /^US West Coast\s*3\.3/,
  ]);
  await expect(harrisonRegions).not.toContainText("Africa");
  // Lisbon has a country but no stored region, so it is not counted.
  await expect(page.getByText("1 of 8 has no region yet.", { exact: false })).toBeVisible();
  await expect(harrisonRegions).toContainText("1 place ranked without a region is not counted.");
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
  // The agreement plot stays square and inside the screen.
  const plot = page.getByRole("article", { name: "Agreement plot" });
  await plot.scrollIntoViewIfNeeded();
  const svg = await plot.locator("svg").boundingBox();
  expect(Math.abs(svg!.width - svg!.height)).toBeLessThan(2);
  expect(svg!.x + svg!.width).toBeLessThanOrEqual(390);
  await page.getByRole("article", { name: "Together score spread, by region" }).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});

test("stats plot where the two people agree and disagree", async ({ page }) => {
  await seed(page, statsJournal);
  await open(page);
  await page.getByRole("button", { name: "Stats", exact: true }).click();

  // Seven places are ranked by both (Coral Coast only by Harrison).
  const plot = page.getByRole("article", { name: "Agreement plot" });
  await expect(plot).toContainText("7 places ranked by both");
  const dots = plot.getByRole("img");
  await expect(dots).toHaveCount(7);
  // Dolomites (6.7, 10) and Uluwatu (10, 5) are the Pareto frontier.
  await expect(plot).toContainText("Best mutual picks (outlined, joined by the step line): Dolomites and Uluwatu.");
  await expect(plot.getByRole("img", { name: /best mutual pick/ })).toHaveCount(2);
  // A data table carries every value for screen readers.
  await expect(plot.getByRole("table")).toContainText("Tulum");

  // Hover shows the place and both scores.
  await plot.getByRole("img", { name: /^Rome:/ }).hover();
  const tooltip = plot.locator("[data-tooltip]");
  await expect(tooltip).toContainText("Rome");
  await expect(tooltip).toContainText("City · Europe");
  await expect(tooltip).toContainText("5.0 Harrison");
  await expect(tooltip).toContainText("6.7 Maya");

  // Keyboard: one tab stop, arrows move left to right.
  const first = plot.getByRole("img", { name: /^Tokyo:/ });
  await expect(first).toHaveAttribute("tabindex", "0");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(plot.getByRole("img", { name: /^Lisbon:/ })).toBeFocused();
  await expect(tooltip).toContainText("Lisbon");
  await page.keyboard.press("End");
  await expect(plot.getByRole("img", { name: /^Uluwatu:/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);

  // Biggest gaps first, with who likes each more.
  const gaps = page
    .getByRole("list", { name: "Places by score gap" })
    .getByRole("listitem");
  await expect(gaps).toHaveCount(5);
  await expect(gaps.nth(0)).toContainText("Tulum");
  await expect(gaps.nth(0)).toContainText("Harrison likes it more");
  await expect(gaps.nth(0)).toContainText("Harrison 6.7 · Maya 0.0 · gap 6.7");
  await expect(gaps.nth(1)).toContainText("Banff");
  await expect(gaps.nth(1)).toContainText("Maya likes it more");
  await expect(gaps.nth(2)).toContainText("Uluwatu");

  // Distribution: Together by default, then one person; rows by average.
  const spread = page.getByRole("article", { name: "Together score spread, by category" });
  await expect(spread.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("group", { name: "Whose scores" }).getByRole("button", { name: "Harrison" }).click();
  const harrisonSpread = page.getByRole("article", { name: "Harrison score spread, by category" });
  await expect(harrisonSpread.getByRole("listitem")).toHaveText([/^Beach/, /^Nature/, /^City/]);
  // Beach: Uluwatu, Coral Coast and Tulum.
  await expect(harrisonSpread.getByRole("listitem").first().getByRole("img")).toHaveCount(3);
  await page.getByRole("group", { name: "Whose scores" }).getByRole("button", { name: "Maya" }).click();
  await expect(
    page.getByRole("article", { name: "Maya score spread, by category" }).getByRole("listitem"),
  ).toHaveText([/^Nature/, /^City/, /^Beach/]);
  await expect(
    page.getByRole("article", { name: "Maya score spread, by region" }).getByRole("listitem").last(),
  ).toContainText("Caribbean");

  // The list toggle applies to the plots too: nothing is ranked by both in Want to go.
  await page.getByRole("button", { name: /^Want to go/ }).click();
  await expect(plot).toHaveCount(0);
  await expect(
    page.getByText("Harrison and Maya have not ranked any of the same Want to go places yet."),
  ).toBeVisible();
  await expect(page.getByText("Maya has not ranked any of these places yet.")).toBeVisible();
});
