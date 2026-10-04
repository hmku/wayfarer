"use client";
import { useEffect, useRef, useState } from "react";
import { X, Upload, Check, Trash2 } from "lucide-react";
import { Journal, Place } from "@/lib/model";
import { convertRows, initialMapping, Mapping, readCsv } from "@/lib/csv";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PlaceForm({
  place,
  people,
  defaultStatus,
  busy,
  onSave,
  onDelete,
  onRefresh,
  onClose,
}: {
  place?: Place;
  people: [string, string];
  defaultStatus: "been" | "want";
  busy: boolean;
  onRefresh: () => Promise<void>;
  onSave: (p: Place) => Promise<void>;
  onDelete?: (p: Place) => Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(place?.status || defaultStatus);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await onSave({
        id: place?.id || crypto.randomUUID(),
        name: String(f.get("name")).trim(),
        country: String(f.get("country")).trim(),
        status,
        date: String(f.get("date") || ""),
        notes: String(f.get("notes") || ""),
        ratings: [
          f.get("first") === "" ? null : Number(f.get("first")),
          f.get("second") === "" ? null : Number(f.get("second")),
        ],
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={place ? "Destination details" : "Add a destination"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={status === "been"}
            className={status === "been" ? "selected" : ""}
            onClick={() => setStatus("been")}
          >
            Been
          </button>
          <button
            type="button"
            aria-pressed={status === "want"}
            className={status === "want" ? "selected" : ""}
            onClick={() => setStatus("want")}
          >
            Want to go
          </button>
        </div>
        <div className="field">
          <label htmlFor="place-name">Destination</label>
          <input
            id="place-name"
            name="name"
            required
            maxLength={120}
            defaultValue={place?.name}
            placeholder="e.g. Kyoto"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="country">Country or region</label>
          <input
            id="country"
            name="country"
            maxLength={120}
            defaultValue={place?.country}
            placeholder="e.g. Japan"
          />
        </div>
        <div className="form-grid">
          {people.map((person, i) => (
            <div className="field" key={i}>
              <label htmlFor={"rating-" + i}>
                {person}&apos;s rating <span className="optional">/ 10</span>
              </label>
              <input
                id={"rating-" + i}
                name={i === 0 ? "first" : "second"}
                type="number"
                min="0"
                max="10"
                step="0.1"
                defaultValue={place?.ratings[i] ?? ""}
                placeholder="Not rated"
              />
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="visit-date">
            Visit date <span className="optional">optional</span>
          </label>
          <input
            id="visit-date"
            name="date"
            type="date"
            defaultValue={place?.date}
          />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            maxLength={5000}
            rows={3}
            defaultValue={place?.notes}
          />
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={onRefresh}
            >
              Refresh journal
            </button>
          </div>
        )}
        <div className="form-footer">
          {place && onDelete ? (
            <button
              className="danger subtle"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                try {
                  await onDelete(place);
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Trash2 size={16} />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          ) : (
            <span />
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              "Saving…"
            ) : (
              <>
                <Check size={17} />
                Save destination
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ImportForm({
  journal,
  busy,
  onImport,
  onRefresh,
  onClose,
}: {
  journal: Journal;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onImport: (places: Place[]) => Promise<void>;
  onClose: () => void;
}) {
  const [parsed, setParsed] = useState<ReturnType<typeof readCsv> | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  async function fileChanged(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a CSV smaller than 2 MB.");
      const data = readCsv(await file.text());
      setParsed(data);
      setMapping(initialMapping(data.headers));
      setFilename(file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const preview = parsed && mapping ? convertRows(parsed.rows, mapping) : null;
  const unique = new Map<string, Place>();
  const existing = new Set(
    journal.places.map(
      (p) => `${p.name.toLowerCase()}|${p.country.toLowerCase()}`,
    ),
  );
  preview?.places.forEach((p) => {
    const key = `${p.name.toLowerCase()}|${p.country.toLowerCase()}`;
    if (!existing.has(key)) unique.set(key, p);
  });
  const additions = [...unique.values()];
  const skipped = (preview?.places.length || 0) - additions.length;
  function select(key: Exclude<keyof Mapping, "defaultStatus">, label: string) {
    return (
      <div className="field">
        <label htmlFor={"column-" + key}>{label}</label>
        <select
          id={"column-" + key}
          value={mapping![key]}
          onChange={(e) => setMapping({ ...mapping!, [key]: e.target.value })}
        >
          <option value="-1">
            {key === "name" ? "Choose a column" : "None"}
          </option>
          {parsed?.headers.map((h, i) => (
            <option value={i} key={i}>
              {h} (column {i + 1})
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <Modal title="Import CSV" onClose={onClose}>
      <p className="muted">
        Export the Travel tab as CSV. Choose the columns below and check the
        preview before importing.
      </p>
      <label className="file-drop">
        <Upload size={24} />
        <strong>{filename || "Choose a CSV file"}</strong>
        <input type="file" accept=".csv,text/csv" onChange={fileChanged} />
      </label>
      {parsed && mapping && (
        <>
          <div className="form-grid">
            {select("name", "Destination column")}
            {select("country", "Country column")}
            {select("first", `${journal.people[0]}’s rating`)}
            {select("second", `${journal.people[1]}’s rating`)}
            {select("status", "List / status column")}
            {
              <div className="field">
                <label htmlFor="import-list">Default list</label>
                <select
                  id="import-list"
                  value={mapping.defaultStatus}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      defaultStatus: e.target.value as "been" | "want",
                    })
                  }
                >
                  <option value="been">Been</option>
                  <option value="want">Want to go</option>
                </select>
              </div>
            }
            {select("date", "Visit date column")}
            {select("notes", "Notes column")}
          </div>
          <p className="muted small">
            For two lists side by side, import once using the “been” columns,
            then again using the “want to go” columns. Existing destinations are
            skipped.
          </p>
          <div className="import-preview">
            <strong>
              {additions.length} destinations to add
              {skipped ? ` · ${skipped} duplicates skipped` : ""}
            </strong>
            {additions.slice(0, 6).map((p) => (
              <div key={p.id}>
                <span>
                  {p.name}
                  {p.country ? `, ${p.country}` : ""}
                </span>
                <span>
                  {p.status === "been" ? "Been" : "Want to go"} ·{" "}
                  {p.ratings.map((r) => r ?? "—").join(" / ")}
                </span>
              </div>
            ))}
          </div>
          {preview?.errors.length ? (
            <p className="error" role="alert">
              {preview.errors.slice(0, 3).join(" ")}
              {preview.errors.length > 3
                ? ` (+${preview.errors.length - 3} more)`
                : ""}
            </p>
          ) : null}
          <button
            className="primary full"
            disabled={busy || !additions.length || !!preview?.errors.length}
            onClick={async () => {
              try {
                await onImport(additions);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {busy ? "Importing…" : `Import ${additions.length} destinations`}
          </button>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            type="button"
            className="subtle"
            disabled={busy}
            onClick={onRefresh}
          >
            Refresh journal
          </button>
        </div>
      )}
    </Modal>
  );
}
