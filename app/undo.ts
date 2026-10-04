import { Journal, Place } from "@/lib/model";
import {
  forgetRanking,
  Groups,
  insertIntoGroups,
  Person,
  personalGroups,
  removeFromGroups,
  saveRanking,
} from "@/lib/ranking";

/** Enough to put a deleted or moved place back where it was. */
export type PlaceSnapshot = {
  place: Place;
  /** Position in journal.places. */
  index: number;
  /** Each person's ordered tie groups for the place's list at snapshot time. */
  groups: [Groups, Groups];
};

export function snapshotPlace(
  journal: Journal,
  id: string,
): PlaceSnapshot | undefined {
  const index = journal.places.findIndex((p) => p.id === id);
  if (index === -1) return undefined;
  const place = structuredClone(journal.places[index]);
  return {
    place,
    index,
    groups: [
      personalGroups(journal, 0, place.status),
      personalGroups(journal, 1, place.status),
    ],
  };
}

/** Where to re-insert `id` into `current`, based on its old neighbours. */
function restoredGroups(current: Groups, original: Groups, id: string): Groups {
  const groups = removeFromGroups(current, id);
  const k = original.findIndex((g) => g.includes(id));
  if (k === -1) return groups;
  const groupOf = (other: string) => groups.findIndex((g) => g.includes(other));
  // Still tied with someone from its old group? Rejoin that tie, keeping its
  // place among the tied ids.
  for (const mate of original[k]) {
    if (mate === id) continue;
    const at = groupOf(mate);
    if (at === -1) continue;
    const before = new Set(original[k].slice(0, original[k].indexOf(id)));
    const group = groups[at];
    const after = group.findLastIndex((x) => before.has(x)) + 1;
    return groups.with(at, group.toSpliced(after, 0, id));
  }
  // Otherwise sit just below the nearest surviving group that was above it.
  for (let i = k - 1; i >= 0; i--) {
    for (const above of original[i]) {
      const at = groupOf(above);
      if (at !== -1) return insertIntoGroups(groups, id, at + 1, false);
    }
  }
  return insertIntoGroups(groups, id, 0, false);
}

/** Put the snapshot's place back, with both people's rankings restored. */
export function restorePlace(journal: Journal, snapshot: PlaceSnapshot): Journal {
  const { place } = snapshot;
  const base = forgetRanking(journal, place.id);
  const exists = base.places.some((p) => p.id === place.id);
  const places = exists
    ? base.places.map((p) => (p.id === place.id ? place : p))
    : base.places.toSpliced(
        Math.min(snapshot.index, base.places.length),
        0,
        place,
      );
  let next: Journal = { ...base, places };
  for (const person of [0, 1] as Person[]) {
    const original = snapshot.groups[person];
    if (!original.some((g) => g.includes(place.id))) continue;
    next = saveRanking(
      next,
      place,
      person,
      restoredGroups(
        personalGroups(next, person, place.status),
        original,
        place.id,
      ),
    );
  }
  return next;
}
