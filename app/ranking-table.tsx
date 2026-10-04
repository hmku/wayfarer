"use client";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GripVertical } from "lucide-react";
import { Place } from "@/lib/model";
import { combinedScore } from "@/lib/ranking";
import { formatScore } from "./table-format";
import {
  categoryLabel,
  CategoryIcon,
  displayLocation,
  regionLabel,
} from "./place-kind";

type Move = { targetId: string; anchorId: string; side: "before" | "after" };
type Drag = {
  targetId: string;
  pointerId: number;
  x: number;
  y: number;
  move: Move | null;
};

export function RankingTable({
  places,
  people,
  ranks,
  scores,
  reorder,
  busy,
  onOpen,
  onMove,
}: {
  places: Place[];
  people: [string, string];
  ranks: Map<string, number>;
  scores: [Map<string, number>, Map<string, number>];
  reorder: boolean;
  busy: boolean;
  onOpen: (p: Place) => void;
  onMove: (move: Move) => Promise<void>;
}) {
  const table = useRef<HTMLTableElement>(null);
  const active = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Handle (by place id) that should keep focus after a keyboard move. */
  const keyboardFocus = useRef<string | null>(null);
  function cancel() {
    active.current = null;
    setDrag(null);
  }
  /**
   * Shared by drag and keyboard moves: dropping next to a tie group targets
   * the group's edge, so the moved row lands outside the whole group.
   */
  function snap(targetId: string, anchorId: string, side: Move["side"]): Move {
    const tied = ranks.has(anchorId)
      ? places.filter(
          (p) => p.id !== targetId && ranks.get(p.id) === ranks.get(anchorId),
        )
      : [];
    if (tied.length) anchorId = (side === "before" ? tied[0] : tied.at(-1)!).id;
    return { targetId, anchorId, side };
  }
  // Rows are re-ordered by moving DOM nodes, which blurs a moved, focused
  // handle. Put focus back on the same place's handle after each re-render.
  useLayoutEffect(() => {
    const id = keyboardFocus.current;
    if (!id || !reorder) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body) {
      if (!table.current?.contains(focused)) keyboardFocus.current = null;
      return;
    }
    const handle = [
      ...(table.current?.querySelectorAll<HTMLElement>(
        "tr[data-place-id] .drag-handle",
      ) ?? []),
    ].find((el) => el.closest<HTMLElement>("tr")?.dataset.placeId === id);
    handle?.focus();
  }, [places, busy, reorder]);
  useEffect(() => {
    // A pointer interaction anywhere ends keyboard focus tracking.
    const clear = () => {
      keyboardFocus.current = null;
    };
    document.addEventListener("pointerdown", clear, true);
    return () => document.removeEventListener("pointerdown", clear, true);
  }, []);
  function moveAt(current: Drag): Move | null {
    const rect = table.current!.getBoundingClientRect();
    const x = Math.max(rect.left + 5, Math.min(current.x, rect.right - 5));
    const row = document
      .elementsFromPoint(x, current.y)
      .map((el) => el.closest<HTMLTableRowElement>("tr[data-place-id]"))
      .find((el) => el && table.current!.contains(el));
    if (!row || row.dataset.placeId === current.targetId) return null;
    const r = row.getBoundingClientRect();
    const side = current.y < r.top + r.height / 2 ? "before" : "after";
    return snap(current.targetId, row.dataset.placeId!, side);
  }
  // Read the latest places/ranks from the auto-scroll loop without restarting it.
  const moveAtLatest = useEffectEvent((current: Drag) => moveAt(current));
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    function scroll() {
      const current = active.current;
      if (!current) return;
      const delta =
        current.y < 65 ? -14 : current.y > window.innerHeight - 65 ? 14 : 0;
      const before = window.scrollY;
      if (delta) window.scrollBy(0, delta);
      if (window.scrollY !== before) {
        const next = { ...current, move: moveAtLatest(current) };
        active.current = next;
        setDrag(next);
      }
      frame = requestAnimationFrame(scroll);
    }
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);
  function pointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const current = active.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const position = { ...current, x: e.clientX, y: e.clientY };
    const next = { ...position, move: moveAt(position) };
    active.current = next;
    setDrag(next);
  }
  return (
    <>
      {reorder && (
        <span id="reorder-help" className="sr-only">
          Drag to reorder, or use the Up and Down arrow keys.
        </span>
      )}
      <table
        ref={table}
        className={`places-table${reorder ? " reorder-table" : ""}`}
      >
        <thead>
          <tr>
            <th scope="col" className="rank-col">
              #
            </th>
            <th scope="col">Destination</th>
            <th scope="col" className="location-col">
              Country / region
            </th>
            <th scope="col" className="rating-col" title={people[0]}>
              {people[0]}
            </th>
            <th scope="col" className="rating-col" title={people[1]}>
              {people[1]}
            </th>
            <th scope="col" className="rating-col">
              Together
            </th>
          </tr>
        </thead>
        <tbody>
          {places.map((p, i) => {
            const score = combinedScore(
              scores[0].get(p.id),
              scores[1].get(p.id),
            );
            const drop = drag?.move?.anchorId === p.id ? drag.move.side : "";
            const where = displayLocation(p);
            const region = regionLabel(p);
            // Show the region under the country unless it says the same.
            const subRegion =
              region && region.toLowerCase() !== where.toLowerCase()
                ? region
                : "";
            const kind = categoryLabel(p);
            return (
              <tr
                key={p.id}
                data-place-id={p.id}
                className={`${drag?.targetId === p.id ? "dragging-row" : ""} ${drop ? `drop-${drop}` : ""}`}
                onClick={() => {
                  if (!active.current) onOpen(p);
                }}
              >
                <td className="rank-col">
                  {reorder ? (
                    <button
                      className="drag-handle"
                      aria-label={`Move ${p.name}`}
                      aria-describedby="reorder-help"
                      // aria-disabled (not disabled) keeps keyboard focus here
                      // while a move saves.
                      aria-disabled={busy || undefined}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        // Focus moved somewhere on purpose; stop restoring it.
                        if (e.relatedTarget) keyboardFocus.current = null;
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") {
                          cancel();
                          return;
                        }
                        if (e.key !== "ArrowUp" && e.key !== "ArrowDown")
                          return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (busy || active.current) return;
                        const up = e.key === "ArrowUp";
                        const peer = places[i + (up ? -1 : 1)];
                        if (!peer) return;
                        keyboardFocus.current = p.id;
                        await onMove(
                          snap(p.id, peer.id, up ? "before" : "after"),
                        );
                      }}
                      onPointerDown={(e) => {
                        if (busy || !e.isPrimary || e.button !== 0) return;
                        e.stopPropagation();
                        e.currentTarget.focus();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const next = {
                          targetId: p.id,
                          pointerId: e.pointerId,
                          x: e.clientX,
                          y: e.clientY,
                          move: null,
                        };
                        active.current = next;
                        setDrag(next);
                      }}
                      onPointerMove={pointerMove}
                      onPointerUp={async (e) => {
                        const current = active.current;
                        if (!current || current.pointerId !== e.pointerId)
                          return;
                        e.stopPropagation();
                        cancel();
                        if (e.currentTarget.hasPointerCapture(e.pointerId))
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        if (current.move) await onMove(current.move);
                      }}
                      onPointerCancel={cancel}
                      onLostPointerCapture={cancel}
                    >
                      <GripVertical size={12} />
                      <span>{ranks.get(p.id) ?? "—"}</span>
                    </button>
                  ) : (
                    (ranks.get(p.id) ?? "—")
                  )}
                </td>
                <td>
                  <button
                    className="place-link"
                    aria-label={[p.name, where, kind].filter(Boolean).join(", ")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p);
                    }}
                  >
                    <strong>{p.name}</strong>
                    {p.category && (
                      <span className="category-icon" title={kind}>
                        <CategoryIcon category={p.category} size={13} />
                      </span>
                    )}
                    <span className="mobile-location">
                      {[where, subRegion].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </td>
                <td className="location-col">
                  {where || "—"}
                  {subRegion && (
                    <span className="location-region">{subRegion}</span>
                  )}
                </td>
                <td className="rating-col">
                  {formatScore(scores[0].get(p.id))}
                </td>
                <td className="rating-col">
                  {formatScore(scores[1].get(p.id))}
                </td>
                <td className="rating-col">
                  <span className={score === null ? "unrated" : "table-score"}>
                    {formatScore(score)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {drag && (
        <div
          className="drag-ghost"
          aria-hidden="true"
          style={{
            left: Math.max(8, Math.min(drag.x + 12, window.innerWidth - 188)),
            top: drag.y + 12,
          }}
        >
          {places.find((p) => p.id === drag.targetId)?.name}
        </div>
      )}
    </>
  );
}
