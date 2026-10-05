import { Disagreement } from "@/lib/stats-plots";
import { categoryColor, chartStyles, formatScore, Legend, pct, swatch } from "./primitives";
import styles from "./plots.module.css";

/**
 * The places with the biggest score gaps: a 0–10 dumbbell per place (filled
 * dot for person 1, ring for person 2) with both scores written out.
 */
export function Disagreements({
  items,
  people,
}: {
  items: Disagreement[];
  people: [string, string];
}) {
  const [first, second] = people;
  return (
    <>
      <Legend
        label="Markers"
        items={[
          { label: first, color: "var(--chart-mark-ink)", kind: "dot" },
          { label: second, color: "var(--chart-mark-ink)", kind: "ring" },
        ]}
      />
      <ol className={chartStyles.rows} aria-label="Places by score gap">
        {items.map((d) => {
          const low = Math.min(d.a, d.b);
          const high = Math.max(d.a, d.b);
          return (
            <li key={d.id} className={styles.gapRow}>
              <span className={chartStyles.rowLabel}>
                <span className={chartStyles.rowName}>
                  <span
                    className={chartStyles.swatch}
                    style={swatch(categoryColor(d.category))}
                    aria-hidden="true"
                  />
                  {d.name}
                </span>
                <span className={styles.gapWho}>{people[d.favours]} likes it more</span>
              </span>
              <span className={styles.dumbbell} aria-hidden="true">
                <span
                  className={styles.dumbbellLine}
                  style={{ left: `${pct(low)}%`, width: `${pct(high - low)}%` }}
                />
                <span className={styles.personA} style={{ left: `${pct(d.a)}%` }} />
                <span className={styles.personB} style={{ left: `${pct(d.b)}%` }} />
              </span>
              <span className={styles.gapScores}>
                {first} <strong>{formatScore(d.a)}</strong> · {second}{" "}
                <strong>{formatScore(d.b)}</strong> · gap {formatScore(d.gap)}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
