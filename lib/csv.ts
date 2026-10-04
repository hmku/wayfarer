import Papa from "papaparse";
import { Journal, Place } from "./model";
import { scoreMap } from "./ranking";
export type Mapping = {
  name: string;
  country: string;
  status: string;
  date: string;
  first: string;
  second: string;
  notes: string;
  defaultStatus: "been" | "want";
};
export function readCsv(text: string) {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (parsed.errors.length)
    throw new Error(
      "Could not read this CSV. Export the sheet as CSV and try again.",
    );
  const rows = parsed.data.filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2)
    throw new Error("The CSV needs a header row and at least one destination.");
  const headers = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: rows.slice(1) };
}
export function initialMapping(headers: string[]): Mapping {
  const find = (r: RegExp) => String(headers.findIndex((h) => r.test(h)));
  return {
    name: find(/^(destination|place|city|location|travel destination)$/i),
    country: find(/^(country|region)$/i),
    status: find(/^(status|list|visited|been)$/i),
    date: find(/^(date|visited on|visit date)$/i),
    first: find(/^(rating 1|your rating|my rating|score 1)$/i),
    second: find(/^(rating 2|partner rating|score 2)$/i),
    notes: find(/^(notes|note|memory|memories)$/i),
    defaultStatus: "been",
  };
}
export function convertRows(
  rows: string[][],
  m: Mapping,
): { places: Place[]; errors: string[] } {
  const places: Place[] = [];
  const errors: string[] = [];
  const cell = (row: string[], col: string) =>
    col === "-1" ? "" : (row[Number(col)] || "").trim();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = cell(row, m.name);
    if (!name) continue;
    const statusText = cell(row, m.status).toLowerCase();
    let status = m.defaultStatus;
    if (statusText) {
      if (
        /^(been|visited|yes|true|done|went|have been|been to)$/.test(statusText)
      )
        status = "been";
      else if (
        /^(want|wishlist|want to go|no|false|not visited|to visit|to go)$/.test(
          statusText,
        )
      )
        status = "want";
      else {
        errors.push(
          `Row ${i + 2}: unrecognized list “${statusText}”. Choose no status column and import each list separately.`,
        );
        continue;
      }
    }
    const scores: [number | null, number | null] = [null, null];
    let invalid = false;
    for (const [index, col] of [m.first, m.second].entries()) {
      const raw = cell(row, col);
      if (!raw || /^(n\/?a|—|-)$/.test(raw)) continue;
      if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) > 10) {
        errors.push(`Row ${i + 2}: “${raw}” is not a rating from 0 to 10.`);
        invalid = true;
      } else scores[index] = Number(raw);
    }
    let date = cell(row, m.date);
    if (date) {
      const parsed = Date.parse(date);
      if (!Number.isFinite(parsed)) {
        errors.push(`Row ${i + 2}: could not read date “${date}”.`);
        invalid = true;
      } else date = new Date(parsed).toISOString().slice(0, 10);
    }
    if (!invalid)
      places.push({
        id: crypto.randomUUID(),
        name,
        country: cell(row, m.country),
        status,
        date,
        notes: cell(row, m.notes),
        ratings: scores,
      });
  }
  if (!places.length && !errors.length)
    errors.push(
      "No destinations found. Choose the column containing destination names.",
    );
  return { places, errors };
}
export function exportCsv(j: Journal) {
  const scores = {
    been: [scoreMap(j, 0, "been"), scoreMap(j, 1, "been")],
    want: [scoreMap(j, 0, "want"), scoreMap(j, 1, "want")],
  };
  return Papa.unparse(
    {
      fields: [
        "Destination",
        "Country",
        "Status",
        "Date",
        j.people[0] + " rating",
        j.people[1] + " rating",
        "Notes",
        j.people[0] + " original rating",
        j.people[1] + " original rating",
      ],
      data: j.places.map((p) => [
        p.name,
        p.country,
        p.status === "been" ? "Been" : "Want to go",
        p.date,
        scores[p.status][0].get(p.id) ?? "",
        scores[p.status][1].get(p.id) ?? "",
        p.notes,
        p.ratings[0] ?? "",
        p.ratings[1] ?? "",
      ]),
    },
    { escapeFormulae: true },
  );
}
