export type Place = {
  id: string;
  name: string;
  country: string;
  status: "been" | "want";
  date: string;
  notes: string;
  ratings: [number | null, number | null];
};
export type Journal = { version: 1; people: [string, string]; places: Place[] };
export const emptyJournal = (): Journal => ({
  version: 1,
  people: ["You", "Your partner"],
  places: [],
});
export function average(p: Place) {
  const scores = p.ratings.filter((v): v is number => v !== null);
  return scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;
}
export function validateJournal(input: unknown): Journal {
  if (!input || typeof input !== "object") throw new Error("Invalid journal.");
  const j = input as Journal;
  if (
    j.version !== 1 ||
    !Array.isArray(j.people) ||
    j.people.length !== 2 ||
    j.people.some((p) => typeof p !== "string" || !p.trim() || p.length > 40) ||
    !Array.isArray(j.places) ||
    j.places.length > 2000
  )
    throw new Error("Invalid journal.");
  const ids = new Set<string>();
  for (const p of j.places) {
    if (
      !p ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 120 ||
      typeof p.country !== "string" ||
      p.country.length > 120 ||
      !["been", "want"].includes(p.status) ||
      typeof p.notes !== "string" ||
      p.notes.length > 5000 ||
      typeof p.date !== "string" ||
      (p.date !== "" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
          !Number.isFinite(Date.parse(p.date)))) ||
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
  return {
    version: 1,
    people: [...j.people] as [string, string],
    places: j.places.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      country: p.country.trim(),
      status: p.status,
      date: p.date,
      notes: p.notes,
      ratings: p.ratings,
    })),
  };
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
  for (const field of ["name", "country", "status", "date", "notes"] as const) {
    if (draft[field] !== original[field])
      Object.assign(merged, { [field]: draft[field] });
  }
  for (const i of [0, 1] as const) {
    if (draft.ratings[i] !== original.ratings[i])
      merged.ratings[i] = draft.ratings[i];
  }
  return merged;
}
