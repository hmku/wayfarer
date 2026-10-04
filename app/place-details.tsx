"use client";
import { useState } from "react";
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
import { Modal } from "./components";

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
  onMove: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scores = ([0, 1] as const).map((i) =>
    scoreMap(journal, i, place.status).get(place.id),
  );
  const notes = place.notes.replace(/^Region:\s*.+(?:\r?\n|$)/m, "").trim();
  return (
    <Modal title={place.name} onClose={onClose}>
      <div className="detail-meta">
        <span className="category-badge">
          {place.status === "been" ? "Been" : "Want to go"}
        </span>
        <span>{location(place)}</span>
      </div>
      <div className="detail-ratings">
        {journal.people.map((name, i) => (
          <div key={i}>
            <span>{name}</span>
            <strong>{scores[i]?.toFixed(1) ?? "—"}</strong>
            <button
              className="subtle"
              disabled={busy}
              onClick={() => onCompare(i as Person)}
              aria-label={`Adjust ${name}'s rating`}
            >
              {scores[i] === undefined ? "Rank" : "Adjust"}
            </button>
          </div>
        ))}
        <div>
          <span>Together</span>
          <strong>
            {combinedScore(scores[0], scores[1])?.toFixed(1) ?? "—"}
          </strong>
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="detail-actions">
        <button className="primary" disabled={busy} onClick={onEdit}>
          Edit details
        </button>
        <button
          className="subtle"
          disabled={busy}
          onClick={async () => {
            try {
              await onMove();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {place.status === "want" ? "Move to Been" : "Move to Want to go"}
        </button>
      </div>
      <button
        className="subtle danger"
        disabled={busy}
        onClick={async () => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
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
  return (
    <Modal
      title={done ? "Ranking resolved" : "Compare destinations"}
      onClose={onClose}
    >
      <p className="comparison-person">
        {journal.people[person]} ·{" "}
        {place.status === "been" ? "Been" : "Want to go"}
      </p>
      {!done && peer ? (
        <>
          <h3 className="comparison-question">
            {place.status === "been"
              ? "Which did you prefer?"
              : "Where would you rather go?"}
          </h3>
          <div className="comparison-pair">
            <button
              onClick={() => choose("target")}
              className="comparison-choice"
            >
              <strong>{place.name}</strong>
              <span>{location(place)}</span>
            </button>
            <span className="comparison-vs">or</span>
            <button
              onClick={() => choose("peer")}
              className="comparison-choice"
            >
              <strong>{peer.name}</strong>
              <span>{location(peer)}</span>
            </button>
          </div>
          <button className="subtle full" onClick={() => choose("tie")}>
            Too close to call
          </button>
        </>
      ) : (
        <div className="comparison-result">
          <span>{tie !== null ? "Tied at" : "Rank"}</span>
          <strong>#{rank}</strong>
          <p>{place.name}</p>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="subtle full"
            disabled={busy}
            onClick={async () => {
              try {
                await onRestart();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Refresh and restart comparisons
          </button>
        </div>
      )}
      <div className="comparison-footer">
        <button
          className="subtle"
          disabled={busy || !history.length}
          onClick={() => {
            setBounds(history.at(-1)!);
            setHistory(history.slice(0, -1));
            setTie(null);
            setError("");
          }}
        >
          Back
        </button>
        {result ? (
          <button
            className="primary"
            disabled={busy || !!error}
            onClick={async () => {
              try {
                await onSave(result);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {busy ? "Saving…" : "Save ranking"}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
