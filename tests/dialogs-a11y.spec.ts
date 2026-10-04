import { test, expect, Page } from "@playwright/test";
import { emptyJournal, Journal, Place } from "../lib/model";
import { personalGroups } from "../lib/ranking";

const key = "test-pass";
const origin = `http://localhost:${process.env.E2E_PORT ?? 3001}`;

function place(id: string, status: Place["status"] = "been"): Place {
  return {
    id,
    name: id,
    country: "Europe",
    status,
    date: "",
    notes: "",
    ratings: [null, null],
  };
}

async function seed(page: Page, journal: Journal) {
  const api = page.request;
  expect(
    (
      await api.post("/api/session", { headers: { origin }, data: { key } })
    ).status(),
  ).toBe(200);
  const current = await (await api.get("/api/journal")).json();
  expect(
    (
      await api.put("/api/journal", {
        headers: { origin },
        data: { journal, revision: current.revision },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
}

async function saved(page: Page): Promise<Journal> {
  return (await (await page.request.get("/api/journal")).json()).journal;
}

function rowOrder(page: Page) {
  return page
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.placeId));
}

const handle = (page: Page, id: string) =>
  page.getByRole("button", { name: `Move ${id}`, exact: true });

test("keyboard reorder keeps focus on the moved handle across several moves", async ({
  page,
}) => {
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: ["A", "B", "C", "D", "E"].map((id) => place(id)),
    rankings: [[["A"], ["B"], ["C"], ["D"], ["E"]], []],
  });
  await page.getByRole("button", { name: "Reorder", exact: true }).click();
  await handle(page, "E").focus();
  const expected = [
    ["A", "B", "C", "E", "D"],
    ["A", "B", "E", "C", "D"],
    ["A", "E", "B", "C", "D"],
  ];
  for (const order of expected) {
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => rowOrder(page)).toEqual(order);
    await expect(page.getByRole("status")).toContainText("Ranking saved");
    await expect(handle(page, "E")).toBeFocused();
    await expect(handle(page, "E")).not.toHaveAttribute("aria-disabled");
  }
  // Moving down re-inserts the DOM node, which used to drop focus to <body>.
  for (const order of [
    ["A", "B", "E", "C", "D"],
    ["A", "B", "C", "E", "D"],
  ]) {
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => rowOrder(page)).toEqual(order);
    await expect(handle(page, "E")).toBeFocused();
  }
  expect(personalGroups(await saved(page), 0, "been")).toEqual([
    ["A"],
    ["B"],
    ["C"],
    ["E"],
    ["D"],
  ]);
});

test("keyboard moves past a tie group like drag does", async ({ page }) => {
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: ["A", "B", "C", "D"].map((id) => place(id)),
    rankings: [[["A"], ["B", "C"], ["D"]], []],
  });
  await page.getByRole("button", { name: "Reorder", exact: true }).click();
  await handle(page, "D").press("ArrowUp");
  await expect
    .poll(async () => personalGroups(await saved(page), 0, "been"))
    .toEqual([["A"], ["D"], ["B", "C"]]);
  await expect(handle(page, "D")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => personalGroups(await saved(page), 0, "been"))
    .toEqual([["A"], ["B", "C"], ["D"]]);
  await expect(handle(page, "D")).toBeFocused();
});

test("moving a wishlist place to Been asks for a visit date first", async ({
  page,
}) => {
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [place("B1"), place("W1", "want"), place("W2", "want")],
    rankings: [[["B1"], ["W1"], ["W2"]], []],
  });
  await page.getByRole("tab", { name: /Want to go/ }).click();
  await page.getByRole("button", { name: "W1, Europe", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const moveButton = dialog.getByRole("button", {
    name: "Move to Been",
    exact: true,
  });
  await moveButton.click();
  const date = dialog.getByLabel("Visit date");
  await expect(date).toBeFocused();
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  await expect(date).toHaveValue(today);
  await expect(dialog).toContainText("Personal rankings for this place reset");
  // Escape backs out of the step without closing the dialog.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(moveButton).toBeFocused();
  await moveButton.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog.getByLabel("Visit date")).toHaveCount(0);
  await expect(moveButton).toBeFocused();
  // Nothing was saved by cancelling.
  expect((await saved(page)).places.find((p) => p.id === "W1")?.status).toBe(
    "want",
  );
  await moveButton.click();
  await dialog.getByLabel("Visit date").fill("");
  await dialog.getByRole("button", { name: "Confirm move", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Been/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "W1, Europe", exact: true }),
  ).toBeVisible();
  // Focus returns to the moved place's row on the new tab.
  await expect(
    page.getByRole("button", { name: "W1, Europe", exact: true }),
  ).toBeFocused();
  const journal = await saved(page);
  expect(journal.places.find((p) => p.id === "W1")?.status).toBe("been");
  expect(personalGroups(journal, 0, "want")).toEqual([["W2"]]);
  // Moving back to the wishlist needs no extra step.
  await page.getByRole("button", { name: "W1, Europe", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Move to Want to go", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Want to go/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the chosen visit date is saved when moving to Been", async ({ page }) => {
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [place("B1"), place("W1", "want")],
  });
  await page.getByRole("tab", { name: /Want to go/ }).click();
  await page.getByRole("button", { name: "W1, Europe", exact: true }).click();
  await page.getByRole("button", { name: "Move to Been", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Visit date").fill("2024-03-05");
  await page.getByRole("button", { name: "Confirm move", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const moved = (await saved(page)).places.find((p) => p.id === "W1");
  expect(moved?.status).toBe("been");
  expect(moved?.date).toBe("2024-03-05");
});

test("comparison keyboard shortcuts, announcements, and focus", async ({
  page,
}) => {
  const peers = ["P0", "P1", "P2", "P3", "P4", "P5", "P6"].map((id) =>
    place(id),
  );
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [...peers, place("Target")],
    rankings: [peers.map((p) => [p.id]), []],
  });
  await page
    .getByRole("button", { name: "Target, Europe", exact: true })
    .click();
  const rank = page.getByRole("button", { name: "Rank Alex's rating" });
  await expect(rank).toHaveText("Rank");
  await rank.click();
  const dialog = page.getByRole("dialog");
  const question = dialog.locator(".comparison-question");
  await expect(question).toHaveAttribute("aria-live", "polite");
  await expect(question).toContainText("Comparison 1: Target or P3");
  await expect(dialog.locator(".dialog-shortcuts")).toContainText("Backspace");
  await page.keyboard.press("ArrowRight");
  await expect(question).toContainText("Comparison 2: Target or P5");
  await page.keyboard.press("Backspace");
  await expect(question).toContainText("Comparison 1: Target or P3");
  await page.keyboard.press("ArrowLeft");
  await expect(question).toContainText("Comparison 2: Target or P1");
  await page.keyboard.press("t");
  await expect(
    dialog.getByRole("heading", { name: "Ranking resolved" }),
  ).toBeVisible();
  const save = dialog.getByRole("button", { name: "Save ranking" });
  await expect(save).toBeFocused();
  await expect(dialog.locator(".comparison-result")).toContainText("Tied at");
  await page.keyboard.press("Backspace");
  await expect(question).toContainText("Comparison 2: Target or P1");
  await page.keyboard.press("=");
  await expect(save).toBeFocused();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("ArrowLeft");
  await expect(question).toContainText("Comparison 3: Target or P0");
  await page.keyboard.press("ArrowRight");
  await expect(save).toBeFocused();
  await expect(dialog.locator(".comparison-result")).toContainText("#2");
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("heading", { name: "Target", exact: true }),
  ).toBeVisible();
  expect(personalGroups(await saved(page), 0, "been").slice(0, 3)).toEqual([
    ["P0"],
    ["Target"],
    ["P1"],
  ]);
  // details → compare → details chain: closing returns focus to the row.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Target, Europe", exact: true }),
  ).toBeFocused();
});

