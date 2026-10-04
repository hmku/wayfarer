import { Journal, Place } from "./model";
import { Groups, Person, personalGroups } from "./ranking";

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
      const expect = personalGroups(before, person, status);
      const groups = personalGroups(after, person, status);
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
        const current = personalGroups(j, c.person, c.status);
        // Compare only places both versions know about, so additions and
        // removals elsewhere in the list don't count as a reorder.
        const seen = new Set(c.expect.flat());
        if (
          !same(only(current, seen), only(c.expect, listIds(j, c.status))) &&
          !same(current, only(c.groups, listIds(j, c.status)))
        )
          throw new ChangeConflict(
            `${j.people[c.person]}'s ${c.status === "been" ? "Been" : "Want to go"} ranking`,
          );
        j = withRanking(j, c.person, c.status, c.groups);
        break;
      }
    }
  }
  return j;
}

/** Shape check for changes received over the network. Values are checked
 * afterwards by validating the resulting journal. */
export function parseChanges(input: unknown): Change[] {
  if (!Array.isArray(input) || input.length > 20_000)
    throw new Error("Invalid changes.");
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
  }
  return input as Change[];
}
