import { Journal, location } from "./model";

export type CountryCount = {
  /** Case-insensitive grouping key (lowercased, trimmed location). */
  key: string;
  /** Display label: the most common spelling within the group. */
  label: string;
  been: number;
  want: number;
};

export function countryKey(value: string) {
  return value.trim().toLowerCase();
}

/** Locations across both lists, grouped case-insensitively, most places first. */
export function countryBreakdown(journal: Journal): CountryCount[] {
  const groups = new Map<
    string,
    { been: number; want: number; spellings: Map<string, number> }
  >();
  for (const p of journal.places) {
    const label = location(p).trim();
    if (!label) continue;
    const key = countryKey(label);
    const group = groups.get(key) ?? {
      been: 0,
      want: 0,
      spellings: new Map<string, number>(),
    };
    group[p.status]++;
    group.spellings.set(label, (group.spellings.get(label) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: [...g.spellings.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0][0],
      been: g.been,
      want: g.want,
    }))
    .sort(
      (a, b) =>
        b.been + b.want - (a.been + a.want) ||
        b.been - a.been ||
        a.label.localeCompare(b.label),
    );
}

export function journalStats(journal: Journal) {
  let been = 0;
  let want = 0;
  const visitedLocations = new Set<string>();
  for (const p of journal.places) {
    if (p.status === "been") {
      been++;
      const key = countryKey(location(p));
      if (key) visitedLocations.add(key);
    } else want++;
  }
  return { been, want, countries: visitedLocations.size };
}
