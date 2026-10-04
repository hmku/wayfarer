import { test, expect } from "@playwright/test";
import { Journal, Place, validateJournal } from "../lib/model";
import { moveRanking, personalGroups, scoreMap } from "../lib/ranking";

function place(id: string, status: Place["status"] = "been"): Place {
  return {
    id,
    name: id,
    country: "",
    status,
    date: "",
    notes: "",
    ratings: [null, null],
  };
}

function journal(): Journal {
  return {
    version: 1,
    people: ["Alex", "Sam"],
    places: [
      place("a"),
      place("b"),
      place("c"),
      place("d"),
      place("u"),
      place("v"),
      place("w", "want"),
    ],
    rankings: [
      [["a"], ["b", "c"], ["d"], ["w"]],
      [["d"], ["a", "b"], ["c"], ["w"]],
    ],
  };
}

test("direct moves preserve other ties, partner order, category, and original ratings", () => {
  const original = journal();
  original.places[0].ratings = [9, 8];
  const snapshot = structuredClone(original);
  const moved = moveRanking(original, 0, "been", "d", "a", "before");
  expect(personalGroups(moved, 0, "been")).toEqual([["d"], ["a"], ["b", "c"]]);
  expect(moved.rankings![1]).toEqual(original.rankings![1]);
  expect(personalGroups(moved, 0, "want")).toEqual([["w"]]);
  expect(moved.places).toEqual(original.places);
  expect(scoreMap(moved, 0, "been").get("d")).toBe(10);
  expect(scoreMap(moved, 0, "been").get("b")).toBe(0);
  expect(original).toEqual(snapshot);
  expect(validateJournal(moved)).toEqual(moved);
});

test("moving out of a tie creates a singleton and leaves the anchor tie intact", () => {
  const original = journal();
  const moved = moveRanking(original, 0, "been", "b", "c", "after");
  expect(personalGroups(moved, 0, "been")).toEqual([
    ["a"],
    ["c"],
    ["b"],
    ["d"],
  ]);
  const againstTie = moveRanking(original, 0, "been", "a", "b", "after");
  expect(personalGroups(againstTie, 0, "been")).toEqual([
    ["b", "c"],
    ["a"],
    ["d"],
  ]);
});

test("unranked destinations participate only when directly moved or used as an anchor", () => {
  const original = journal();
  const moved = moveRanking(original, 0, "been", "u", "a", "before");
  expect(personalGroups(moved, 0, "been")).toEqual([
    ["u"],
    ["a"],
    ["b", "c"],
    ["d"],
  ]);
  expect(scoreMap(moved, 0, "been").has("v")).toBe(false);
  const afterUnranked = moveRanking(original, 0, "been", "d", "u", "after");
  expect(personalGroups(afterUnranked, 0, "been")).toEqual([
    ["a"],
    ["b", "c"],
    ["u"],
    ["d"],
  ]);
  const bothUnranked = moveRanking(original, 0, "been", "u", "v", "before");
  expect(personalGroups(bothUnranked, 0, "been")).toEqual([
    ["a"],
    ["b", "c"],
    ["d"],
    ["u"],
    ["v"],
  ]);
});

test("moves resolve against the latest order and reject missing or recategorized destinations", () => {
  const original = journal();
  const latest = moveRanking(original, 0, "been", "d", "a", "before");
  const moved = moveRanking(latest, 0, "been", "a", "b", "after");
  expect(personalGroups(moved, 0, "been")).toEqual([["d"], ["b", "c"], ["a"]]);
  expect(moveRanking(original, 0, "been", "a", "a", "before")).toBe(original);
  expect(() =>
    moveRanking(original, 0, "been", "missing", "a", "before"),
  ).toThrow("The list changed");
  expect(() => moveRanking(original, 0, "been", "a", "w", "before")).toThrow(
    "The list changed",
  );
  expect(() => moveRanking(original, 0, "want", "a", "a", "before")).toThrow(
    "The list changed",
  );
});
