"use client";
import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { categories, Category, categoryLabels } from "@/lib/regions";
import styles from "./charts.module.css";

export { styles as chartStyles };

/* ---------- Scale ---------- */

/** All plots share the 0–10 ranking-score scale. */
export const SCORE_MAX = 10;
export const scoreTicks = [0, 2, 4, 6, 8, 10];
/** A 0–10 score as a percentage along an axis. */
export const pct = (score: number) => (score / SCORE_MAX) * 100;
export const formatScore = (n: number) => n.toFixed(1);

/* ---------- Colour ---------- */

/** The category's palette colour, or the neutral for no category. */
export const categoryColor = (c?: Category) => `var(--cat-${c ?? "none"})`;
/** Inline style carrying a mark colour to the shared CSS (as --swatch). */
export const swatch = (color: string) => ({ "--swatch": color }) as CSSProperties;

/* ---------- Frame ---------- */

export function ChartFrame({
  title,
  label,
  subtitle,
  children,
  className,
}: {
  title: ReactNode;
  /** Accessible name of the card. */
  label: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={className ? `${styles.frame} ${className}` : styles.frame}
      aria-label={label}
    >
      <h3>{title}</h3>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {children}
    </article>
  );
}

/* ---------- Legend ---------- */

export type LegendItem = {
  label: string;
  color: string;
  kind?: "dot" | "line" | "dash" | "ring";
};

const legendClass = {
  dot: styles.swatch,
  line: styles.swatchLine,
  dash: styles.swatchDash,
  ring: styles.swatchRing,
};

export function Legend({ items, label = "Legend" }: { items: LegendItem[]; label?: string }) {
  return (
    <ul className={styles.legend} aria-label={label}>
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={legendClass[item.kind ?? "dot"]}
            style={swatch(item.color)}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export const categoryLegendItems = (withNone: boolean): LegendItem[] => [
  ...categories.map((c) => ({ label: categoryLabels[c], color: categoryColor(c) })),
  ...(withNone ? [{ label: "No category", color: categoryColor() }] : []),
];

/* ---------- Row label + bar ---------- */

export function RowLabel({
  name,
  value,
  count,
  color,
}: {
  name: string;
  value: number;
  count: number;
  /** Optional identity dot beside the name. */
  color?: string;
}) {
  return (
    <span className={styles.rowLabel}>
      <span className={styles.rowName}>
        {color && <span className={styles.swatch} style={swatch(color)} aria-hidden="true" />}
        {name}
      </span>
      <span className={styles.rowValue}>
        <strong>{formatScore(value)}</strong>
        <span className={styles.count}>
          {" "}
          · n = {count}
          <span className="sr-only"> ranked {count === 1 ? "place" : "places"}</span>
        </span>
      </span>
    </span>
  );
}

/** A 0–10 bar from the left baseline, square there and rounded at the data end. */
export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <span className={styles.track} aria-hidden="true">
      <span
        className={styles.bar}
        style={{ ...(color ? swatch(color) : {}), width: `${pct(value)}%` }}
      />
    </span>
  );
}

/* ---------- Axes ---------- */

/** Vertical hairline gridlines at the score ticks, for an absolutely sized plot. */
export function GridX({ baseline = true }: { baseline?: boolean }) {
  return (
    <g className={styles.grid} aria-hidden="true">
      {scoreTicks.map((t) => (
        <line
          key={t}
          className={t === 0 && baseline ? styles.axisLine : undefined}
          x1={`${pct(t)}%`}
          x2={`${pct(t)}%`}
          y1="0"
          y2="100%"
        />
      ))}
    </g>
  );
}

/** Horizontal hairline gridlines at the score ticks (0 at the bottom). */
export function GridY() {
  return (
    <g className={styles.grid} aria-hidden="true">
      {scoreTicks.map((t) => (
        <line
          key={t}
          className={t === 0 ? styles.axisLine : undefined}
          x1="0"
          x2="100%"
          y1={`${100 - pct(t)}%`}
          y2={`${100 - pct(t)}%`}
        />
      ))}
    </g>
  );
}

