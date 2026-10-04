import { Journal, Place, regionOf } from "./model";
import { combinedScore, scoreMap } from "./ranking";
import { categories, Category, Region, regions } from "./regions";

/** Average score of the ranked places in one category or region. */
export type Bucket<K extends string> = {
  key: K;
  /** Mean 0–10 score, or null when no place in the bucket is ranked. */
  average: number | null;
  /** Ranked places in the bucket. */
  count: number;
};

/** One scorer's (a person's, or Together's) preferences for a list. */
export type Breakdown = {
  /** Every category, in the fixed `categories` order. */
  categories: Bucket<Category>[];
  /** Every region, in the fixed `regions` order. */
  regions: Bucket<Region>[];
  /** Places this scorer has a score for. */
  ranked: number;
  /** Ranked places with no category, so they count in no category bucket. */
  missingCategory: number;
  /** Ranked places with no region (none chosen and none inferable). */
  missingRegion: number;
};

export type Preferences = {
  status: Place["status"];
  /** Places in the list, ranked or not. */
  total: number;
  /** Places in the list with no category / no region, ranked or not. */
  withoutCategory: number;
  withoutRegion: number;
  people: [Breakdown, Breakdown];
  together: Breakdown;
};

function breakdown(
  places: Place[],
  score: (p: Place) => number | null,
): Breakdown {
  const sums = new Map<string, { total: number; count: number }>();
  const add = (key: string, value: number) => {
    const s = sums.get(key) ?? { total: 0, count: 0 };
    s.total += value;
    s.count++;
    sums.set(key, s);
  };
  let ranked = 0;
  let missingCategory = 0;
  let missingRegion = 0;
  for (const p of places) {
    const value = score(p);
    if (value === null) continue;
    ranked++;
    if (p.category) add(`c:${p.category}`, value);
    else missingCategory++;
    const region = regionOf(p);
    if (region) add(`r:${region}`, value);
    else missingRegion++;
  }
  const bucket = <K extends string>(prefix: string, key: K): Bucket<K> => {
    const s = sums.get(`${prefix}:${key}`);
    return {
      key,
      average: s ? s.total / s.count : null,
      count: s?.count ?? 0,
    };
  };
  return {
    categories: categories.map((c) => bucket("c", c)),
    regions: regions.map((r) => bucket("r", r)),
    ranked,
    missingCategory,
    missingRegion,
  };
}

/**
 * Per-category and per-region average scores for each person and for
 * Together (each place's average of the available personal scores), over one
 * list. Unranked places count only towards `total` and the `without*` counts.
 */
export function preferences(
  journal: Journal,
  status: Place["status"] = "been",
): Preferences {
  const places = journal.places.filter((p) => p.status === status);
  const first = scoreMap(journal, 0, status);
  const second = scoreMap(journal, 1, status);
  return {
    status,
    total: places.length,
    withoutCategory: places.filter((p) => !p.category).length,
    withoutRegion: places.filter((p) => !regionOf(p)).length,
    people: [
      breakdown(places, (p) => first.get(p.id) ?? null),
      breakdown(places, (p) => second.get(p.id) ?? null),
    ],
    together: breakdown(places, (p) =>
      combinedScore(first.get(p.id), second.get(p.id)),
    ),
  };
}

/**
 * The highest-scoring buckets (several when tied at one decimal place), or
 * none when fewer than two buckets have ranked places to compare.
 */
export function favourites<K extends string>(buckets: Bucket<K>[]) {
  const scored = buckets.filter(
    (b): b is Bucket<K> & { average: number } => b.average !== null,
  );
  if (scored.length < 2) return [];
  const round = (n: number) => Math.round(n * 10) / 10;
  const best = Math.max(...scored.map((b) => round(b.average)));
  return scored.filter((b) => round(b.average) === best);
}
