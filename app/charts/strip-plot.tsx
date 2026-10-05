"use client";
import { useMemo } from "react";
import { categoryLabels } from "@/lib/regions";
import { DistributionDot, DistributionRow } from "@/lib/stats-plots";
import {
  categoryColor,
  chartStyles,
  DotMark,
  formatScore,
  GridX,
  pct,
  RowLabel,
  TicksX,
  Tooltip,
  usePointNav,
} from "./primitives";
import styles from "./plots.module.css";

const ROW_HEIGHT = 36;
const LANES = [0, -7, 7, -14, 14];
/** Dots closer than this (in score units) share a lane only if no other lane is free. */
const NEAR = 0.45;

/** Vertical offsets so nearby dots sit in different lanes (a small beeswarm). */
function lanes(dots: DistributionDot[]) {
  const placed: { score: number; lane: number }[] = [];
  const result = new Map<string, number>();
  for (const d of [...dots].sort((x, y) => x.score - y.score)) {
    const free = LANES.findIndex(
      (_, lane) => !placed.some((p) => p.lane === lane && Math.abs(p.score - d.score) < NEAR),
    );
    const lane = free === -1 ? placed.length % LANES.length : free;
    placed.push({ score: d.score, lane });
    result.set(d.id, LANES[lane]);
  }
  return result;
}

/**
 * A strip (dot) plot: one row per category or region, ordered as given
 * (highest average first), each scored place a dot at its score coloured by
 * category, with the row average as a dark tick.
 */
export function StripPlot<K extends string>({
  rows,
  label,
  rowName,
  rowColor,
  scorer,
}: {
  rows: DistributionRow<K>[];
  label: (key: K) => string;
  /** Accessible noun for the rows, e.g. "category". */
  rowName: string;
  /** Identity dot beside each row name (category rows). */
  rowColor?: (key: K) => string;
  /** Whose scores, for tooltips: "Harrison" or "Together". */
  scorer: string;
}) {
  const flat = useMemo(
    () =>
      rows.flatMap((row) =>
        [...row.dots].sort((x, y) => x.score - y.score).map((dot) => ({ row, dot })),
      ),
    [rows],
  );
  const offsets = useMemo(() => rows.map((r) => lanes(r.dots)), [rows]);
  const nav = usePointNav(flat.length);
  const active = nav.active === null ? null : flat[nav.active];

  let index = 0;
  return (
    <div className={styles.strips}>
      <ul
        className={chartStyles.rows}
        aria-label={`Scores per ${rowName}. Use arrow keys to move between places.`}
      >
        {rows.map((row, r) => {
          const first = index;
          index += row.dots.length;
          const rowOffsets = offsets[r];
          return (
            <li key={row.key}>
              <RowLabel
                name={label(row.key)}
                value={row.average}
                count={row.dots.length}
                color={rowColor?.(row.key)}
              />
              <div className={`${chartStyles.plot} ${styles.strip}`} style={{ height: ROW_HEIGHT }}>
                <svg className={chartStyles.svg} role="group" aria-label={label(row.key)}>
                  <GridX />
                  <line
                    className={styles.average}
                    x1={`${pct(row.average)}%`}
                    x2={`${pct(row.average)}%`}
                    y1={3}
                    y2={ROW_HEIGHT - 3}
                    aria-hidden="true"
                  />
                  {flat.slice(first, index).map(({ dot }, j) => (
                    <DotMark
                      key={dot.id}
                      x={`${pct(dot.score)}%`}
                      y={String(ROW_HEIGHT / 2 + (rowOffsets.get(dot.id) ?? 0))}
                      r={4.5}
                      color={categoryColor(dot.category)}
                      label={`${dot.name}: ${formatScore(dot.score)}`}
                      active={nav.active === first + j}
                      nav={nav.props(first + j)}
                    />
                  ))}
                </svg>
                {active?.row === row && (
                  <Tooltip
                    x={pct(active.dot.score)}
                    y={((ROW_HEIGHT / 2 + (rowOffsets.get(active.dot.id) ?? 0)) / ROW_HEIGHT) * 100}
                    title={active.dot.name}
                    detail={
                      active.dot.category ? categoryLabels[active.dot.category] : "No category"
                    }
                    rows={[
                      { label: scorer, value: formatScore(active.dot.score) },
                      { label: `${label(row.key)} average`, value: formatScore(row.average) },
                    ]}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.stripTicks}>
        <TicksX />
      </div>
      {/* sr-only on the table itself does not clip table layout. */}
      <div className="sr-only">
      <table>
        <caption>Scores per {rowName}</caption>
        <thead>
          <tr>
            <th scope="col">{rowName}</th>
            <th scope="col">Average</th>
            <th scope="col">Places and scores</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{label(row.key)}</th>
              <td>{formatScore(row.average)}</td>
              <td>{row.dots.map((d) => `${d.name} ${formatScore(d.score)}`).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
