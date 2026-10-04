import { test, expect } from "@playwright/test";
import {
  convertRows,
  exportCsv,
  importTotalError,
  initialMapping,
  Mapping,
  normalizeDate,
  readCsv,
} from "../lib/csv";
import { Journal, Place } from "../lib/model";

const mapping = (overrides: Partial<Mapping> = {}): Mapping => ({
  name: "0",
  country: "-1",
  status: "-1",
  date: "-1",
  first: "-1",
  second: "-1",
  notes: "-1",
  defaultStatus: "been",
  ...overrides,
});

test.describe("dates in a zone east of UTC", () => {
  let previous: string | undefined;
  test.beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = "Europe/Berlin";
  });
  test.afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  test("non-ISO dates keep their calendar day", () => {
    expect(new Date(2024, 0, 1).getTimezoneOffset()).toBe(-60);
    expect(normalizeDate("March 5, 2024")).toBe("2024-03-05");
    expect(normalizeDate("1/2/2024")).toBe("2024-01-02");
    expect(normalizeDate("2024-07-14")).toBe("2024-07-14");
    expect(normalizeDate("2023-02-31")).toBe("");
    expect(normalizeDate("someday")).toBe("");
    const { places, errors } = convertRows(
      [["Rome", "June 30, 2023"]],
      mapping({ date: "1" }),
    );
    expect(errors).toEqual([]);
    expect(places[0].date).toBe("2023-06-30");
  });
});

test("single-column CSV files import", () => {
  const { headers, rows } = readCsv("Destination\nRome\nKyoto\n");
  expect(headers).toEqual(["Destination"]);
  const { places, errors } = convertRows(rows, initialMapping(headers));
  expect(errors).toEqual([]);
  expect(places.map((p) => p.name)).toEqual(["Rome", "Kyoto"]);
});

test("rows over the field limits report their row numbers", () => {
  const { places, errors } = convertRows(
    [
      ["Fine", "Italy", ""],
      ["x".repeat(121), "Italy", ""],
      ["Long country", "y".repeat(121), ""],
      ["Long notes", "", "z".repeat(5001)],
    ],
    mapping({ country: "1", notes: "2" }),
  );
  expect(places.map((p) => p.name)).toEqual(["Fine"]);
  expect(errors).toEqual([
    "Row 3: destination is longer than 120 characters.",
    "Row 4: country is longer than 120 characters.",
    "Row 5: notes is longer than 5,000 characters.",
  ]);
});

test("imports are capped at the journal place limit", () => {
  const rows = Array.from({ length: 2001 }, (_, i) => [`Place ${i}`]);
  const { errors } = convertRows(rows, mapping());
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("up to 2,000");
  expect(importTotalError(1500, 500)).toBeNull();
  expect(importTotalError(1500, 501)).toContain("limit is 2,000");
});

function place(overrides: Partial<Place>): Place {
  return {
    id: crypto.randomUUID(),
    name: "Place",
    country: "",
    status: "been",
    date: "",
    notes: "",
    ratings: [null, null],
    ...overrides,
  };
}

test("export adds a BOM, rounds scores, escapes only formula-like text, and re-imports", () => {
  const j: Journal = {
    version: 1,
    people: ["Alex", "Sam"],
    places: [
      place({ name: "Zürich", ratings: [9, 7], notes: "- lovely lake" }),
      place({ name: "=HYPERLINK(1)", ratings: [8, 6], notes: "-1+2" }),
      place({ name: "Oslo", ratings: [7, 5], notes: "-5" }),
      place({ name: "@home", ratings: [6, 4], country: "+44" }),
    ],
  };
  const csv = exportCsv(j);
  expect(csv.startsWith("﻿Destination,")).toBe(true);
  expect(csv).toContain("- lovely lake");
  expect(csv).toContain(`"'-1+2"`);
  expect(csv).toContain(`"'=HYPERLINK(1)"`);
  expect(csv).toContain(`"'@home"`);
  expect(csv).toContain(`"'+44"`);
  expect(csv).toMatch(/Oslo,,Been,,3\.3,3\.3,-5,7,5/);
  expect(csv).not.toMatch(/\d\.\d{2,}/);

  const { headers, rows } = readCsv(csv);
  expect(headers[0]).toBe("Destination");
  const m = initialMapping(headers);
  expect(headers[Number(m.first)]).toBe("Alex rating");
  expect(headers[Number(m.second)]).toBe("Sam rating");
  const { places, errors } = convertRows(rows, m);
  expect(errors).toEqual([]);
  expect(places.map((p) => [p.name, p.ratings, p.notes])).toEqual([
    ["Zürich", [10, 10], "- lovely lake"],
    ["'=HYPERLINK(1)", [6.7, 6.7], "'-1+2"],
    ["Oslo", [3.3, 3.3], "-5"],
    ["'@home", [0, 0], ""],
  ]);
});
