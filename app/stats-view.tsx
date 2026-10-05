"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, ChartBar, MapPin } from "lucide-react";
import { Journal } from "@/lib/model";
import { Breakdown, Bucket, favourites, preferences } from "@/lib/preferences";
import { categoryLabels, regionLabels } from "@/lib/regions";
import {
  biggestDisagreements,
  byAverage,
  distribution,
  pairPoints,
  Scorer,
} from "@/lib/stats-plots";
import { AgreementPlot } from "./charts/agreement-plot";
import { Disagreements } from "./charts/disagreements";
import {
  Bar,
  categoryColor,
  categoryLegendItems,
  ChartFrame,
  chartStyles,
  formatScore,
  Legend,
  RowLabel,
  Segmented,
} from "./charts/primitives";
import { StripPlot } from "./charts/strip-plot";
import { Tab } from "./journal-view";
import styles from "./stats-view.module.css";

const lists: { tab: Tab; label: string }[] = [
  { tab: "been", label: "Been" },
  { tab: "want", label: "Want to go" },
];

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
      <p className={chartStyles.note}>
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
        {joinLabels(top.map((b) => label(b.key)))} ({formatScore(top[0].average)})
      </strong>
      {top.length > 1 && <span className={styles.tie}> tied</span>}
    </p>
  );
}

