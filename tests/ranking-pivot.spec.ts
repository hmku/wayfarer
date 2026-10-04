import { test, expect } from "@playwright/test";
import { emptyJournal, Journal, Place } from "../lib/model";
import { Category } from "../lib/regions";
import {
  Bounds,
  choosePivot,
  Groups,
  insertIntoGroups,
  personalGroups,
} from "../lib/ranking";
import { open, place, resetJournal, seed } from "./app-helpers";

type Cat = Category | undefined;

// Groups of singletons "g0".."g{n-1}" with the given categories.
function setup(cats: Cat[][]) {
  const groups: Groups = cats.map((g, i) =>
    g.map((_, j) => (g.length === 1 ? `g${i}` : `g${i}${"abc"[j]}`)),
  );
  const byId = new Map<string, { category?: Category }>();
  groups.forEach((g, i) =>
    g.forEach((id, j) => byId.set(id, { category: cats[i][j] })),
  );
  return { groups, byId };
}

const singles = (cats: Cat[]) => setup(cats.map((c) => [c]));
const oldMid = (b: Bounds) => Math.floor((b.low + b.high) / 2);

test("prefers a same-category group near the midpoint while the range is wide", () => {
  // Midpoint of [0, 8) is 4; the nearest beach groups are 3 and 6.
  const { groups, byId } = singles([
    "city",
    "city",
    "city",
    "beach",
    "city",
    "city",
    "beach",
    "beach",
  ]);
  expect(
    choosePivot(groups, { low: 0, high: 8 }, { category: "beach" }, byId),
  ).toEqual({ index: 3, peerId: "g3" });
  // Equal distance on both sides: the higher-ranked (lower index) wins.
  const tied = singles([
    "beach",
    "city",
    "city",
    "beach",
    "city",
    "beach",
    "city",
    "beach",
  ]);
  expect(
    choosePivot(
      tied.groups,
      { low: 0, high: 8 },
      { category: "beach" },
      tied.byId,
    ),
  ).toEqual({ index: 3, peerId: "g3" });
});

test("uses a same-category member of a tie group as the peer", () => {
  const { groups, byId } = setup([
    ["beach"],
    ["beach"],
    ["city", "beach"],
    ["city"],
    ["city", "city"],
  ]);
  expect(
    choosePivot(groups, { low: 0, high: 5 }, { category: "beach" }, byId),
  ).toEqual({ index: 2, peerId: "g2b" });
});

test("ignores same-category groups outside the middle half of the range", () => {
  // Beach only at the extremes: radius floor(8/4) = 2 around 4 misses them.
  const { groups, byId } = singles([
    "beach",
    "beach",
    "city",
    "city",
    "city",
    "city",
    "city",
    "beach",
  ]);
  expect(
    choosePivot(groups, { low: 0, high: 8 }, { category: "beach" }, byId),
  ).toEqual({ index: 4, peerId: "g4" });
});

test("compares against any category once the range is narrowed", () => {
  const { groups, byId } = singles([
    "beach",
    "beach",
    "city",
    "city",
    "beach",
    "city",
  ]);
  // [2, 4) spans 2 groups → narrowed → plain midpoint 3 (a city).
  expect(
    choosePivot(groups, { low: 2, high: 4 }, { category: "beach" }, byId),
  ).toEqual({ index: 3, peerId: "g3" });
  // [2, 5) spans 3 → still wide, but radius floor(3/4) = 0 keeps midpoint 3.
  expect(
    choosePivot(groups, { low: 2, high: 5 }, { category: "beach" }, byId),
  ).toEqual({ index: 3, peerId: "g3" });
});

test("falls back to the midpoint when too few places share the category", () => {
  const { groups, byId } = singles([
    "city",
    "city",
    "beach",
    "city",
    "city",
    "city",
    "beach",
    "city",
  ]);
  expect(
    choosePivot(groups, { low: 0, high: 8 }, { category: "beach" }, byId),
  ).toEqual({ index: 4, peerId: "g4" });
  // ...but still prefers a same-category member inside the midpoint group.
  const tie = setup([
    ["city"],
    ["city"],
    ["city", "beach"],
    ["city"],
    ["beach"],
  ]);
  expect(
    choosePivot(
      tie.groups,
      { low: 0, high: 5 },
      { category: "beach" },
      tie.byId,
    ),
  ).toEqual({ index: 2, peerId: "g2b" });
});

test("without a target category the pivot is the old midpoint and first member", () => {
  for (let n = 1; n <= 12; n++) {
    const { groups, byId } = setup(
      Array.from({ length: n }, (_, i) =>
        i % 2 ? ["beach", "city"] : ["city"],
      ),
    );
    for (let low = 0; low < n; low++)
      for (let high = low + 1; high <= n; high++) {
        const bounds = { low, high };
        expect(choosePivot(groups, bounds, {}, byId)).toEqual({
          index: oldMid(bounds),
          peerId: groups[oldMid(bounds)][0],
        });
      }
  }
});

