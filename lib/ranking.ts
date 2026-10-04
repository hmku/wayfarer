import { Journal, Place } from "./model";
export type Person = 0 | 1;
export type Groups = string[][];

export function personalGroups(
  j: Journal,
  person: Person,
  status: Place["status"],
): Groups {
  const eligible = j.places.filter((p) => p.status === status);
  const ids = new Set(eligible.map((p) => p.id));
  const groups = (j.rankings?.[person] || [])
    .map((g) => g.filter((id) => ids.has(id)))
    .filter((g) => g.length);
  const known = new Set(groups.flat());
  const seed = eligible
    .filter((p) => !known.has(p.id) && p.ratings[person] !== null)
    .sort(
      (a, b) =>
        b.ratings[person]! - a.ratings[person]! || a.name.localeCompare(b.name),
    );
  let previous: number | null = null;
  for (const p of seed) {
    if (p.ratings[person] !== previous) groups.push([]);
    groups.at(-1)!.push(p.id);
    previous = p.ratings[person];
  }
  return groups;
}

export function scoreMap(j: Journal, person: Person, status: Place["status"]) {
  const groups = personalGroups(j, person, status);
  const scores = new Map<string, number>();
  groups.forEach((group, i) => {
    const score =
      groups.length === 1
        ? 10
        : (10 * (groups.length - 1 - i)) / (groups.length - 1);
    group.forEach((id) => scores.set(id, score));
  });
  return scores;
}

export function combinedScore(
  a: number | undefined,
  b: number | undefined,
): number | null {
  if (a === undefined) return b ?? null;
  if (b === undefined) return a;
  return (a + b) / 2;
}

export function removeFromGroups(groups: Groups, id: string): Groups {
  return groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length);
}

export function insertIntoGroups(
  groups: Groups,
  id: string,
  position: number,
  tied: boolean,
): Groups {
  const result = groups.map((g) => [...g]);
  if (tied) result[position].push(id);
  else result.splice(position, 0, [id]);
  return result;
}

export function saveRanking(
  j: Journal,
  p: Place,
  person: Person,
  groups: Groups,
): Journal {
  const latest = j.places.find((x) => x.id === p.id);
  if (!latest || latest.status !== p.status)
    throw new Error(
      "This destination changed. Refresh and restart comparisons.",
    );
  const expected = new Set([
    ...personalGroups(j, person, p.status).flat(),
    p.id,
  ]);
  const actual = groups.flat();
  if (
    actual.length !== expected.size ||
    actual.some((id) => !expected.has(id)) ||
    new Set(actual).size !== actual.length
  )
    throw new Error("The list changed. Refresh and restart comparisons.");
  const otherIds = new Set(
    j.places.filter((x) => x.status !== p.status).map((x) => x.id),
  );
  const other = (j.rankings?.[person] || [])
    .map((g) => g.filter((id) => otherIds.has(id)))
    .filter((g) => g.length);
  const rankings: [Groups, Groups] = [
    j.rankings?.[0] || [],
    j.rankings?.[1] || [],
  ];
  rankings[person] = [...other, ...groups];
  return { ...j, rankings };
}

export function forgetRanking(j: Journal, id: string): Journal {
  return j.rankings
    ? {
        ...j,
        rankings: j.rankings.map((g) => removeFromGroups(g, id)) as [
          Groups,
          Groups,
        ],
      }
    : j;
}
