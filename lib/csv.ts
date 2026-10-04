import Papa from "papaparse";
import { isIsoDate, Journal, LIMITS, Place } from "./model";
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
const count = (n: number) => n.toLocaleString("en-US");
export function readCsv(text: string) {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  // A single-column file has no delimiter to detect; Papa falls back to commas.
  if (parsed.errors.some((e) => e.code !== "UndetectableDelimiter"))
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
  // Wayfarer exports name rating columns "<person> rating"; use them in order.
  const exported = headers.flatMap((h, i) =>
    / rating$/i.test(h) && !/original rating$/i.test(h) ? [i] : [],
  );
  const first = find(/^(rating 1|your rating|my rating|score 1)$/i);
  const second = find(/^(rating 2|partner rating|score 2)$/i);
  return {
    name: find(/^(destination|place|city|location|travel destination)$/i),
    country: find(/^(country|region)$/i),
    status: find(/^(status|list|visited|been)$/i),
    date: find(/^(date|visited on|visit date)$/i),
    first: first !== "-1" ? first : String(exported[0] ?? -1),
    second: second !== "-1" ? second : String(exported[1] ?? -1),
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
    const country = cell(row, m.country);
    const notes = cell(row, m.notes);
    const tooLong = (
      [
        ["destination", name, LIMITS.name],
        ["country", country, LIMITS.country],
        ["notes", notes, LIMITS.notes],
      ] as const
    ).filter(([, value, limit]) => value.length > limit);
    for (const [label, , limit] of tooLong)
      errors.push(
        `Row ${i + 2}: ${label} is longer than ${count(limit)} characters.`,
      );
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
    let invalid = tooLong.length > 0;
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
      const normalized = normalizeDate(date);
      if (!normalized) {
        errors.push(`Row ${i + 2}: could not read date “${date}”.`);
        invalid = true;
      } else date = normalized;
    }
    if (!invalid)
      places.push({
        id: crypto.randomUUID(),
        name,
        country,
        status,
        date,
        notes,
        ratings: scores,
      });
  }
  if (places.length > LIMITS.places)
    errors.push(
      `This CSV has ${count(places.length)} destinations; a journal holds up to ${count(LIMITS.places)}. Split the file and import fewer rows.`,
    );
  if (!places.length && !errors.length)
    errors.push(
      "No destinations found. Choose the column containing destination names.",
    );
  return { places, errors };
}
// Error for an import that would push the journal past the place limit.
export function importTotalError(existing: number, additions: number) {
  return existing + additions > LIMITS.places
    ? `This import would bring the journal to ${count(existing + additions)} destinations; the limit is ${count(LIMITS.places)}.`
    : null;
}

// Returns YYYY-MM-DD, or "" when the text is not a real date. ISO dates are
// kept verbatim; other formats parse in local time and must not shift through
// UTC, which would move them a day in zones east of Greenwich.
export function normalizeDate(text: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return isIsoDate(text) ? text : "";
  const parsed = new Date(Date.parse(text));
  if (!Number.isFinite(parsed.getTime())) return "";
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const local = [
    pad(parsed.getFullYear(), 4),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate()),
  ].join("-");
  return isIsoDate(local) ? local : "";
}

// Spreadsheet apps evaluate cells starting with these characters. A leading
// "-" is escaped only when it is not plain prose ("- note") or a number ("-5").
const FORMULA_START = /^(?:[=+@\t\r]|-(?!\s|$|\d+(?:\.\d+)?$))/;
const oneDecimal = (n: number | undefined) =>
  n === undefined ? "" : Math.round(n * 10) / 10;

export function exportCsv(j: Journal) {
  const scores = {
    been: [scoreMap(j, 0, "been"), scoreMap(j, 1, "been")],
    want: [scoreMap(j, 0, "want"), scoreMap(j, 1, "want")],
  };
  // The BOM lets Excel detect UTF-8 so accented names survive.
  return "\uFEFF" + Papa.unparse(
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
        oneDecimal(scores[p.status][0].get(p.id)),
        oneDecimal(scores[p.status][1].get(p.id)),
        p.notes,
        p.ratings[0] ?? "",
        p.ratings[1] ?? "",
      ]),
    },
    { escapeFormulae: FORMULA_START },
  );
}
