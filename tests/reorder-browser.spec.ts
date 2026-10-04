import { test, expect, Page } from "@playwright/test";
import { emptyJournal, Journal, Place } from "../lib/model";
import { personalGroups } from "../lib/ranking";
const key = "test-pass";
const origin = `http://localhost:${process.env.E2E_PORT || 3001}`;
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
async function mouseMove(
  page: Page,
  target: string,
  anchor: string,
  side: "before" | "after",
) {
  const from = await page
    .getByRole("button", { name: `Move ${target}`, exact: true })
    .boundingBox();
  const to = await page.locator(`tr[data-place-id="${anchor}"]`).boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    to!.x + 35,
    to!.y + (side === "before" ? 5 : to!.height - 5),
    { steps: 12 },
  );
  await page.mouse.up();
}

test("drag, touch, and keyboard reorder persist independently and reject stale edits", async ({
  page,
  browser,
}) => {
  const journal: Journal = {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [
      place("A"),
      place("B"),
      place("C"),
      place("W1", "want"),
      place("W2", "want"),
    ],
    rankings: [
      [["A"], ["B"], ["C"], ["W1"], ["W2"]],
      [["C"], ["B"], ["A"], ["W2"], ["W1"]],
    ],
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, journal);
  await page.getByRole("button", { name: "Reorder", exact: true }).click();
  await expect(page.getByLabel("Reorder ranking for")).toHaveValue("first");
  await mouseMove(page, "C", "A", "before");
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "data-place-id",
    "C",
  );
  let saved = (await (await page.request.get("/api/journal")).json())
    .journal as Journal;
  expect(personalGroups(saved, 0, "been")).toEqual([["C"], ["A"], ["B"]]);
  expect(saved.rankings?.[1]).toEqual(journal.rankings![1]);
  expect(personalGroups(saved, 0, "want")).toEqual([["W1"], ["W2"]]);
  await page
    .getByRole("button", { name: "Move C", exact: true })
    .press("ArrowDown");
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "data-place-id",
    "A",
  );
  await page.reload();
  await page.getByRole("button", { name: "Reorder", exact: true }).click();
  await expect(page.locator("tbody tr").nth(1)).toHaveAttribute(
    "data-place-id",
    "C",
  );
  const current = await (await page.request.get("/api/journal")).json();
  current.journal.places[0].notes = "Changed on another device";
  expect(
    (
      await page.request.put("/api/journal", {
        headers: { origin },
        data: current,
      })
    ).status(),
  ).toBe(200);
  // A note edited elsewhere doesn't block a ranking move: they merge.
  await mouseMove(page, "B", "A", "before");
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "data-place-id",
    "B",
  );
  saved = (await (await page.request.get("/api/journal")).json()).journal;
  expect(saved.places[0].notes).toBe("Changed on another device");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const touch = await context.newPage();
  await touch.goto(origin);
  await touch.getByRole("button", { name: "Reorder", exact: true }).click();
  await touch.getByLabel("Reorder ranking for").selectOption("second");
  const from = await touch
    .getByRole("button", { name: "Move A", exact: true })
    .boundingBox();
  const to = await touch.locator('tr[data-place-id="C"]').boundingBox();
  const cdp = await context.newCDPSession(touch);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from!.x + 20, y: from!.y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: to!.x + 20, y: to!.y + 5 }],
  });
  await expect(touch.locator(".drag-ghost")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(touch.locator("tbody tr").first()).toHaveAttribute(
    "data-place-id",
    "A",
  );
  const afterTouch = (
    await (await touch.request.get(origin + "/api/journal")).json()
  ).journal;
  expect(afterTouch.rankings[0]).toEqual(saved.rankings![0]);
  expect(personalGroups(afterTouch, 1, "been")).toEqual([["A"], ["C"], ["B"]]);
  expect(
    await touch.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await touch.screenshot({ path: "/tmp/wayfarer-reorder-mobile.png" });
  await context.close();
});

test("comparisons continue past three until the exact position resolves", async ({
  page,
}) => {
  const peers = Array.from({ length: 64 }, (_, i) =>
    place(`P${String(i).padStart(2, "0")}`),
  );
  const journal: Journal = {
    ...emptyJournal(),
    people: ["Alex", "Sam"],
    places: [...peers, place("Target")],
    rankings: [peers.map((p) => [p.id]), []],
  };
  await seed(page, journal);
  await page
    .getByRole("button", { name: "Target, Europe", exact: true })
    .click();
  await page.getByRole("button", { name: "Rank Alex's rating" }).click();
  const choices: string[] = [];
  while (await page.locator(".comparison-choice").count()) {
    expect(choices.length).toBeLessThan(8);
    choices.push(await page.locator(".comparison-choice").nth(1).innerText());
    await page
      .locator(".comparison-choice")
      .filter({ hasText: /^Target/ })
      .click();
  }
  expect(choices.length).toBe(7);
  expect(new Set(choices).size).toBe(choices.length);
  // The final choice saves immediately and returns to the details.
  await expect(
    page.getByRole("heading", { name: "Target", exact: true }),
  ).toBeVisible();
  const saved = (await (await page.request.get("/api/journal")).json()).journal;
  expect(personalGroups(saved, 0, "been")[0]).toEqual(["Target"]);
});
