import { test, expect } from "@playwright/test";
import { emptyJournal, Place, regionOf, validateJournal } from "../lib/model";
import { inferRegion } from "../lib/regions";
import { applyChanges, diffJournals } from "../lib/changes";

const place = (patch: Partial<Place> = {}): Place => ({
  id: "p1",
  name: "Somewhere",
  country: "",
  status: "been",
  date: "",
  notes: "",
  ratings: [null, null],
  ...patch,
});

test("regions are inferred from free-text countries", () => {
  expect(inferRegion("Italy")).toBe("europe");
  expect(inferRegion("Kyoto, Japan")).toBe("asia");
  expect(inferRegion("USA")).toBe("north-america");
  expect(inferRegion("Costa Rica")).toBe("caribbean-central-america");
  expect(inferRegion("Türkiye")).toBe("middle-east");
  expect(inferRegion("Atlantis")).toBeUndefined();
  expect(inferRegion("")).toBeUndefined();
  // An explicit region wins; otherwise the country (or a Region: note) is used.
  expect(regionOf(place({ country: "Peru" }))).toBe("south-america");
  expect(regionOf(place({ country: "Peru", region: "europe" }))).toBe("europe");
  expect(regionOf(place({ notes: "Region: Morocco" }))).toBe("africa");
});

test("category and region are optional, validated, and omitted when unset", () => {
  const journal = (p: Place) => ({ ...emptyJournal(), places: [p] });
  const saved = validateJournal(journal(place({ category: "beach", region: "oceania" })));
  expect(saved.places[0]).toMatchObject({ category: "beach", region: "oceania" });
  const cleared = validateJournal(
    journal({ ...place(), category: "" as never, region: "" as never }),
  );
  expect("category" in cleared.places[0]).toBe(false);
  expect("region" in cleared.places[0]).toBe(false);
  expect(() => validateJournal(journal(place({ category: "mountain" as never })))).toThrow();
  expect(() => validateJournal(journal(place({ region: "mars" as never })))).toThrow();
});

test("category and region save as field-level changes", () => {
  const base = { ...emptyJournal(), places: [place()] };
  const set = { ...base, places: [place({ category: "city" })] };
  const changes = diffJournals(base, set);
  expect(changes).toEqual([
    { kind: "field", id: "p1", field: "category", value: "city", expect: "" },
  ]);
  // The partner set the region meanwhile: different field, both kept.
  const theirs = applyChanges(base, diffJournals(base, {
    ...base,
    places: [place({ region: "asia" })],
  }));
  const result = applyChanges(theirs, changes);
  expect(result.places[0]).toMatchObject({ category: "city", region: "asia" });
  // Clearing removes the key.
  const unset = applyChanges(result, diffJournals(result, {
    ...result,
    places: [{ ...result.places[0], category: undefined }],
  }));
  expect("category" in unset.places[0]).toBe(false);
});