export function TicksX() {
  return (
    <div className={styles.ticksX} aria-hidden="true">
      {scoreTicks.map((t) => (
        <span key={t} style={{ left: `${pct(t)}%` }}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function TicksY() {
  return (
    <div className={styles.ticksY} aria-hidden="true">
      {scoreTicks.map((t) => (
        <span key={t} style={{ top: `${100 - pct(t)}%` }}>
          {t}
        </span>
      ))}
    </div>
  );
}

/* ---------- Dot mark ---------- */

export type DotProps = ReturnType<ReturnType<typeof usePointNav>["props"]>;

/**
 * One data point: a coloured dot with a 2px surface ring, a 24px transparent
 * hit area, an optional emphasis halo, and a focus ring. Coordinates are
 * percentages of the plot (y from the top) or pixels.
 */
export function DotMark({
  x,
  y,
  color,
  label,
  r = 5,
  active,
  faded,
  halo,
  nav,
}: {
  x: string;
  y: string;
  color: string;
  label: string;
  r?: number;
  active: boolean;
  faded?: boolean;
  halo?: boolean;
  nav: DotProps;
}) {
  const className = [styles.dot, active && styles.active, faded && !active && styles.faded]
    .filter(Boolean)
    .join(" ");
  return (
    <g className={className} style={swatch(color)} role="img" aria-label={label} {...nav}>
      <circle className={styles.hit} cx={x} cy={y} r={12} />
      {halo && <circle className={styles.halo} cx={x} cy={y} r={r + 3.5} />}
      <circle className={styles.mark} cx={x} cy={y} r={active ? r + 1.5 : r} />
      <circle className={styles.focus} cx={x} cy={y} r={r + 6} />
    </g>
  );
}

/**
 * Roving focus and hover state for a set of points: one tab stop, arrow keys
 * (and Home/End) move between points, Escape hides the tooltip. Hover with a
 * mouse, tap, or focus shows a point.
 */
export function usePointNav(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const [stop, setStop] = useState(0);
  const refs = useRef<(SVGGElement | null)[]>([]);
  const move = useCallback((i: number) => {
    setStop(i);
    refs.current[i]?.focus();
  }, []);
  const props = (i: number) => ({
    ref: (el: SVGGElement | null) => {
      refs.current[i] = el;
    },
    tabIndex: i === Math.min(stop, count - 1) ? 0 : -1,
    onFocus: () => {
      setStop(i);
      setActive(i);
    },
    onBlur: () => setActive((a) => (a === i ? null : a)),
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse") setActive(i);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === "mouse") setActive((a) => (a === i ? null : a));
    },
    onClick: () => setActive(i),
    onKeyDown: (e: KeyboardEvent) => {
      const next =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? Math.min(i + 1, count - 1)
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? Math.max(i - 1, 0)
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? count - 1
                : null;
      if (e.key === "Escape") {
        setActive(null);
        return;
      }
      if (next === null) return;
      e.preventDefault();
      move(next);
    },
  });
  return { active, props };
}

/* ---------- Tooltip ---------- */

export type TooltipRow = { label: string; value: string; color?: string };

/**
 * A tooltip anchored at a point given in percentages of its positioned
 * parent. It flips below the point near the top and hugs the side near an
 * edge so it never leaves the chart. Values lead; labels follow.
 */
export function Tooltip({
  x,
  y,
  title,
  detail,
  rows,
}: {
  x: number;
  y: number;
  title: string;
  /** A secondary line under the title, such as the category. */
  detail?: string;
  rows: TooltipRow[];
}) {
  const tx = x < 30 ? "-14px" : x > 70 ? "calc(-100% + 14px)" : "-50%";
  // The point's own aria-label carries the same text for screen readers.
  const below = y < 35;
  const ty = below ? "14px" : "calc(-100% - 14px)";
  return (
    <div
      className={styles.tooltip}
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${tx}, ${ty})` }}
      aria-hidden="true"
      data-tooltip=""
    >
      <span className={styles.tooltipTitle}>{title}</span>
      {detail && <span className={styles.tooltipDetail}>{detail}</span>}
      {rows.map((row) => (
        <span key={row.label} className={styles.tooltipRow}>
          {row.color && (
            <span className={styles.tooltipKey} style={swatch(row.color)} aria-hidden="true" />
          )}
          <strong>{row.value}</strong> {row.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          title={o.label}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
