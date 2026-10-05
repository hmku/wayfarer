import { Journal, Place, regionOf } from "./model";
import { Bucket } from "./preferences";
import { combinedScore, scoreMap } from "./ranking";
import { categories, Category, Region, regions } from "./regions";

/** Whose scores a plot shows: one person, or Together (their average). */
export type Scorer = 0 | 1 | "together";

/** Buckets with data, highest average first; ties keep the fixed order. */
export function byAverage<K extends string>(buckets: Bucket<K>[]) {
  return buckets
    .filter((b): b is Bucket<K> & { average: number } => b.average !== null)
    .map((b, i) => ({ b, i }))
    .sort((x, y) => y.b.average - x.b.average || x.i - y.i)
    .map(({ b }) => b);
}

/** A place both people have ranked, with each person's 0–10 score. */
export type PairPoint = {
  id: string;
  name: string;
  category?: Category;
  region?: Region;
  /** Person 1's score. */
  a: number;
  /** Person 2's score. */
  b: number;
};

/** Places in one list that both people have ranked, in journal order. */
export function pairPoints(
  journal: Journal,
  status: Place["status"] = "been",
): PairPoint[] {
  const first = scoreMap(journal, 0, status);
  const second = scoreMap(journal, 1, status);
  const points: PairPoint[] = [];
  for (const p of journal.places) {
    if (p.status !== status) continue;
    const a = first.get(p.id);
    const b = second.get(p.id);
    if (a === undefined || b === undefined) continue;
    points.push({
      id: p.id,
      name: p.name,
      category: p.category,
      region: regionOf(p),
      a,
      b,
    });
  }
  return points;
}

/**
 * The Pareto frontier: points no other point beats on one score while
 * matching or beating it on the other. Points sharing exact coordinates
 * do not dominate each other, so duplicates on the frontier are all kept.
 * Returned left to right (person 1's score ascending, person 2's
 * descending), ties broken by name, ready to draw as a step line.
 */
export function paretoFrontier<T extends { a: number; b: number; name?: string }>(
  points: T[],
): T[] {
  const sorted = [...points].sort((p, q) => q.a - p.a || q.b - p.b);
  const frontier: T[] = [];
  let bestB = -Infinity;
  for (const p of sorted) {
    const last = frontier.at(-1);
    if (p.b > bestB) {
      frontier.push(p);
      bestB = p.b;
    } else if (last && p.a === last.a && p.b === last.b) {
      frontier.push(p);
    }
  }
  return frontier.sort(
    (p, q) =>
      p.a - q.a || q.b - p.b || (p.name ?? "").localeCompare(q.name ?? ""),
  );
}

const round = (n: number) => Math.round(n * 1e6);

export type Disagreement = PairPoint & {
  /** |a − b|, always > 0. */
  gap: number;
  /** The person who scores the place higher. */
  favours: 0 | 1;
};

/** The places with the largest score gap, biggest first; exact agreements are left out. */
export function biggestDisagreements(
  points: PairPoint[],
  limit = 5,
): Disagreement[] {
  return points
    .map((p) => ({
      ...p,
      gap: Math.abs(p.a - p.b),
      favours: (p.a > p.b ? 0 : 1) as 0 | 1,
    }))
    .filter((p) => p.gap > 0)
    // Rounded so float noise (10/3 vs 25/3 − 5) does not break name order on ties.
    .sort((p, q) => round(q.gap) - round(p.gap) || p.name.localeCompare(q.name))
    .slice(0, limit);
}

export type DistributionDot = {
  id: string;
  name: string;
  category?: Category;
  score: number;
};

export type DistributionRow<K extends string> = {
  key: K;
  average: number;
  /** Highest score first; ties by name. */
  dots: DistributionDot[];
};

export type Distribution = {
  categories: DistributionRow<Category>[];
  regions: DistributionRow<Region>[];
  /** Scored places with no category / no region, so in no row. */
  missingCategory: number;
  missingRegion: number;
  /** Places the scorer has a score for. */
  ranked: number;
};

/**
 * Every scored place in one list as a dot per category and per region row,
 * for one scorer. Rows without scored places are omitted; rows are ordered
 * by average, highest first, ties in the fixed category/region order.
 */
export function distribution(
  journal: Journal,
  status: Place["status"],
  scorer: Scorer,
): Distribution {
  const first = scoreMap(journal, 0, status);
  const second = scoreMap(journal, 1, status);
  const score = (id: string) =>
    scorer === 0
      ? (first.get(id) ?? null)
      : scorer === 1
        ? (second.get(id) ?? null)
        : combinedScore(first.get(id), second.get(id));
  const byCategory = new Map<Category, DistributionDot[]>();
  const byRegion = new Map<Region, DistributionDot[]>();
  let missingCategory = 0;
  let missingRegion = 0;
  let ranked = 0;
  for (const p of journal.places) {
    if (p.status !== status) continue;
    const value = score(p.id);
    if (value === null) continue;
    ranked++;
    const dot = { id: p.id, name: p.name, category: p.category, score: value };
    if (p.category) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), dot]);
    else missingCategory++;
    const region = regionOf(p);
    if (region) byRegion.set(region, [...(byRegion.get(region) ?? []), dot]);
    else missingRegion++;
  }
  const rows = <K extends string>(keys: readonly K[], map: Map<K, DistributionDot[]>) =>
    keys
      .map((key, i) => {
        const dots = map.get(key);
        if (!dots) return null;
        dots.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
        const average = dots.reduce((s, d) => s + d.score, 0) / dots.length;
        return { key, average, dots, i };
      })
      .filter((r) => r !== null)
      .sort((x, y) => y.average - x.average || x.i - y.i)
      .map(({ key, average, dots }) => ({ key, average, dots }));
  return {
    categories: rows(categories, byCategory),
    regions: rows(regions, byRegion),
    missingCategory,
    missingRegion,
    ranked,
  };
}
