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
  const stored = (j.rankings?.[person] || [])
    .map((g) => g.filter((id) => ids.has(id)))
    .filter((g) => g.length);
  const known = new Set(stored.flat());
  const seeds = seedGroups(
    eligible.filter((p) => !known.has(p.id) && p.ratings[person] !== null),
    person,
  );
  if (!seeds.length) return stored;
  const rating = new Map(eligible.map((p) => [p.id, p.ratings[person]]));
  return mergeSeeds(stored, seeds, (id) => rating.get(id) ?? null);
}

type Seed = { rating: number; ids: string[] };

// Rated places without a stored position, grouped by equal original rating.
function seedGroups(places: Place[], person: Person): Seed[] {
  const seeds: Seed[] = [];
  const sorted = [...places].sort(
    (a, b) =>
      b.ratings[person]! - a.ratings[person]! || a.name.localeCompare(b.name),
  );
  for (const p of sorted) {
    const rating = p.ratings[person]!;
    if (seeds.at(-1)?.rating !== rating) seeds.push({ rating, ids: [] });
    seeds.at(-1)!.ids.push(p.id);
  }
  return seeds;
}

// Places each seed group (highest rating first) into the stored order: before
// the first stored group whose best original rating is lower, or into a stored
// group whose rated members all share the seed's rating. Stored groups with no
// original ratings give no signal and are passed over. Stored order is kept.
function mergeSeeds(
  stored: Groups,
  seeds: Seed[],
  originalRating: (id: string) => number | null,
): Groups {
  const result: Groups = [];
  let next = 0;
  for (const group of stored) {
    const merged = [...group];
    const ratings = group
      .map(originalRating)
      .filter((r): r is number => r !== null);
    if (ratings.length) {
      const best = Math.max(...ratings);
      const uniform = ratings.every((r) => r === best);
      while (next < seeds.length && seeds[next].rating >= best) {
        const seed = seeds[next];
        if (seed.rating > best) result.push([...seed.ids]);
        else if (uniform) merged.push(...seed.ids);
        else break;
        next++;
      }
    }
    result.push(merged);
  }
  for (const seed of seeds.slice(next)) result.push([...seed.ids]);
  return result;
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
  return replaceRanking(j, person, p.status, groups);
}

function replaceRanking(
  j: Journal,
  person: Person,
  status: Place["status"],
  groups: Groups,
): Journal {
  const otherIds = new Set(
    j.places.filter((x) => x.status !== status).map((x) => x.id),
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

export function moveRanking(
  j: Journal,
  person: Person,
  status: Place["status"],
  targetId: string,
  anchorId: string,
  side: "before" | "after",
): Journal {
  const target = j.places.find((p) => p.id === targetId);
  const anchor = j.places.find((p) => p.id === anchorId);
  if (
    !target ||
    !anchor ||
    target.status !== status ||
    anchor.status !== status
  )
    throw new Error("The list changed. Refresh and try again.");
  if (targetId === anchorId) return j;

  const groups = removeFromGroups(personalGroups(j, person, status), targetId);
  let position = groups.findIndex((group) => group.includes(anchorId));
  if (position === -1) {
    position = groups.length;
    groups.push([anchorId]);
  }
  groups.splice(position + (side === "after" ? 1 : 0), 0, [targetId]);
  return replaceRanking(j, person, status, groups);
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

// Every place unrated for both people, with no stored rankings.
export function clearRatings(j: Journal): Journal {
  return {
    version: j.version,
    people: j.people,
    places: j.places.map((p) => ({ ...p, ratings: [null, null] })),
  };
}