test("forms confirm before discarding unsaved changes", async ({ page }) => {
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [place("Lisbon")],
  });
  const prompts: string[] = [];
  let accept = false;
  page.on("dialog", async (d) => {
    prompts.push(d.message());
    if (accept) await d.accept();
    else await d.dismiss();
  });
  const dialog = page.getByRole("dialog");
  const add = page.getByRole("button", {
    name: "Add a destination",
    exact: true,
  });

  // A clean form closes without asking.
  await add.click();
  await expect(dialog.getByLabel("Destination", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(prompts).toEqual([]);
  await expect(add).toBeFocused();

  // List choice defaults to the current tab; the date only shows for Been.
  await page.getByRole("tab", { name: /Want to go/ }).click();
  await add.click();
  await expect(
    dialog.getByRole("heading", { name: "Add a destination" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Want to go")).toBeChecked();
  await expect(dialog.getByLabel("Visit date")).toHaveCount(0);
  await dialog.getByLabel("Been").check();
  await expect(dialog.getByLabel("Visit date")).toBeVisible();

  // Dirty: Escape, backdrop, and the close button all ask first.
  await dialog.getByLabel("Destination", { exact: true }).fill("Kyoto");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toBeVisible();
  expect(prompts).toEqual([
    "Discard your unsaved changes?",
    "Discard your unsaved changes?",
    "Discard your unsaved changes?",
  ]);
  await expect(dialog.getByLabel("Destination", { exact: true })).toHaveValue(
    "Kyoto",
  );
  accept = true;
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect((await saved(page)).places).toHaveLength(1);

  // Edit form: discarding returns to details, then focus returns to the row.
  accept = false;
  await page.getByRole("tab", { name: /Been/ }).click();
  await page.getByRole("button", { name: "Lisbon, Europe", exact: true }).click();
  await dialog.getByRole("button", { name: "Edit details" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Edit destination" }),
  ).toBeVisible();
  await dialog.getByLabel("Notes").fill("Sunset by the river");
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("heading", { name: "Edit destination" }),
  ).toBeVisible();
  accept = true;
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("heading", { name: "Lisbon", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lisbon, Europe", exact: true }),
  ).toBeFocused();
  expect((await saved(page)).places[0].notes).toBe("");

  // Import: a parsed file counts as unsaved; a bad file clears the preview.
  prompts.length = 0;
  accept = false;
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "travel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Destination,Rating 1\nRome,8\n"),
  });
  await expect(dialog).toContainText("1 destinations to add");
  await expect(dialog.getByLabel("Rating — Alex")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(prompts).toHaveLength(1);
  await page.locator("input[type=file]").setInputFiles({
    name: "empty.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Destination\n"),
  });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).not.toContainText("destinations to add");
  await expect(dialog).not.toContainText("travel.csv");
  await expect(
    dialog.getByRole("button", { name: "Refresh journal" }),
  ).toHaveCount(0);
  // Nothing parsed any more, so closing does not ask.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(prompts).toHaveLength(1);
});

test("delete asks for confirmation and can be cancelled", async ({ page }) => {
  await seed(page, {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [place("Rome")],
  });
  await page.getByRole("button", { name: "Rome, Europe", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Delete", exact: true }),
  ).toBeFocused();
  await expect(dialog).not.toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm delete" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Destinations", exact: true }),
  ).toBeFocused();
  expect((await saved(page)).places).toHaveLength(0);
});
