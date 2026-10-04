import { Journal, Place } from "./model";
import { Groups, Person } from "./ranking";

type Status = Place["status"];
const statuses: Status[] = ["been", "want"];

export const placeFields = [
  "name",
  "country",
  "status",
  "date",
  "notes",
  "rating0",
  "rating1",
] as const;
export type PlaceField = (typeof placeFields)[number];
type FieldValue = string | number | null;

/**
 * One field-level edit. `expect` is the value the editor saw; the change
 * conflicts only if that field has since become something else.
 */
export type Change =
  | { kind: "person"; index: Person; value: string; expect: string }
  /** `at` is the preferred position in the place list. */
  | { kind: "add"; place: Place; at?: number }
  | { kind: "delete"; id: string }
  | {
      kind: "field";
      id: string;
      field: PlaceField;
      value: FieldValue;
      expect: FieldValue;
    }
  | {
      kind: "ranking";
      person: Person;
      status: Status;
      groups: Groups;
      expect: Groups;
    }
  | { kind: "replace"; journal: Journal };

/** Thrown when the partner changed the same field to something else. */
export class ChangeConflict extends Error {
  constructor(what: string, message?: string) {
    super(
      message ??
        `Your partner changed ${what} at the same time. Refresh, then apply your change again.`,
    );
  }
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function getField(p: Place, field: PlaceField): FieldValue {
  if (field === "rating0") return p.ratings[0];
  if (field === "rating1") return p.ratings[1];
  return p[field];
}

function setField(p: Place, field: PlaceField, value: FieldValue): Place {
  if (field === "rating0" || field === "rating1") {
    const ratings: Place["ratings"] = [...p.ratings];
    ratings[field === "rating0" ? 0 : 1] = value as number | null;
    return { ...p, ratings };
  }
  return { ...p, [field]: value };
}

/** `groups` limited to `ids`, dropping emptied groups. */
function only(groups: Groups, ids: Set<string>): Groups {
  return groups
    .map((g) => g.filter((id) => ids.has(id)))
    .filter((g) => g.length);
}

const listIds = (j: Journal, status: Status) =>
  new Set(j.places.filter((p) => p.status === status).map((p) => p.id));

/**
 * One person's stored order for one list. Rated places that were never
 * ranked are seeded only for display, so they never count as edits here.
 */
const stored = (j: Journal, person: Person, status: Status) =>
  only(j.rankings?.[person] || [], listIds(j, status));

/**
 * Add back ids from `current` that `groups` doesn't know about (ranked by
 * someone else meanwhile), next to the neighbours they had in `current`.
 */
function keepInsertions(groups: Groups, current: Groups, keep: Set<string>) {
  const out = groups.map((g) => [...g]);
  const at = (id: string) => out.findIndex((g) => g.includes(id));
  current.forEach((group, gi) => {
    for (const id of group) {
      if (!keep.has(id)) continue;
      const mate = group.find((x) => x !== id && at(x) !== -1);
      if (mate) {
        out[at(mate)].push(id);
        continue;
      }
      let position = 0;
      search: for (let k = gi - 1; k >= 0; k--)
        for (const x of current[k])
          if (at(x) !== -1) {
            position = at(x) + 1;
            break search;
          }
      out.splice(position, 0, [id]);
    }
  });
  return out;
}

/** Replace one person's stored order for one list. */
function withRanking(
  j: Journal,
  person: Person,
  status: Status,
  groups: Groups,
): Journal {
  const others = listIds(j, status === "been" ? "want" : "been");
  const rankings: [Groups, Groups] = [
    j.rankings?.[0] || [],
    j.rankings?.[1] || [],
  ];
  rankings[person] = [
    ...only(rankings[person], others),
    ...only(groups, listIds(j, status)),
  ];
  return { ...j, rankings };
}

/** Remove a place from both people's stored orders. */
function forget(j: Journal, id: string): Journal {
  if (!j.rankings) return j;
  const drop = (groups: Groups) =>
    groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length);
  return { ...j, rankings: [drop(j.rankings[0]), drop(j.rankings[1])] };
}

/** The field-level changes that turn `before` into `after`. */
export function diffJournals(before: Journal, after: Journal): Change[] {
  const changes: Change[] = [];
  for (const index of [0, 1] as const)
    if (before.people[index] !== after.people[index])
      changes.push({
        kind: "person",
        index,
        value: after.people[index],
        expect: before.people[index],
      });
  const beforeById = new Map(before.places.map((p) => [p.id, p]));
  const afterIds = new Set(after.places.map((p) => p.id));
  for (const p of before.places)
    if (!afterIds.has(p.id)) changes.push({ kind: "delete", id: p.id });
  for (const [at, p] of after.places.entries()) {
    const old = beforeById.get(p.id);
    if (!old) {
      changes.push({ kind: "add", place: p, at });
      continue;
    }
    for (const field of placeFields) {
      const value = getField(p, field);
      const expect = getField(old, field);
      if (value !== expect)
        changes.push({ kind: "field", id: p.id, field, value, expect });
    }
  }
  for (const person of [0, 1] as const)
    for (const status of statuses) {
      const expect = stored(before, person, status);
      const groups = stored(after, person, status);
      // Places that only left the list (deleted or moved) aren't a reorder.
      if (!same(groups, only(expect, listIds(after, status))))
        changes.push({ kind: "ranking", person, status, groups, expect });
    }
  return changes;
}

