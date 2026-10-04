import { Journal, location, Place } from "@/lib/model";
import { combinedScore, Person, scoreMap } from "@/lib/ranking";
import { countryKey } from "@/lib/stats";

export type Tab = Place["status"];
/** Whose score a score sort (and reordering) uses. */
export type ScorePerson = "together" | "first" | "second";
/** How the list is ordered. Visit-date orders only apply to Been. */
export type SortOrder = "score" | "name" | "recent" | "oldest" | "country";
export type Sort = { order: SortOrder; person: ScorePerson };

export const defaultSort: Sort = { order: "score", person: "together" };

export const dateOrders: SortOrder[] = ["recent", "oldest"];

/** Visit-date sorts are meaningless for the wishlist; fall back to score. */
export function effectiveSort(sort: Sort, tab: Tab): Sort {
  return tab === "want" && dateOrders.includes(sort.order)
    ? { ...sort, order: "score" }
    : sort;
}

/** Single `<select>` value: the person for score sorts, otherwise the order. */
export function sortValue(sort: Sort): string {
  return sort.order === "score" ? sort.person : sort.order;
}

export function parseSortValue(value: string, current: Sort): Sort {
  if (value === "together" || value === "first" || value === "second")
    return { order: "score", person: value };
  if (["name", "recent", "oldest", "country"].includes(value))
    return { ...current, order: value as SortOrder };
  return current;
}

export function personIndex(person: ScorePerson): Person {
  return person === "second" ? 1 : 0;
}

export type JournalView = {
  /** Visible rows, filtered and ordered. */
  list: Place[];
  /** Value shown in the # column, keyed by place id. */
  ranks: Map<string, number>;
  scores: [Map<string, number>, Map<string, number>];
  /** Number of places in the current tab before search/filter. */
  total: number;
};

export function deriveView(
  journal: Journal,
  tab: Tab,
  sort: Sort,
  query: string,
  country: string,
): JournalView {
  const first = scoreMap(journal, 0, tab);
  const second = scoreMap(journal, 1, tab);
  const selected = (p: Place): number | null =>
    sort.person === "first"
      ? (first.get(p.id) ?? null)
      : sort.person === "second"
        ? (second.get(p.id) ?? null)
        : combinedScore(first.get(p.id), second.get(p.id));
  const inTab = journal.places.filter((p) => p.status === tab);
  const byName = (a: Place, b: Place) => a.name.localeCompare(b.name);
  const byScore = (a: Place, b: Place) =>
    (selected(b) ?? -1) - (selected(a) ?? -1) || byName(a, b);
  const compare: Record<SortOrder, (a: Place, b: Place) => number> = {
    score: byScore,
    name: byName,
    // Undated visits sort last in both date orders.
    recent: (a, b) =>
      Number(!a.date) - Number(!b.date) ||
      b.date.localeCompare(a.date) ||
      byName(a, b),
    oldest: (a, b) =>
      Number(!a.date) - Number(!b.date) ||
      a.date.localeCompare(b.date) ||
      byName(a, b),
    country: (a, b) => {
      const la = location(a);
      const lb = location(b);
      return (
        Number(!la) - Number(!lb) ||
        la.localeCompare(lb, undefined, { sensitivity: "base" }) ||
        byName(a, b)
      );
    },
  };
  const ranked = inTab.toSorted(byScore);
  const ranks = new Map<string, number>();
  if (sort.order === "score") {
    // Competition ranking over the whole tab, so ties share a number and
    // ranks stay stable while searching.
    ranked.forEach((p, i) => {
      const score = selected(p);
      if (score === null) return;
      const previous = ranked[i - 1];
      ranks.set(
        p.id,
        i > 0 && score === selected(previous) ? ranks.get(previous.id)! : i + 1,
      );
    });
  }
  const needle = query.trim().toLowerCase();
  const list = (sort.order === "score" ? ranked : inTab.toSorted(compare[sort.order]))
    .filter((p) => !country || countryKey(location(p)) === country)
    .filter(
      (p) =>
        !needle ||
        `${p.name} ${location(p)} ${p.notes}`.toLowerCase().includes(needle),
    );
  // Non-score orders have no rank; # shows the row position instead.
  if (sort.order !== "score") list.forEach((p, i) => ranks.set(p.id, i + 1));
  return { list, ranks, scores: [first, second], total: inTab.length };
}