// Explores every possible answer sequence. Each leaf must be a position
// consistent with every answer given, every position must be reachable
// exactly once, and the depth must stay logarithmic.
function explore(
  groups: Groups,
  byId: Map<string, { category?: Category }>,
  category: Cat,
) {
  const n = groups.length;
  const outcomes: string[] = [];
  let maxDepth = 0;
  type Answer = {
    index: number;
    peerId: string;
    winner: "target" | "peer" | "tie";
  };
  // Plain checks: Playwright's expect is too slow for ~10^6 calls.
  const check = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`${what} (groups ${JSON.stringify(groups)})`);
  };
  const walk = (bounds: Bounds, answers: Answer[]) => {
    maxDepth = Math.max(maxDepth, answers.length);
    check(answers.length <= n + 1, "too many comparisons");
    const last = answers.at(-1);
    if (last?.winner === "tie" || bounds.low === bounds.high) {
      const tied = last?.winner === "tie";
      const position = tied ? last!.index : bounds.low;
      const result = insertIntoGroups(groups, "T", position, tied);
      const rankOf = (id: string) => result.findIndex((g) => g.includes(id));
      for (const a of answers) {
        const t = rankOf("T");
        const p = rankOf(a.peerId);
        const ok =
          a.winner === "target" ? t < p : a.winner === "peer" ? t > p : t === p;
        check(ok, `position contradicts answer ${a.winner} vs ${a.peerId}`);
      }
      outcomes.push(`${tied ? "tie" : "gap"}${position}`);
      return;
    }
    const { index, peerId } = choosePivot(groups, bounds, { category }, byId);
    check(index >= bounds.low && index < bounds.high, "pivot out of range");
    check(groups[index].includes(peerId), "peer not in pivot group");
    walk({ ...bounds, high: index }, [
      ...answers,
      { index, peerId, winner: "target" },
    ]);
    walk({ ...bounds, low: index + 1 }, [
      ...answers,
      { index, peerId, winner: "peer" },
    ]);
    walk(bounds, [...answers, { index, peerId, winner: "tie" }]);
  };
  walk({ low: 0, high: n }, []);
  check(outcomes.length === 2 * n + 1, "wrong number of outcomes");
  check(new Set(outcomes).size === 2 * n + 1, "an outcome is unreachable");
  return maxDepth;
}

test("every answer sequence terminates at a consistent position (exhaustive)", () => {
  const options: Cat[] = ["beach", "city", undefined];
  for (let n = 0; n <= 7; n++) {
    // Every category assignment of n singleton groups.
    for (let mask = 0; mask < 3 ** n; mask++) {
      const cats = Array.from(
        { length: n },
        (_, i) => options[Math.floor(mask / 3 ** i) % 3],
      );
      const { groups, byId } = singles(cats);
      for (const category of options) explore(groups, byId, category);
    }
  }
});

test("comparison count stays logarithmic on larger lists", () => {
  for (const n of [16, 64, 200]) {
    // Beach places clustered at the bottom, the worst case for priority.
    const { groups, byId } = singles(
      Array.from({ length: n }, (_, i) => (i >= n - 5 ? "beach" : "city")),
    );
    const depth = explore(groups, byId, "beach");
    // The decisive questions are the non-tie answers; ties end immediately.
    expect(depth).toBeLessThanOrEqual(Math.ceil(2.5 * Math.log2(n + 1)) + 1);
    const mixed = singles(
      Array.from({ length: n }, (_, i) => (i % 7 === 0 ? "beach" : "city")),
    );
    expect(explore(mixed.groups, mixed.byId, "beach")).toBeLessThanOrEqual(
      Math.ceil(2.5 * Math.log2(n + 1)) + 1,
    );
  }
});

test.describe("comparison dialog", () => {
  test.afterAll(resetJournal);

  test("asks about a same-category place first", async ({ page }) => {
    const cats: Category[] = [
      "city",
      "beach",
      "city",
      "city",
      "city",
      "beach",
      "city",
      "beach",
    ];
    const peers: Place[] = cats.map((category, i) => ({
      ...place(`p${i}`, `Peer ${i}`, "Spain"),
      category,
    }));
    const target: Place = {
      ...place("t", "Target", "Spain"),
      category: "beach",
    };
    const journal: Journal = {
      ...emptyJournal(),
      people: ["Alex", "Sam"],
      places: [...peers, target],
      rankings: [peers.map((p) => [p.id]), []],
    };
    await seed(page, journal);
    await open(page);
    await page
      .getByRole("button", { name: /^Target\b/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Rank Alex's rating" }).click();
    const peerCard = page.locator(".comparison-choice").nth(1);
    // Midpoint is Peer 4 (city); the nearest beach group is Peer 5.
    await expect(peerCard).toContainText("Peer 5");
    await expect(peerCard).toContainText("Spain · Beach");
    await expect(page.locator(".comparison-choice").first()).toContainText(
      "Spain · Beach",
    );
    // Peer wins → range [6, 8) is narrowed → plain midpoint Peer 7.
    await peerCard.click();
    await expect(peerCard).toContainText("Peer 7");
    // Back restores the same-category question.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(peerCard).toContainText("Peer 5");
    await peerCard.click();
    // Target beats Peer 7 → [6, 7) → Peer 6 (city).
    await page.locator(".comparison-choice").first().click();
    await expect(peerCard).toContainText("Peer 6");
    await peerCard.click();
    await expect(
      page.getByRole("heading", { name: "Target", exact: true }),
    ).toBeVisible();
    const saved = (await (await page.request.get("/api/journal")).json())
      .journal as Journal;
    expect(personalGroups(saved, 0, "been").flat()).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "t",
      "p7",
    ]);
  });
});
