"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Journal, location, Place } from "@/lib/model";
import {
  combinedScore,
  Groups,
  insertIntoGroups,
  Person,
  personalGroups,
  removeFromGroups,
  scoreMap,
} from "@/lib/ranking";
import { ErrorNotice, Modal } from "./components";
import { formatScore, statusLabel, todayIso } from "./table-format";

export function PlaceDetails({
  journal,
  place,
  busy,
  onClose,
  onEdit,
  onCompare,
  onMove,
  onDelete,
}: {
  journal: Journal;
  place: Place;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCompare: (person: Person) => void;
  /** `date` is passed only when moving Want to go → Been ("" if cleared). */
  onMove: (date?: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveStep, setMoveStep] = useState(false);
  const [moveDate, setMoveDate] = useState(todayIso);
  const moveButton = useRef<HTMLButtonElement>(null);
  const moveDateInput = useRef<HTMLInputElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const scores = ([0, 1] as const).map((i) =>
    scoreMap(journal, i, place.status).get(place.id),
  );
  const notes = place.notes.replace(/^Region:\s*.+(?:\r?\n|$)/m, "").trim();
  useEffect(() => {
    if (moveStep) moveDateInput.current?.focus();
  }, [moveStep]);
  async function move(date?: string) {
    setError("");
    try {
      await onMove(date);
      setMoveStep(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function cancelMove() {
    setMoveStep(false);
    // The button re-renders in place; wait for it to mount before focusing.
    requestAnimationFrame(() => moveButton.current?.focus());
  }
  return (
    <Modal title={place.name} onClose={onClose} busy={busy} placeId={place.id}>
      <div className="detail-meta">
        <span className="category-badge">{statusLabel(place.status)}</span>
        <span>{location(place)}</span>
      </div>
      <div className="detail-ratings">
        {journal.people.map((name, i) => {
          const verb = scores[i] === undefined ? "Rank" : "Adjust";
          return (
            <div key={i}>
              <span>{name}</span>
              <strong>{formatScore(scores[i])}</strong>
              <button
                className="subtle"
                disabled={busy}
                onClick={() => onCompare(i as Person)}
                aria-label={`${verb} ${name}'s rating`}
              >
                {verb}
              </button>
            </div>
          );
        })}
        <div>
          <span>Together</span>
          <strong>{formatScore(combinedScore(scores[0], scores[1]))}</strong>
        </div>
      </div>
      {place.date && (
        <p className="detail-date">
          Visited{" "}
          {new Date(place.date + "T12:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      )}
      {notes && <p className="detail-notes">{notes}</p>}
      {(place.ratings[0] !== null || place.ratings[1] !== null) && (
        <details className="original-ratings">
          <summary>Original ratings</summary>
          <p>
            {journal.people
              .map((name, i) => `${name}: ${place.ratings[i] ?? "—"}`)
              .join(" · ")}
          </p>
        </details>
      )}
      <ErrorNotice as="p" message={error} />
      {moveStep ? (
        <form
          className="dialog-move-step"
          aria-labelledby="move-step-title"
          onSubmit={(e) => {
            e.preventDefault();
            move(moveDate);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) {
              // Escape backs out of this step instead of closing the dialog.
              e.preventDefault();
              cancelMove();
            }
          }}
        >
          <p id="move-step-title" className="dialog-move-title">
            Move to {statusLabel("been")}
          </p>
          <div className="field">
            <label htmlFor="move-date">
              Visit date <span className="optional">optional</span>
            </label>
            <input
              ref={moveDateInput}
              id="move-date"
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
            />
          </div>
          <p className="muted small">
            Personal rankings for this place reset when it moves, so rank it
            again afterwards.
          </p>
          <div className="detail-actions">
            <button className="primary" disabled={busy}>
              {busy ? "Moving…" : "Confirm move"}
            </button>
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={cancelMove}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="detail-actions">
          <button className="primary" disabled={busy} onClick={onEdit}>
            Edit details
          </button>
          <button
            ref={moveButton}
            className="subtle"
            disabled={busy}
            onClick={() => {
              setError("");
              if (place.status === "want") setMoveStep(true);
              else move();
            }}
          >
            {place.status === "want"
              ? `Move to ${statusLabel("been")}`
              : `Move to ${statusLabel("want")}`}
          </button>
        </div>
      )}
      <div className="dialog-delete-row">
        {confirmDelete && (
          <p className="dialog-delete-prompt" id="delete-prompt">
            Delete {place.name} from both lists? You can undo right after.
          </p>
        )}
        <div className="detail-actions">
          <button
            ref={deleteButton}
            className="subtle danger"
            disabled={busy}
            aria-describedby={confirmDelete ? "delete-prompt" : undefined}
            onClick={async () => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setError("");
              try {
                await onDelete();
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {confirmDelete ? "Confirm delete" : "Delete"}
          </button>
          {confirmDelete && (
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                deleteButton.current?.focus();
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ComparisonDialog({
  journal,
  place,
  person,
  busy,
  onClose,
  onSave,
  onRestart,
}: {
  journal: Journal;
  place: Place;
  person: Person;
  busy: boolean;
  onClose: () => void;
  onSave: (groups: Groups) => Promise<void>;
  onRestart: () => Promise<void>;
}) {
  const [groups] = useState(() =>
    removeFromGroups(personalGroups(journal, person, place.status), place.id),
  );
  const [bounds, setBounds] = useState({ low: 0, high: groups.length });
  const [history, setHistory] = useState<(typeof bounds)[]>([]);
  const [tie, setTie] = useState<number | null>(null);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const mid = Math.floor((bounds.low + bounds.high) / 2);
  const done = tie !== null || bounds.low === bounds.high;
  const peer = !done
    ? journal.places.find((p) => p.id === groups[mid][0])!
    : null;
  const result = done
    ? insertIntoGroups(groups, place.id, tie ?? bounds.low, tie !== null)
    : null;
  const rank = result
    ? 1 + result.slice(0, tie ?? bounds.low).flat().length
    : null;
  function choose(winner: "target" | "peer" | "tie") {
    setHistory([...history, bounds]);
    if (winner === "tie") setTie(mid);
    else
      setBounds(
        winner === "target"
          ? { ...bounds, high: mid }
          : { ...bounds, low: mid + 1 },
      );
  }
  function back() {
    if (!history.length) return;
    setBounds(history.at(-1)!);
    setHistory(history.slice(0, -1));
    setTie(null);
    setError("");
  }
  useEffect(() => {
    if (!done && !document.activeElement?.closest("dialog"))
      firstChoice.current?.focus();
  }, [done]);
  // Save as soon as the position is decided; there is no separate save step.
  const saveResult = useEffectEvent(async () => {
    if (!result || saving.current) return;
    saving.current = true;
    try {
      await onSave(result);
      onClose();
    } catch (e) {
      saving.current = false;
      setError((e as Error).message);
    }
  });
  useEffect(() => {
    if (done && !error) saveResult();
  }, [done, error]);
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat || busy) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable=true]"))
      return;
    if (e.key === "Backspace") {
      if (history.length) {
        e.preventDefault();
        back();
      }
      return;
    }
    if (done) return;
    const pick =
      e.key === "ArrowLeft"
        ? "target"
        : e.key === "ArrowRight"
          ? "peer"
          : e.key === "t" || e.key === "T" || e.key === "="
            ? "tie"
            : null;
    if (!pick) return;
    e.preventDefault();
    choose(pick);
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  return (
    <Modal
      title={done ? "Saving ranking" : "Compare destinations"}
      onClose={onClose}
      busy={busy}
      placeId={place.id}
    >
      <p className="comparison-person">
        {journal.people[person]} · {statusLabel(place.status)}
      </p>
      {!done && peer ? (
        <>
          <h3
            className="comparison-question"
            aria-live="polite"
            aria-atomic="true"
          >
            {place.status === "been"
              ? "Which did you prefer?"
              : "Where would you rather go?"}
            <span className="sr-only">
              {` Comparison ${history.length + 1}: ${place.name} or ${peer.name}.`}
            </span>
          </h3>
          <div className="comparison-pair">
            <button
              ref={firstChoice}
              onClick={() => choose("target")}
              className="comparison-choice"
              aria-keyshortcuts="ArrowLeft"
            >
              <strong>{place.name}</strong>
              <span>{location(place)}</span>
            </button>
            <span className="comparison-vs">or</span>
            <button
              onClick={() => choose("peer")}
              className="comparison-choice"
              aria-keyshortcuts="ArrowRight"
            >
              <strong>{peer.name}</strong>
              <span>{location(peer)}</span>
            </button>
          </div>
          <button
            className="subtle full"
            onClick={() => choose("tie")}
            aria-keyshortcuts="T ="
          >
            Too close to call
          </button>
          <p className="dialog-shortcuts">
            Keys: <kbd>←</kbd> left · <kbd>→</kbd> right · <kbd>T</kbd> or{" "}
            <kbd>=</kbd> tie · <kbd>Backspace</kbd> back
          </p>
        </>
      ) : (
        <div className="comparison-result" role="status">
          <span>{tie !== null ? "Tied at" : "Rank"}</span>
          <strong>#{rank}</strong>
          <p>{place.name}</p>
        </div>
      )}
      <ErrorNotice
        message={error}
        action="Refresh and restart comparisons"
        fullAction
        busy={busy}
        onAction={async () => {
          try {
            await onRestart();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <div className="comparison-footer">
        <button
          className="subtle"
          disabled={busy || !history.length}
          onClick={back}
          aria-keyshortcuts="Backspace"
        >
          Back
        </button>
      </div>
    </Modal>
  );
}