/**
 * Apply changes to the latest journal. Throws ChangeConflict when a field
 * this change touches was changed differently by someone else.
 */
export function applyChanges(journal: Journal, changes: Change[]): Journal {
  let j = journal;
  for (const c of changes) {
    switch (c.kind) {
      case "replace":
        j = c.journal;
        break;
      case "person": {
        const current = j.people[c.index];
        if (current !== c.expect && current !== c.value)
          throw new ChangeConflict("the names");
        const people: [string, string] = [...j.people];
        people[c.index] = c.value;
        j = { ...j, people };
        break;
      }
      case "add": {
        const existing = j.places.find((p) => p.id === c.place.id);
        if (existing && !same(existing, c.place))
          throw new ChangeConflict(c.place.name);
        if (!existing)
          j = {
            ...j,
            places: j.places.toSpliced(
              Math.min(c.at ?? j.places.length, j.places.length),
              0,
              c.place,
            ),
          };
        break;
      }
      case "delete":
        j = forget(
          { ...j, places: j.places.filter((p) => p.id !== c.id) },
          c.id,
        );
        break;
      case "field": {
        const place = j.places.find((p) => p.id === c.id);
        if (!place)
          throw new ChangeConflict(
            "",
            "Your partner removed this destination. Refresh to see the latest journal.",
          );
        const current = getField(place, c.field);
        if (current !== c.expect && current !== c.value)
          throw new ChangeConflict(
            `${place.name}'s ${c.field.startsWith("rating") ? "rating" : c.field}`,
          );
        j = {
          ...j,
          places: j.places.map((p) =>
            p.id === c.id ? setField(p, c.field, c.value) : p,
          ),
        };
        // A place that changes lists starts unranked in its new list.
        if (c.field === "status" && current !== c.value) j = forget(j, c.id);
        break;
      }
      case "ranking": {
        const ids = listIds(j, c.status);
        const current = stored(j, c.person, c.status);
        const groups = only(c.groups, ids);
        // Compare only places the editor knew about, so places added or
        // removed meanwhile don't count as a reorder.
        const seen = new Set(c.expect.flat());
        if (
          !same(only(current, seen), only(c.expect, ids)) &&
          !same(current, groups)
        )
          throw new ChangeConflict(
            `${j.people[c.person]}'s ${c.status === "been" ? "Been" : "Want to go"} ranking`,
          );
        const placed = new Set(groups.flat());
        const inserted = new Set(
          current.flat().filter((id) => !seen.has(id) && !placed.has(id)),
        );
        j = withRanking(
          j,
          c.person,
          c.status,
          keepInsertions(groups, current, inserted),
        );
        break;
      }
    }
  }
  return j;
}

/** Shape check for changes received over the network. Values are checked
 * afterwards by validating the resulting journal. */
export function parseChanges(input: unknown): Change[] {
  // Enough for a full import or clearing every rating; far below anything
  // that would stall the server.
  if (!Array.isArray(input) || input.length > 5_000)
    throw new Error("Invalid changes.");
  const rankingKeys = new Set<string>();
  const isGroups = (g: unknown): g is Groups =>
    Array.isArray(g) &&
    g.every((x) => Array.isArray(x) && x.every((id) => typeof id === "string"));
  const scalar = (v: unknown) =>
    v === null || typeof v === "string" || typeof v === "number";
  for (const c of input as Change[]) {
    const ok =
      !!c &&
      typeof c === "object" &&
      ((c.kind === "person" &&
        (c.index === 0 || c.index === 1) &&
        typeof c.value === "string" &&
        typeof c.expect === "string") ||
        (c.kind === "add" &&
          !!c.place &&
          typeof c.place === "object" &&
          (c.at === undefined || (Number.isInteger(c.at) && c.at >= 0))) ||
        (c.kind === "delete" && typeof c.id === "string") ||
        (c.kind === "field" &&
          typeof c.id === "string" &&
          placeFields.includes(c.field) &&
          scalar(c.value) &&
          scalar(c.expect)) ||
        (c.kind === "ranking" &&
          (c.person === 0 || c.person === 1) &&
          statuses.includes(c.status) &&
          isGroups(c.groups) &&
          isGroups(c.expect)) ||
        (c.kind === "replace" && !!c.journal && typeof c.journal === "object"));
    if (!ok) throw new Error("Invalid changes.");
    if (c.kind === "ranking") {
      // At most one order per person and list in a single save.
      const key = `${c.person}:${c.status}`;
      if (rankingKeys.has(key)) throw new Error("Invalid changes.");
      rankingKeys.add(key);
    }
  }
  return input as Change[];
}