function Bars<K extends string>({
  buckets,
  label,
  favourite,
  color,
}: {
  buckets: Bucket<K>[];
  label: (key: K) => string;
  favourite: Set<K>;
  color?: (key: K) => string;
}) {
  // Highest average first; rows with no ranked places are hidden, not zero.
  const shown = byAverage(buckets);
  if (!shown.length) return null;
  return (
    <ul className={chartStyles.rows}>
      {shown.map((b) => {
        const text = `${label(b.key)}: average ${formatScore(b.average)} out of 10 from ${placesText(b.count)}`;
        return (
          <li
            key={b.key}
            className={favourite.has(b.key) ? chartStyles.strong : undefined}
            title={text}
          >
            <RowLabel name={label(b.key)} value={b.average} count={b.count} />
            <Bar value={b.average} color={color?.(b.key)} />
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
  color,
}: {
  name: string;
  owner: string;
  breakdown: Breakdown;
  buckets: Bucket<K>[];
  label: (key: K) => string;
  dimension: Dimension;
  color?: (key: K) => string;
}) {
  const missing =
    dimension === "category" ? breakdown.missingCategory : breakdown.missingRegion;
  return (
    <ChartFrame title={name} label={`${name}, by ${dimension}`}>
      <Headline
        owner={owner}
        buckets={buckets}
        label={label}
        dimension={dimension}
      />
      <Bars
        buckets={buckets}
        label={label}
        color={color}
        favourite={new Set(favourites(buckets).map((b) => b.key))}
      />
      {breakdown.ranked > 0 && missing > 0 && (
        <p className={chartStyles.footnote}>
          {placesText(missing)} ranked without a {dimension}{" "}
          {missing === 1 ? "is" : "are"} not counted.
        </p>
      )}
    </ChartFrame>
  );
}

function AgreementSection({
  journal,
  tab,
  listName,
}: {
  journal: Journal;
  tab: Tab;
  listName: string;
}) {
  const points = useMemo(() => pairPoints(journal, tab), [journal, tab]);
  const gaps = useMemo(() => biggestDisagreements(points, 5), [points]);
  const [first, second] = journal.people;
  return (
    <section className={styles.section} aria-labelledby="stats-agree">
      <h2 id="stats-agree">Where you agree</h2>
      <p className={styles.sectionNote}>
        Each dot is a {listName} place you have both ranked, placed by your two
        scores.
      </p>
      {points.length < 2 ? (
        <div className={styles.emptyPlot}>
          <p>
            {points.length === 0
              ? `${first} and ${second} have not ranked any of the same ${listName} places yet.`
              : `Only one ${listName} place is ranked by both of you so far.`}{" "}
            Open a destination and choose Rank under each name. Once at least two
            places have scores from both of you, this plot shows where you agree.
          </p>
        </div>
      ) : (
        <div className={styles.agreeGrid}>
          <ChartFrame
            title={`${first} vs ${second}`}
            label="Agreement plot"
            subtitle={`${placesText(points.length)} ranked by both`}
          >
            <AgreementPlot points={points} people={journal.people} />
          </ChartFrame>
          <ChartFrame
            title="Biggest disagreements"
            label="Biggest disagreements"
            subtitle="Places with the largest gap between your scores"
          >
            {gaps.length ? (
              <Disagreements items={gaps} people={journal.people} />
            ) : (
              <p className={chartStyles.note}>
                You give every place you have both ranked the same score.
              </p>
            )}
          </ChartFrame>
        </div>
      )}
    </section>
  );
}

function DistributionSection({ journal, tab }: { journal: Journal; tab: Tab }) {
  const [scorer, setScorer] = useState<Scorer>("together");
  const dist = useMemo(() => distribution(journal, tab, scorer), [journal, tab, scorer]);
  const [first, second] = journal.people;
  const scorerName = scorer === "together" ? "Together" : journal.people[scorer];
  const options: { value: Scorer; label: string }[] = [
    { value: 0, label: first },
    { value: 1, label: second },
    { value: "together", label: "Together" },
  ];
  const anyWithoutCategory =
    dist.categories.length > 0 && dist.regions.some((r) => r.dots.some((d) => !d.category));
  return (
    <section className={styles.section} aria-labelledby="stats-spread">
      <h2 id="stats-spread">How the scores spread</h2>
      <div className={styles.plotToolbar}>
        <Segmented label="Whose scores" options={options} value={scorer} onChange={setScorer} />
        <Legend
          label="Dot colours and marks"
          items={[
            ...categoryLegendItems(anyWithoutCategory),
            { label: "Average", color: "var(--chart-mark-ink)", kind: "line" },
          ]}
        />
      </div>
      {!dist.ranked ? (
        <div className={styles.emptyPlot}>
          <p>{scorerName === "Together" ? "Neither of you has" : `${scorerName} has not`} ranked any of these places yet.</p>
        </div>
      ) : (
        <div className={styles.spreadGrid}>
          <ChartFrame
            title="By category"
            label={`${scorerName} score spread, by category`}
            subtitle="Every ranked place, highest average first"
          >
            {dist.categories.length ? (
              <StripPlot
                rows={dist.categories}
                label={(k) => categoryLabels[k]}
                rowName="category"
                rowColor={(k) => categoryColor(k)}
                scorer={scorerName}
              />
            ) : (
              <p className={chartStyles.note}>No ranked places with a category yet.</p>
            )}
            {dist.missingCategory > 0 && (
              <p className={chartStyles.footnote}>
                {placesText(dist.missingCategory)} without a category not shown.
              </p>
            )}
          </ChartFrame>
          <ChartFrame
            title="By region"
            label={`${scorerName} score spread, by region`}
            subtitle="Dots coloured by category"
          >
            {dist.regions.length ? (
              <StripPlot
                rows={dist.regions}
                label={(k) => regionLabels[k]}
                rowName="region"
                scorer={scorerName}
              />
            ) : (
              <p className={chartStyles.note}>No ranked places with a region yet.</p>
            )}
            {dist.missingRegion > 0 && (
              <p className={chartStyles.footnote}>
                {placesText(dist.missingRegion)} without a region not shown.
              </p>
            )}
          </ChartFrame>
        </div>
      )}
    </section>
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
    <div className={`${styles.view} ${chartStyles.root}`}>
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
          Every plot uses each person’s 0–10 ranking scores, sorted
          highest first. n is the number of ranked places.
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
                  color={(k) => categoryColor(k)}
                />
              ))}
            </div>
          </section>
          <section className={styles.section} aria-labelledby="stats-region">
            <h2 id="stats-region">By region</h2>
            <p className={styles.sectionNote}>
              {prefs.withoutRegion > 0
                ? `${prefs.withoutRegion} of ${prefs.total} ${prefs.withoutRegion === 1 ? "has" : "have"} no region yet. Open a destination, choose Edit, and pick one.`
                : "Each destination counts toward the region chosen for it."}
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
          <AgreementSection journal={journal} tab={tab} listName={listName} />
          <DistributionSection journal={journal} tab={tab} />
        </>
      )}
    </div>
  );
}
