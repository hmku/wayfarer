import { test, expect } from "@playwright/test";
import { emptyJournal, location, Place, validateJournal } from "../lib/model";

function place(overrides: Record<string, unknown> = {}): Place {
  return {
    id: "p1",
    name: "Lisbon",
    country: "",
    status: "been",
    date: "",
    notes: "",
    ratings: [null, null],
    ...overrides,
  } as Place;
}

const withPlace = (p: unknown) => ({ ...emptyJournal(), places: [p] });

test("place ids must be strings", () => {
  for (const id of [123, ["p1"], null])
    expect(() => validateJournal(withPlace(place({ id })))).toThrow(
      "Check destination details",
    );
  expect(() => validateJournal(withPlace(null))).toThrow();
});

test("impossible calendar dates are rejected", () => {
  for (const date of ["2023-02-31", "2023-13-01", "2024-04-31", "2023-2-1"])
    expect(() => validateJournal(withPlace(place({ date })))).toThrow(
      "Check destination details",
    );
  expect(
    validateJournal(withPlace(place({ date: "2024-02-29" }))).places[0].date,
  ).toBe("2024-02-29");
});

test("a Region: note is a display fallback and does not fill the country", () => {
  const saved = validateJournal(
    withPlace(place({ country: "  ", notes: "Region: Europe" })),
  ).places[0];
  expect(saved.country).toBe("");
  expect(location(saved)).toBe("Europe");
  const named = validateJournal(
    withPlace(place({ country: " Portugal ", notes: "Region: Europe" })),
  ).places[0];
  expect(named.country).toBe("Portugal");
  expect(location(named)).toBe("Portugal");
});
