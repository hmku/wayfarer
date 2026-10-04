import { test, expect } from "@playwright/test";
import { convertRows, exportCsv, initialMapping, readCsv } from "../lib/csv";
import { Journal } from "../lib/model";

test("imports category and region labels case-insensitively", () => {
  const { headers, rows } = readCsv(
    [
      "Destination,Country,Category,Region",
      "Tulum,Mexico,beach,caribbean and central america",
      "Banff,Canada,NATURE,North America",
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
    ["Tulum", "beach", "caribbean-central-america"],
    ["Banff", "nature", "north-america"],
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

test("export writes category and effective region, and round-trips", () => {
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
        region: "caribbean-central-america",
        ratings: [null, null],
      },
      // No region stored: the export uses the one inferred from the country.
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
    ["Tulum", "Mexico", "Beach", "Caribbean & Central America"],
    ["Kyoto", "Japan", "", "Asia"],
    ["Somewhere", "", "", ""],
  ]);
  const { places, errors } = convertRows(rows, initialMapping(headers));
  expect(errors).toEqual([]);
  expect(places.map((p) => [p.category ?? null, p.region ?? null])).toEqual([
    ["beach", "caribbean-central-america"],
    [null, "asia"],
    [null, null],
  ]);
});
