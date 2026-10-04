import { test, expect } from "@playwright/test";
import { Journal, Place } from "../lib/model";
import { Bucket, favourites, preferences } from "../lib/preferences";

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

const journal: Journal = {
  version: 1,
  people: ["Alex", "Sam"],
  places: [
    place("a", { category: "beach", country: "Spain", region: "europe" }),
    place("b", { category: "city", country: "Kyoto, Japan", region: "asia" }),
    // A country but no stored region: regions are never inferred.
    place("c", { category: "city", country: "Mexico" }),
    // Unranked by both, with no category.
    place("d", { country: "Peru" }),
    place("e", { category: "beach", region: "oceania", status: "want" }),
  ],
  rankings: [
    [["a"], ["b"], ["c"]], // Alex: a 10, b 5, c 0
    [["c"], ["a"]], // Sam: c 10, a 0; b unranked
  ],
};

const byKey = <K extends string>(buckets: Bucket<K>[]) =>
  Object.fromEntries(buckets.map((b) => [b.key, [b.average, b.count]]));

test("averages each person's scores per category and region", () => {
  const prefs = preferences(journal);
  expect(prefs).toMatchObject({
    status: "been",
    total: 4,
    withoutCategory: 1,
    // c and d have countries but no stored region.
    withoutRegion: 2,
  });
  const [alex, sam] = prefs.people;
  expect(byKey(alex.categories)).toEqual({
    city: [2.5, 2],
    nature: [null, 0],
    beach: [10, 1],
  });
  expect(byKey(alex.regions)).toMatchObject({
    europe: [10, 1],
    asia: [5, 1],
    oceania: [null, 0],
  });
  expect(alex).toMatchObject({ ranked: 3, missingCategory: 0, missingRegion: 1 });
  expect(byKey(sam.categories)).toEqual({
    city: [10, 1],
    nature: [null, 0],
    beach: [0, 1],
  });
  expect(sam).toMatchObject({ ranked: 2, missingCategory: 0, missingRegion: 1 });
});

test("Together averages the available personal scores per place", () => {
  const { together } = preferences(journal);
  // a: (10 + 0) / 2, b: Alex only, c: (0 + 10) / 2.
  expect(byKey(together.categories)).toEqual({
    city: [5, 2],
    nature: [null, 0],
    beach: [5, 1],
  });
  expect(byKey(together.regions)).toMatchObject({ europe: [5, 1], asia: [5, 1] });
  expect(together.ranked).toBe(3);
});

test("buckets keep a fixed order and cover every category and region", () => {
  const { people } = preferences(journal);
  expect(people[0].categories.map((b) => b.key)).toEqual(["city", "nature", "beach"]);
  expect(people[0].regions.map((b) => b.key)).toEqual([
    "west-coast",
    "central",
    "east-coast",
    "caribbean",
    "south-america",
    "europe",
    "africa",
    "asia",
    "oceania",
  ]);
});

test("the wishlist is separate and unranked places only count as missing", () => {
  const prefs = preferences(journal, "want");
  expect(prefs).toMatchObject({ total: 1, withoutCategory: 0, withoutRegion: 0 });
  for (const b of [...prefs.people, prefs.together]) {
    expect(b.ranked).toBe(0);
    expect(b.categories.every((c) => c.average === null && c.count === 0)).toBe(true);
  }
});

test("imported ratings count as rankings for places never compared", () => {
  const rated: Journal = {
    version: 1,
    people: ["Alex", "Sam"],
    places: [
      place("x", { category: "nature", ratings: [9, null] }),
      place("y", { category: "city", ratings: [3, 4] }),
    ],
  };
  const prefs = preferences(rated);
  expect(byKey(prefs.people[0].categories)).toMatchObject({
    nature: [10, 1],
    city: [0, 1],
  });
  // Sam ranked only y, so it scores 10 on its own.
  expect(byKey(prefs.people[1].categories)).toMatchObject({ city: [10, 1] });
});

test("favourites need two scored buckets and include ties", () => {
  const { people, together } = preferences(journal);
  expect(favourites(people[0].categories).map((b) => b.key)).toEqual(["beach"]);
  expect(favourites(together.categories).map((b) => b.key)).toEqual([
    "city",
    "beach",
  ]);
  expect(
    favourites([
      { key: "city", average: 7, count: 2 },
      { key: "beach", average: null, count: 0 },
    ]),
  ).toEqual([]);
  // Ties are judged at the displayed precision.
  expect(
    favourites([
      { key: "a", average: 8.04, count: 1 },
      { key: "b", average: 7.96, count: 1 },
      { key: "c", average: 2, count: 1 },
    ]).map((b) => b.key),
  ).toEqual(["a", "b"]);
});
