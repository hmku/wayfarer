import { test, expect } from "@playwright/test";
import { convertRows, exportCsv, initialMapping, readCsv } from "../lib/csv";
import { Journal } from "../lib/model";

test("imports category and region labels case-insensitively", () => {
  const { headers, rows } = readCsv(
    [
      "Destination,Country,Category,Region",
      "Tulum,Mexico,beach,CARIBBEAN",
      "Banff,Canada,NATURE,west coast",
      "Kyoto,Japan,,",
      "Lisbon,Portugal,City,europe",
    ].join("\n"),
  );
  const m = initialMapping(headers);
  expect([m.country, m.category, m.region]).toEqual(["1", "2", "3"]);
  const { places, errors } = convertRows(rows, m);
  expect(errors).toEqual([]);
  expect(
    places.map((p) => [p.name, p.category ?? null, p.region ?? null]),
  ).toEqual([
    ["Tulum", "beach", "caribbean"],
    ["Banff", "nature", "west-coast"],
    // Blank cells leave the fields unset rather than empty.
    ["Kyoto", null, null],
    ["Lisbon", "city", "europe"],
  ]);
  expect("category" in places[2]).toBe(false);
  expect("region" in places[2]).toBe(false);
});

test("unknown categories and regions are row-numbered errors", () => {
  const { headers, rows } = readCsv(
    "Destination,Country,Category,Region\nRome,Italy,Ruins,Europe\nOslo,Norway,City,Scandinavia\nNice,France,Beach,Europe",
  );
  const { places, errors } = convertRows(rows, initialMapping(headers));
  expect(errors).toHaveLength(2);
  expect(errors[0]).toMatch(/^Row 2: unrecognized category “Ruins”/);
  expect(errors[1]).toMatch(/^Row 3: unrecognized region “Scandinavia”/);
  expect(places.map((p) => p.name)).toEqual(["Nice"]);
});

test("a lone Region column still maps to the free-text location", () => {
  const { headers, rows } = readCsv("Place,Region\nFlorence,Tuscany");
  const m = initialMapping(headers);
  expect([m.country, m.region]).toEqual(["1", "-1"]);
  const { places, errors } = convertRows(rows, m);
  expect(errors).toEqual([]);
  expect(places[0]).toMatchObject({ country: "Tuscany" });
  expect(places[0].region).toBeUndefined();
});

test("export writes category and stored region only, and round-trips", () => {
  const base = { status: "want", date: "", notes: "" } as const;
  const j: Journal = {
    version: 1,
    people: ["Alex", "Sam"],
    places: [
      {
        ...base,
        id: "a",
        name: "Tulum",
        country: "Mexico",
        category: "beach",
        region: "caribbean",
        ratings: [null, null],
      },
      // No region stored: the export leaves it blank, even with a country.
      { ...base, id: "b", name: "Kyoto", country: "Japan", ratings: [null, null] },
      { ...base, id: "c", name: "Somewhere", country: "", ratings: [null, null] },
    ],
  };
  const { headers, rows } = readCsv(exportCsv(j).replace(/^﻿/, ""));
  expect(headers.slice(0, 5)).toEqual([
    "Destination",
    "Country",
    "Category",
    "Region",
    "Status",
  ]);
  expect(rows.map((r) => r.slice(0, 4))).toEqual([
    ["Tulum", "Mexico", "Beach", "Caribbean"],
    ["Kyoto", "Japan", "", ""],
    ["Somewhere", "", "", ""],
  ]);
  const { places, errors } = convertRows(rows, initialMapping(headers));
  expect(errors).toEqual([]);
  expect(places.map((p) => [p.category ?? null, p.region ?? null])).toEqual([
    ["beach", "caribbean"],
    [null, null],
    [null, null],
  ]);
  expect("region" in places[1]).toBe(false);
});

test("free-text Region and Type columns are not auto-mapped", () => {
  const data = readCsv(
    "Destination,Country,Region,Type\nHanoi,Vietnam,Southeast Asia,Holiday\nRome,Italy,Lazio,City break\n",
  );
  const mapping = initialMapping(data.headers, data.rows);
  expect(mapping.country).toBe("1");
  expect(mapping.region).toBe("-1");
  expect(mapping.category).toBe("-1");
  expect(convertRows(data.rows, mapping).errors).toEqual([]);
  // Columns that hold known values are still mapped.
  const known = readCsv("Destination,Country,Region,Category\nHanoi,Vietnam,Asia,City\n");
  const m = initialMapping(known.headers, known.rows);
  expect([m.region, m.category]).toEqual(["2", "3"]);
});

test("old US region names still import", () => {
  const data = readCsv("Destination,Region\nSeattle,West Coast\nChicago,us central\n");
  const result = convertRows(data.rows, { ...initialMapping(data.headers, data.rows), region: "1" });
  expect(result.errors).toEqual([]);
  expect(result.places.map((p) => p.region)).toEqual(["west-coast", "central"]);
});
