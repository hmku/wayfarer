"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Upload, Check } from "lucide-react";
import { Journal, location, Place } from "@/lib/model";
import {
  convertRows,
  importTotalError,
  initialMapping,
  Mapping,
  readCsv,
} from "@/lib/csv";
import { dialogClosed, dialogOpened, dialogPlace } from "./dialog-focus";
import { statusLabel } from "./table-format";

const DISCARD_MESSAGE = "Discard your unsaved changes?";

export function Modal({
  title,
  onClose,
  children,
  confirmClose,
  busy = false,
  placeId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Return false to keep the dialog open (e.g. the user declines to discard a draft). */
  confirmClose?: () => boolean;
  /** While true, Escape, the backdrop and the close button do nothing. */
  busy?: boolean;
  /** The place this dialog is about; used to return focus to its table row. */
  placeId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const initialPlace = useRef(placeId);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialogOpened(initialPlace.current);
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog.close();
      dialogClosed();
    };
  }, []);
  useEffect(() => dialogPlace(placeId), [placeId]);
  function requestClose() {
    if (busy) return;
    if (confirmClose && !confirmClose()) return;
    onClose();
  }
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-busy={busy || undefined}
      onKeyDown={(e) => {
        // Handle Escape ourselves so the native dialog never closes behind
        // React's back (Chrome skips `cancel` after repeated prevented Escapes).
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          requestClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            requestClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={requestClose}
          aria-disabled={busy || undefined}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

/** An inline error, optionally with one recovery action (e.g. refresh). */
export function ErrorNotice({
  message,
  action,
  onAction,
  busy = false,
  fullAction = false,
  as: Tag = "div",
}: {
  message: string;
  action?: string;
  onAction?: () => void | Promise<void>;
  busy?: boolean;
  fullAction?: boolean;
  as?: "div" | "p";
}) {
  if (!message) return null;
  return (
    <Tag className="error" role="alert">
      {message}
      {action && onAction && (
        <button
          type="button"
          className={fullAction ? "subtle full" : "subtle"}
          disabled={busy}
          onClick={onAction}
        >
          {action}
        </button>
      )}
    </Tag>
  );
}

type Draft = {
  name: string;
  country: string;
  status: Place["status"];
  date: string;
  notes: string;
};

export function PlaceForm({
  place,
  defaultStatus,
  busy,
  onSave,
  onRefresh,
  onClose,
}: {
  place?: Place;
  defaultStatus: "been" | "want";
  busy: boolean;
  onRefresh: () => Promise<boolean>;
  onSave: (p: Place) => Promise<void>;
  onClose: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Place["status"]>(
    place?.status || defaultStatus,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const initial = useRef<Draft>({
    name: place?.name ?? "",
    country: place?.country ?? "",
    status: place?.status || defaultStatus,
    date: place?.date ?? "",
    notes: place?.notes ?? "",
  });
  function draft(): Draft {
    const f = new FormData(form.current!);
    return {
      name: String(f.get("name") ?? ""),
      country: String(f.get("country") ?? ""),
      status,
      date:
        status === "want"
          ? initial.current.date
          : String(f.get("date") ?? ""),
      notes: String(f.get("notes") ?? ""),
    };
  }
  function dirty() {
    if (!form.current) return false;
    const now = draft();
    return (Object.keys(now) as (keyof Draft)[]).some(
      (k) => now[k] !== initial.current[k],
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const d = draft();
    setError("");
    setSaving(true);
    try {
      await onSave({
        id: place?.id || crypto.randomUUID(),
        name: d.name.trim(),
        country: d.country.trim(),
        status: d.status,
        date: d.date,
        notes: d.notes,
        ratings: place?.ratings || [null, null],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={place ? "Edit destination" : "Add a destination"}
      onClose={onClose}
      busy={busy || saving}
      placeId={place?.id}
      confirmClose={() => !dirty() || window.confirm(DISCARD_MESSAGE)}
    >
      <form
        ref={form}
        onSubmit={submit}
        onChange={() => {
          if (error) setError("");
        }}
      >
        {place ? (
          <p className="category-badge">{statusLabel(status)}</p>
        ) : (
          <fieldset className="dialog-list-choice">
            <legend>List</legend>
            {(["been", "want"] as const).map((s) => (
              <label key={s}>
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                {statusLabel(s)}
              </label>
            ))}
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="place-name">Destination</label>
          <input
            id="place-name"
            name="name"
            required
            maxLength={120}
            defaultValue={place?.name}
            placeholder="e.g. Kyoto"
            data-autofocus
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
        {status === "been" && (
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
        )}
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
        <ErrorNotice
          message={error}
          action="Refresh journal"
          busy={busy}
          onAction={async () => {
            if (await onRefresh()) setError("");
          }}
        />
        <div className="form-footer">
          <button className="primary" disabled={busy || saving}>
            {busy || saving ? (
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
  onRefresh: () => Promise<boolean>;
  onImport: (places: Place[]) => Promise<void>;
  onClose: () => void;
}) {
  const [parsed, setParsed] = useState<ReturnType<typeof readCsv> | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [filename, setFilename] = useState("");
  /** Problems with the chosen file; refreshing the journal will not help. */
  const [fileError, setFileError] = useState("");
  /** Save or conflict errors; refreshing the journal can resolve these. */
  const [saveError, setSaveError] = useState("");
  const [importing, setImporting] = useState(false);
  async function fileChanged(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setParsed(null);
    setMapping(null);
    setFilename("");
    setFileError("");
    setSaveError("");
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a CSV smaller than 2 MB.");
      const data = readCsv(await file.text());
      setParsed(data);
      setMapping(initialMapping(data.headers));
      setFilename(file.name);
    } catch (err) {
      e.target.value = "";
      setFileError((err as Error).message);
    }
  }
  // IDs come from convertRows; only regenerate them when the inputs change.
  const preview = useMemo(
    () => (parsed && mapping ? convertRows(parsed.rows, mapping) : null),
    [parsed, mapping],
  );
  const additions = useMemo(() => {
    const key = (p: Place) =>
      `${p.name.toLowerCase()}|${location(p).toLowerCase()}`;
    const existing = new Set(journal.places.map(key));
    const unique = new Map<string, Place>();
    preview?.places.forEach((p) => {
      if (!existing.has(key(p))) unique.set(key(p), p);
    });
    return [...unique.values()];
  }, [preview, journal.places]);
  const skipped = (preview?.places.length || 0) - additions.length;
  const totalError = importTotalError(journal.places.length, additions.length);
  const errors = [...(preview?.errors || []), ...(totalError ? [totalError] : [])];
  function updateMapping(next: Mapping) {
    setMapping(next);
    setSaveError("");
  }
  function select(key: Exclude<keyof Mapping, "defaultStatus">, label: string) {
    return (
      <div className="field">
        <label htmlFor={"column-" + key}>{label}</label>
        <select
          id={"column-" + key}
          value={mapping![key]}
          onChange={(e) => updateMapping({ ...mapping!, [key]: e.target.value })}
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
    <Modal
      title="Import CSV"
      onClose={onClose}
      busy={busy || importing}
      confirmClose={() => !parsed || window.confirm(DISCARD_MESSAGE)}
    >
      <p className="muted">
        Export the Travel tab as CSV. Choose the columns below and check the
        preview before importing.
      </p>
      <label className="file-drop">
        <Upload size={24} />
        <strong>{filename || "Choose a CSV file"}</strong>
        <input type="file" accept=".csv,text/csv" onChange={fileChanged} />
      </label>
      <ErrorNotice message={fileError} />
      {parsed && mapping && (
        <>
          <div className="form-grid">
            {select("name", "Destination column")}
            {select("country", "Country column")}
            {select("first", `Rating — ${journal.people[0]}`)}
            {select("second", `Rating — ${journal.people[1]}`)}
            {select("status", "List / status column")}
            <div className="field">
              <label htmlFor="import-list">Default list</label>
              <select
                id="import-list"
                value={mapping.defaultStatus}
                onChange={(e) =>
                  updateMapping({
                    ...mapping,
                    defaultStatus: e.target.value as "been" | "want",
                  })
                }
              >
                <option value="been">{statusLabel("been")}</option>
                <option value="want">{statusLabel("want")}</option>
              </select>
            </div>
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
                  {statusLabel(p.status)} ·{" "}
                  {p.ratings.map((r) => r ?? "—").join(" / ")}
                </span>
              </div>
            ))}
          </div>
          {errors.length ? (
            <ErrorNotice
              as="p"
              message={
                errors.slice(0, 3).join(" ") +
                (errors.length > 3
                  ? ` (+${errors.length - 3} more)`
                  : "")
              }
            />
          ) : null}
          <button
            className="primary full"
            disabled={
              busy ||
              importing ||
              !additions.length ||
              !!errors.length
            }
            onClick={async () => {
              setSaveError("");
              setImporting(true);
              try {
                await onImport(additions);
                onClose();
              } catch (e) {
                setSaveError((e as Error).message);
              } finally {
                setImporting(false);
              }
            }}
          >
            {busy || importing
              ? "Importing…"
              : `Import ${additions.length} destinations`}
          </button>
        </>
      )}
      <ErrorNotice
        message={saveError}
        action="Refresh journal"
        busy={busy}
        onAction={async () => {
          if (await onRefresh()) setSaveError("");
        }}
      />
    </Modal>
  );
}
