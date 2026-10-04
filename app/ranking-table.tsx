"use client";
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { location, Place } from "@/lib/model";
import { combinedScore } from "@/lib/ranking";

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
  function cancel() {
    active.current = null;
    setDrag(null);
  }
  function moveAt(current: Drag): Move | null {
    const rect = table.current!.getBoundingClientRect();
    const x = Math.max(rect.left + 5, Math.min(current.x, rect.right - 5));
    const row = document
      .elementsFromPoint(x, current.y)
      .map((el) => el.closest<HTMLTableRowElement>("tr[data-place-id]"))
      .find((el) => el && table.current!.contains(el));
    let move: Move | null = null;
    if (row && row.dataset.placeId !== current.targetId) {
      let anchorId = row.dataset.placeId!;
      const r = row.getBoundingClientRect();
      const side = current.y < r.top + r.height / 2 ? "before" : "after";
      const tied = ranks.has(anchorId)
        ? places.filter(
            (p) =>
              p.id !== current.targetId &&
              ranks.get(p.id) === ranks.get(anchorId),
          )
        : [];
      if (tied.length)
        anchorId = (side === "before" ? tied[0] : tied.at(-1)!).id;
      move = {
        targetId: current.targetId,
        anchorId,
        side,
      };
    }
    return move;
  }
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
        const next = { ...current, move: moveAt(current) };
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
                      disabled={busy}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") {
                          cancel();
                          return;
                        }
                        if (e.key !== "ArrowUp" && e.key !== "ArrowDown")
                          return;
                        e.preventDefault();
                        e.stopPropagation();
                        const peer = places[i + (e.key === "ArrowUp" ? -1 : 1)];
                        if (peer && !busy)
                          await onMove({
                            targetId: p.id,
                            anchorId: peer.id,
                            side: e.key === "ArrowUp" ? "before" : "after",
                          });
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
                    aria-label={`${p.name}${location(p) ? `, ${location(p)}` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p);
                    }}
                  >
                    <strong>{p.name}</strong>
                    <span className="mobile-location">{location(p)}</span>
                  </button>
                </td>
                <td className="location-col">{location(p) || "—"}</td>
                <td className="rating-col">
                  {scores[0].get(p.id)?.toFixed(1) ?? "—"}
                </td>
                <td className="rating-col">
                  {scores[1].get(p.id)?.toFixed(1) ?? "—"}
                </td>
                <td className="rating-col">
                  <span className={score === null ? "unrated" : "table-score"}>
                    {score?.toFixed(1) ?? "—"}
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
