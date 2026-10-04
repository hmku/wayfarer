"use client";
import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Bookmark, ChartBar, MapPin } from "lucide-react";
import { Journal } from "@/lib/model";
import { Breakdown, Bucket, favourites, preferences } from "@/lib/preferences";
import { categoryLabels, regionLabels } from "@/lib/regions";
import { Tab } from "./journal-view";
import styles from "./stats-view.module.css";

const lists: { tab: Tab; label: string }[] = [
  { tab: "been", label: "Been" },
  { tab: "want", label: "Want to go" },
];

const format = (n: number) => n.toFixed(1);
const placesText = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;

function joinLabels(labels: string[]) {
  return labels.length < 2
    ? labels.join("")
    : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

type Dimension = "category" | "region";

function Headline<K extends string>({
  owner,
  buckets,
  label,
  dimension,
}: {
  /** "Alex's", or "Your shared" for Together. */
  owner: string;
  buckets: Bucket<K>[];
  label: (key: K) => string;
  dimension: Dimension;
}) {
  const top = favourites(buckets);
  const scored = buckets.filter((b) => b.count > 0).length;
  if (!top.length)
    return (
      <p className={styles.note}>
        {scored
          ? `Rank places in another ${dimension} to compare.`
          : `No ranked places with a ${dimension} yet.`}
      </p>
    );
  const noun = dimension === "category" ? "favourite" : "favourite region";
  return (
    <p className={styles.headline}>
      {owner} {top.length > 1 ? `${noun}s` : noun}:{" "}
      <strong>
        {joinLabels(top.map((b) => label(b.key)))} ({format(top[0].average)})
      </strong>
      {top.length > 1 && <span className={styles.tie}> tied</span>}
    </p>
  );
}

function Bars<K extends string>({
  buckets,
  label,
  favourite,
}: {
  buckets: Bucket<K>[];
  label: (key: K) => string;
  favourite: Set<K>;
}) {
  // Rows with no ranked places are hidden rather than drawn as zero.
  const shown = buckets.filter(
    (b): b is Bucket<K> & { average: number } => b.average !== null,
  );
  if (!shown.length) return null;
  return (
    <ul className={styles.bars}>
      {shown.map((b) => {
        const text = `${label(b.key)}: average ${format(b.average)} out of 10 from ${placesText(b.count)}`;
        return (
          <li
            key={b.key}
            className={favourite.has(b.key) ? styles.favourite : undefined}
            title={text}
          >
            <span className={styles.barLabel}>
              <span className={styles.name}>{label(b.key)}</span>
              <span className={styles.value}>
                <strong>{format(b.average)}</strong>
                <span className={styles.count}>
                  {" "}
                  · n = {b.count}
                  <span className="sr-only"> ranked {b.count === 1 ? "place" : "places"}</span>
                </span>
              </span>
            </span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={styles.bar}
                style={{ width: `${b.average * 10}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Panel<K extends string>({
  name,
  owner,
  breakdown,
  buckets,
  label,
  dimension,
}: {
  name: string;
  owner: string;
  breakdown: Breakdown;
  buckets: Bucket<K>[];
  label: (key: K) => string;
  dimension: Dimension;
}) {
  const missing =
    dimension === "category" ? breakdown.missingCategory : breakdown.missingRegion;
  return (
    <article className={styles.panel} aria-label={`${name}, by ${dimension}`}>
      <h3>{name}</h3>
      <Headline
        owner={owner}
        buckets={buckets}
        label={label}
        dimension={dimension}
      />
      <Bars
        buckets={buckets}
        label={label}
        favourite={new Set(favourites(buckets).map((b) => b.key))}
      />
      {breakdown.ranked > 0 && missing > 0 && (
        <p className={styles.footnote}>
          {placesText(missing)} ranked without a {dimension}{" "}
          {missing === 1 ? "is" : "are"} not counted.
        </p>
      )}
    </article>
  );
}

export function StatsView({
  journal,
  tab,
  loaded,
  onTab,
  onBack,
}: {
  journal: Journal;
  tab: Tab;
  loaded: boolean;
  onTab: (tab: Tab) => void;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const prefs = useMemo(() => preferences(journal, tab), [journal, tab]);
  const counts = useMemo(
    () => ({
      been: journal.places.filter((p) => p.status === "been").length,
      want: journal.places.filter((p) => p.status === "want").length,
    }),
    [journal],
  );
  const [first, second] = journal.people;
  const scorers = [
    { name: first, owner: `${first}’s`, breakdown: prefs.people[0] },
    { name: second, owner: `${second}’s`, breakdown: prefs.people[1] },
    { name: "Together", owner: "Your shared", breakdown: prefs.together },
  ];
  const anyRanked = prefs.together.ranked > 0;
  const listName = tab === "been" ? "Been" : "Want to go";

  return (
    <div className={styles.view}>
      <div className={styles.heading}>
        <button type="button" className="subtle" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to list
        </button>
        <h1 ref={headingRef} tabIndex={-1}>
          <ChartBar size={24} aria-hidden="true" />
          Stats
        </h1>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toggle} role="group" aria-label="Which list">
          {lists.map((l, i) => (
            <button
              key={l.tab}
              type="button"
              aria-pressed={tab === l.tab}
              title={`Shortcut: ${i + 1}`}
              onClick={() => onTab(l.tab)}
            >
              {l.tab === "been" ? (
                <MapPin size={15} aria-hidden="true" />
              ) : (
                <Bookmark size={15} aria-hidden="true" />
              )}
              {l.label} <span className={styles.badge}>{counts[l.tab]}</span>
            </button>
          ))}
        </div>
        <p className={styles.explain}>
          Average of each person’s 0–10 ranking scores. n is the number of
          ranked places.
        </p>
      </div>

      {!loaded ? (
        <div className={styles.empty}>
          <p>Loading…</p>
        </div>
      ) : !prefs.total ? (
        <div className={styles.empty}>
          <h2>No {listName} destinations yet</h2>
          <p>Add destinations to this list, then rank them to see preferences.</p>
        </div>
      ) : !anyRanked ? (
        <div className={styles.empty}>
          <h2>Nothing ranked yet</h2>
          <p>
            Open a destination and choose Rank under your name. Averages appear
            here once places in this list have scores.
          </p>
        </div>
      ) : (
        <>
          {prefs.withoutCategory > 0 && (
            <p className={styles.callout}>
              {prefs.withoutCategory === prefs.total
                ? `None of your ${listName} destinations has a category yet.`
                : `${prefs.withoutCategory} of ${prefs.total} ${listName} destinations ${prefs.withoutCategory === 1 ? "has" : "have"} no category.`}{" "}
              Open a destination, choose Edit, and pick City, Nature, or Beach.
            </p>
          )}
          <section className={styles.section} aria-labelledby="stats-category">
            <h2 id="stats-category">By category</h2>
            <div className={styles.grid}>
              {scorers.map((s, i) => (
                <Panel
                  key={i}
                  name={s.name}
                  owner={s.owner}
                  breakdown={s.breakdown}
                  buckets={s.breakdown.categories}
                  label={(k) => categoryLabels[k]}
                  dimension="category"
                />
              ))}
            </div>
          </section>
          <section className={styles.section} aria-labelledby="stats-region">
            <h2 id="stats-region">By region</h2>
            <p className={styles.sectionNote}>
              Regions come from each destination’s country unless one is chosen
              when editing.
              {prefs.withoutRegion > 0 &&
                ` ${prefs.withoutRegion} of ${prefs.total} ${prefs.withoutRegion === 1 ? "has" : "have"} no recognisable region.`}
            </p>
            <div className={styles.grid}>
              {scorers.map((s, i) => (
                <Panel
                  key={i}
                  name={s.name}
                  owner={s.owner}
                  breakdown={s.breakdown}
                  buckets={s.breakdown.regions}
                  label={(k) => regionLabels[k]}
                  dimension="region"
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
