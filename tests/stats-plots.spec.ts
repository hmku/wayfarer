import { test, expect } from "@playwright/test";
import { Journal, Place } from "../lib/model";
import { Bucket } from "../lib/preferences";
import {
  biggestDisagreements,
  byAverage,
  distribution,
  pairPoints,
  paretoFrontier,
} from "../lib/stats-plots";

const place = (id: string, patch: Partial<Place> = {}): Place => ({
  id,
  name: id,
  country: "",
  status: "been",
  date: "",
  notes: "",
  ratings: [null, null],
  ...patch,
});

const pt = (name: string, a: number, b: number) => ({ name, a, b });
const names = (ps: { name: string }[]) => ps.map((p) => p.name);

test("byAverage drops empty buckets and sorts highest first, ties in fixed order", () => {
  const buckets: Bucket<string>[] = [
    { key: "city", average: 4, count: 2 },
    { key: "nature", average: null, count: 0 },
    { key: "beach", average: 7, count: 1 },
    { key: "desert", average: 4, count: 1 },
  ];
  expect(byAverage(buckets).map((b) => b.key)).toEqual(["beach", "city", "desert"]);
  expect(byAverage([])).toEqual([]);
});

test("the Pareto frontier keeps only undominated points, left to right", () => {
  const points = [
    pt("a", 2, 10),
    pt("b", 6, 7),
    pt("c", 9, 3),
    pt("d", 5, 5), // dominated by b
    pt("e", 1, 1),
    pt("f", 8, 2), // dominated by c
  ];
  expect(names(paretoFrontier(points))).toEqual(["a", "b", "c"]);
  expect(paretoFrontier([])).toEqual([]);
  expect(names(paretoFrontier([pt("solo", 3, 4)]))).toEqual(["solo"]);
});

test("the Pareto frontier handles ties and duplicates", () => {
  // Equal on one score, worse on the other: dominated.
  expect(names(paretoFrontier([pt("x", 10, 5), pt("y", 10, 3)]))).toEqual(["x"]);
  expect(names(paretoFrontier([pt("x", 8, 5), pt("y", 10, 5)]))).toEqual(["y"]);
  // Identical coordinates do not dominate each other: both stay, by name.
  expect(
    names(paretoFrontier([pt("rome", 10, 10), pt("bali", 10, 10), pt("oslo", 9, 9)])),
  ).toEqual(["bali", "rome"]);
  // Duplicates below the frontier are dropped together.
  expect(
    names(paretoFrontier([pt("p", 4, 4), pt("q", 4, 4), pt("r", 6, 6)])),
  ).toEqual(["r"]);
  // A duplicate pair in the middle of a staircase.
  expect(
    names(
      paretoFrontier([pt("top", 0, 10), pt("m1", 5, 5), pt("m2", 5, 5), pt("right", 10, 0)]),
    ),
  ).toEqual(["top", "m1", "m2", "right"]);
  // Everyone the same: all on the frontier.
  expect(paretoFrontier([pt("a", 0, 0), pt("b", 0, 0)])).toHaveLength(2);
});

test("biggest disagreements rank by gap, name who likes it more, and skip agreements", () => {
  const points = [
    { id: "1", name: "Rome", a: 10, b: 2 },
    { id: "2", name: "Oslo", a: 3, b: 9 },
    { id: "3", name: "Bali", a: 5, b: 5 },
    { id: "4", name: "Lima", a: 1, b: 7 },
    { id: "5", name: "Fez", a: 7, b: 1 },
  ];
  const top = biggestDisagreements(points, 3);
  expect(top.map((d) => [d.name, d.gap, d.favours])).toEqual([
    ["Rome", 8, 0],
    ["Fez", 6, 0], // tied gap with Lima and Oslo: by name
    ["Lima", 6, 1],
  ]);
  expect(biggestDisagreements(points).map((d) => d.name)).not.toContain("Bali");
  expect(biggestDisagreements([{ id: "x", name: "x", a: 4, b: 4 }])).toEqual([]);
});

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    place("a", { category: "beach", region: "europe" }),
    place("b", { category: "city", region: "asia" }),
    place("c", { category: "city" }),
    place("d", { region: "asia" }),
    place("w", { category: "beach", status: "want" }),
  ],
  rankings: [
    [["a"], ["b"], ["c"], ["d"], ["w"]], // a 10, b 6.67, c 3.33, d 0; w alone 10
    [["c"], ["a", "d"]], // c 10, a 0, d 0; b unranked
  ],
};

test("pair points are the places both people ranked in the list", () => {
  const points = pairPoints(journal, "been");
  expect(points.map((p) => [p.id, p.a, p.b])).toEqual([
    ["a", 10, 0],
    ["c", 10 / 3, 10],
    ["d", 0, 0],
  ]);
  expect(points[0]).toMatchObject({ category: "beach", region: "europe" });
  expect(pairPoints(journal, "want")).toEqual([]);
});

test("distribution rows hold each scored place, ordered by average", () => {
  const alex = distribution(journal, "been", 0);
  expect(alex.categories.map((r) => [r.key, r.average, r.dots.map((d) => d.id)])).toEqual([
    ["beach", 10, ["a"]],
    ["city", 5, ["b", "c"]],
  ]);
  expect(alex.regions.map((r) => r.key)).toEqual(["europe", "asia"]);
  expect(alex).toMatchObject({ ranked: 4, missingCategory: 1, missingRegion: 1 });

  const sam = distribution(journal, "been", 1);
  expect(sam.categories.map((r) => [r.key, r.average])).toEqual([
    ["city", 10],
    ["beach", 0],
  ]);
  // Region rows: Asia has only d (0), Europe only a (0): tie keeps fixed order.
  expect(sam.regions.map((r) => r.key)).toEqual(["europe", "asia"]);

  const together = distribution(journal, "been", "together");
  const city = together.categories.find((r) => r.key === "city")!;
  // b: Alex only (6.67); c: (3.33 + 10) / 2.
  expect(city.dots.map((d) => d.id).sort()).toEqual(["b", "c"]);
  for (const d of city.dots) expect(d.score).toBeCloseTo(20 / 3);
  expect(distribution(journal, "want", 1)).toMatchObject({ ranked: 0, categories: [] });
});
