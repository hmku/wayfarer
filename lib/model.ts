import { Category, inferRegion, isCategory, isRegion, Region } from "./regions";

export type Place = {
  id: string;
  name: string;
  country: string;
  /** Omitted when not chosen. */
  category?: Category;
  /** Omitted when not chosen; regionOf() then infers it from the country. */
  region?: Region;
  status: "been" | "want";
  date: string;
  notes: string;
  ratings: [number | null, number | null];
};
export type Journal = {
  version: 1;
  people: [string, string];
  places: Place[];
  // Ordered tie groups, independently maintained for each person.
  rankings?: [string[][], string[][]];
};
export const emptyJournal = (): Journal => ({
  version: 1,
  people: ["You", "Your partner"],
  places: [],
});
// Shared by journal validation and CSV import so both enforce the same caps.
export const LIMITS = {
  places: 2000,
  name: 120,
  country: 120,
  notes: 5000,
} as const;
// True for a real calendar date written as YYYY-MM-DD (rejects 2023-02-31).
export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
// Unset optional choices may arrive as undefined or "".
const optional = (value: unknown, valid: (v: unknown) => boolean) =>
  value === undefined || value === "" || valid(value);
export function validateJournal(input: unknown): Journal {
  if (!input || typeof input !== "object") throw new Error("Invalid journal.");
  const j = input as Journal;
  if (
    j.version !== 1 ||
    !Array.isArray(j.people) ||
    j.people.length !== 2 ||
    j.people.some((p) => typeof p !== "string" || !p.trim() || p.length > 40) ||
    !Array.isArray(j.places) ||
    j.places.length > LIMITS.places
  )
    throw new Error("Invalid journal.");
  const ids = new Set<string>();
  for (const p of j.places) {
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > LIMITS.name ||
      typeof p.country !== "string" ||
      p.country.length > LIMITS.country ||
      !["been", "want"].includes(p.status) ||
      typeof p.notes !== "string" ||
      p.notes.length > LIMITS.notes ||
      !optional(p.category, isCategory) ||
      !optional(p.region, isRegion) ||
      typeof p.date !== "string" ||
      (p.date !== "" && !isIsoDate(p.date)) ||
      !Array.isArray(p.ratings) ||
      p.ratings.length !== 2 ||
      p.ratings.some(
        (r) =>
          r !== null &&
          (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 10),
      )
    )
      throw new Error(
        "Check destination details and use ratings from 0 to 10.",
      );
    ids.add(p.id);
  }
  if (j.rankings !== undefined) {
    if (!Array.isArray(j.rankings) || j.rankings.length !== 2)
      throw new Error("Invalid rankings.");
    for (const groups of j.rankings) {
      if (!Array.isArray(groups) || groups.length > 2000)
        throw new Error("Invalid rankings.");
      const ranked = new Set<string>();
      for (const group of groups) {
        if (!Array.isArray(group) || !group.length || group.length > 2000)
          throw new Error("Invalid rankings.");
        for (const id of group) {
          if (typeof id !== "string" || !ids.has(id) || ranked.has(id))
            throw new Error("Invalid rankings.");
          ranked.add(id);
        }
      }
    }
  }
  return {
    version: 1,
    people: [...j.people] as [string, string],
    places: j.places.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      // Keep the stored value; location() derives the Region: fallback for display.
      country: p.country.trim(),
      ...(p.category ? { category: p.category } : {}),
      ...(p.region ? { region: p.region } : {}),
      status: p.status,
      date: p.date,
      notes: p.notes,
      ratings: p.ratings,
    })),
    ...(j.rankings
      ? {
          rankings: j.rankings.map((groups) => groups.map((g) => [...g])) as [
            string[][],
            string[][],
          ],
        }
      : {}),
  };
}

// Display location: the country field, or a legacy "Region:" line in notes.
export function location(p: Place) {
  const region = p.notes.match(/^Region:[ \t]*(.+)$/m)?.[1].trim() || "";
  return p.country.trim() || (region.length <= LIMITS.country ? region : "");
}

/** The place's region: chosen explicitly, or inferred from its location. */
export function regionOf(p: Place): Region | undefined {
  return p.region || inferRegion(location(p));
}

export function mergePlace(
  draft: Place,
  original: Place,
  latest: Place,
): Place {
  const merged = {
    ...latest,
    ratings: [...latest.ratings] as [number | null, number | null],
  };
  for (const field of [
    "name",
    "country",
    "category",
    "region",
    "status",
    "date",
    "notes",
  ] as const) {
    if (draft[field] !== original[field])
      Object.assign(merged, { [field]: draft[field] });
  }
  for (const i of [0, 1] as const) {
    if (draft.ratings[i] !== original.ratings[i])
      merged.ratings[i] = draft.ratings[i];
  }
  return merged;
}
