"use client";
import { useMemo } from "react";
import { categoryLabels, regionLabels } from "@/lib/regions";
import { PairPoint, paretoFrontier } from "@/lib/stats-plots";
import {
  categoryColor,
  categoryLegendItems,
  chartStyles,
  DotMark,
  formatScore,
  GridX,
  GridY,
  Legend,
  pct,
  TicksX,
  TicksY,
  Tooltip,
  usePointNav,
} from "./primitives";
import styles from "./plots.module.css";

/** Small offsets (in % of the plot) for points sharing exact coordinates. */
function spread(points: PairPoint[]) {
  const groups = new Map<string, PairPoint[]>();
  for (const p of points) {
    const key = `${p.a}|${p.b}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const offsets = new Map<string, { dx: number; dy: number }>();
  for (const group of groups.values()) {
    group.forEach((p, j) => {
      if (group.length === 1) return offsets.set(p.id, { dx: 0, dy: 0 });
      const angle = (2 * Math.PI * j) / group.length - Math.PI / 4;
      const radius = 1.6;
      offsets.set(p.id, { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) });
    });
  }
  return offsets;
}

function namesText(names: string[], max = 6) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const list = rest > 0 ? [...shown, `${rest} more`] : shown;
  return list.length < 2
    ? list.join("")
    : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

/**
 * "Where you agree": person 1's score across, person 2's up, one dot per
 * place both have ranked. The dashed diagonal is equal scores; the outlined
 * dots joined by a step line are the Pareto frontier.
 */
export function AgreementPlot({
  points,
  people,
}: {
  points: PairPoint[];
  people: [string, string];
}) {
  const [first, second] = people;
  // Keyboard order: left to right, then bottom to top.
  const ordered = useMemo(
    () => [...points].sort((p, q) => p.a - q.a || p.b - q.b || p.name.localeCompare(q.name)),
    [points],
  );
  const frontier = useMemo(() => paretoFrontier(points), [points]);
  const onFrontier = useMemo(() => new Set(frontier.map((p) => p.id)), [frontier]);
  const offsets = useMemo(() => spread(points), [points]);
  const nav = usePointNav(ordered.length);
  const anyWithoutCategory = points.some((p) => !p.category);

  const position = (p: PairPoint) => {
    const o = offsets.get(p.id) ?? { dx: 0, dy: 0 };
    return { x: pct(p.a) + o.dx, y: 100 - pct(p.b) + o.dy };
  };
  const describe = (p: PairPoint) =>
    `${p.name}: ${first} ${formatScore(p.a)}, ${second} ${formatScore(p.b)}${
      onFrontier.has(p.id) ? ", a best mutual pick" : ""
    }`;
  const active = nav.active === null ? null : ordered[nav.active];
  const activePos = active && position(active);

  return (
    <div className={styles.agreement}>
      <Legend
        label="Dot colours and marks"
        items={[
          ...categoryLegendItems(anyWithoutCategory),
          { label: "Best mutual picks", color: "var(--chart-mark-ink)", kind: "ring" },
          { label: "Same score", color: "var(--muted)", kind: "dash" },
        ]}
      />
      <div className={styles.scatter}>
        <div className={styles.axisRow}>
          <p className={chartStyles.axisTitle}>{second}’s score ↑</p>
          <p className={styles.side}>↖ {second} rates higher</p>
        </div>
        <div className={styles.scatterBody}>
          <div className={`${chartStyles.plot} ${styles.square}`}>
            <svg
              className={chartStyles.svg}
              role="group"
              aria-label={`Scatter plot of ${points.length} places: ${first}’s score across, ${second}’s score up. Use arrow keys to move between places.`}
            >
              <GridX />
              <GridY />
              <line
                className={styles.diagonal}
                x1="0"
                y1="100%"
                x2="100%"
                y2="0"
                aria-hidden="true"
              />
              <g className={styles.frontierLine} aria-hidden="true">
                {frontier.slice(0, -1).map((p, i) => {
                  const next = frontier[i + 1];
                  const x1 = `${pct(p.a)}%`;
                  const x2 = `${pct(next.a)}%`;
                  const y1 = `${100 - pct(p.b)}%`;
                  const y2 = `${100 - pct(next.b)}%`;
                  return (
                    <g key={p.id}>
                      <line x1={x1} x2={x1} y1={y1} y2={y2} />
                      <line x1={x1} x2={x2} y1={y2} y2={y2} />
                    </g>
                  );
                })}
              </g>
              {ordered.map((p, i) => {
                const { x, y } = position(p);
                return (
                  <DotMark
                    key={p.id}
                    x={`${x}%`}
                    y={`${y}%`}
                    color={categoryColor(p.category)}
                    label={describe(p)}
                    active={nav.active === i}
                    faded={!onFrontier.has(p.id)}
                    halo={onFrontier.has(p.id)}
                    nav={nav.props(i)}
                  />
                );
              })}
            </svg>
            <TicksY />
            {active && activePos && (
              <Tooltip
                x={activePos.x}
                y={activePos.y}
                title={active.name}
                detail={[
                  active.category ? categoryLabels[active.category] : "No category",
                  active.region ? regionLabels[active.region] : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                rows={[
                  { label: first, value: formatScore(active.a) },
                  { label: second, value: formatScore(active.b) },
                ]}
              />
            )}
          </div>
          <TicksX />
          <div className={styles.axisRow}>
            <p className={styles.side}>{first} rates higher ↘</p>
            <p className={chartStyles.axisTitle}>{first}’s score →</p>
          </div>
        </div>
      </div>
      <p className={chartStyles.caption}>
        <strong>Best mutual picks</strong> (outlined, joined by the step line):{" "}
        {namesText(frontier.map((p) => p.name))}. No other place scores higher for both of
        you. Dots above the dashed line are places {second} ranks higher; below it,{" "}
        {first}.
      </p>
      {/* sr-only on the table itself does not clip table layout. */}
      <div className="sr-only">
      <table>
        <caption>Places you have both ranked</caption>
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col">Category</th>
            <th scope="col">{first}</th>
            <th scope="col">{second}</th>
            <th scope="col">Best mutual pick</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.name}</th>
              <td>{p.category ? categoryLabels[p.category] : "None"}</td>
              <td>{formatScore(p.a)}</td>
              <td>{formatScore(p.b)}</td>
              <td>{onFrontier.has(p.id) ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
