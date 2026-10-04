import { test, expect } from "@playwright/test";
import { Journal, Place } from "../lib/model";
import { personalGroups } from "../lib/ranking";

function place(
  id: string,
  rating: number | null,
  status: Place["status"] = "been",
): Place {
  return {
    id,
    name: id,
    country: "",
    status,
    date: "",
    notes: "",
    ratings: [rating, null],
  };
}

function journal(places: Place[], ranking: string[][]): Journal {
  return {
    version: 1,
    people: ["Alex", "Sam"],
    places,
    rankings: [ranking, []],
  };
}

test("a highly rated import ranks above existing lower-rated places", () => {
  const j = journal([place("low", 2), place("new", 10)], [["low"]]);
  expect(personalGroups(j, 0, "been")).toEqual([["new"], ["low"]]);
});

test("seeded places slot between stored groups by original rating", () => {
  const j = journal(
    [
      place("nine", 9),
      place("six", 6),
      place("three", 3),
      place("ten", 10),
      place("seven", 7),
      place("five", 5),
      place("one", 1),
    ],
    [["nine"], ["six"], ["three"]],
  );
  expect(personalGroups(j, 0, "been")).toEqual([
    ["ten"],
    ["nine"],
    ["seven"],
    ["six"],
    ["five"],
    ["three"],
    ["one"],
  ]);
});

test("equal ratings join a uniform stored tie but not a mixed group", () => {
  const uniform = journal(
    [place("a", 8), place("b", 8), place("c", 4), place("new", 8)],
    [["a", "b"], ["c"]],
  );
  expect(personalGroups(uniform, 0, "been")).toEqual([
    ["a", "b", "new"],
    ["c"],
  ]);

  const mixed = journal(
    [place("a", 8), place("b", 6), place("c", 4), place("new", 8)],
    [["a", "b"], ["c"]],
  );
  expect(personalGroups(mixed, 0, "been")).toEqual([
    ["a", "b"],
    ["new"],
    ["c"],
  ]);
});

test("manual stored order is preserved and unrated stored groups are skipped", () => {
  // The user moved the 3-rated place above the 9-rated one; keep that order
  // and insert before the first stored group rated lower than the seed.
  const j = journal(
    [
      place("manual", null),
      place("three", 3),
      place("nine", 9),
      place("new", 5),
      place("other-list", 10, "want"),
    ],
    [["manual"], ["three"], ["nine"]],
  );
  expect(personalGroups(j, 0, "been")).toEqual([
    ["manual"],
    ["new"],
    ["three"],
    ["nine"],
  ]);
  expect(personalGroups(j, 0, "want")).toEqual([["other-list"]]);
});

test("without stored rankings, seeds keep rating order and name ties", () => {
  const j: Journal = {
    version: 1,
    people: ["Alex", "Sam"],
    places: [place("b", 7), place("a", 7), place("c", 9), place("u", null)],
  };
  expect(personalGroups(j, 0, "been")).toEqual([["c"], ["a", "b"]]);
  expect(personalGroups(j, 1, "been")).toEqual([]);
});
