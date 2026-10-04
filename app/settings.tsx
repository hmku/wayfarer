"use client";
import { useState } from "react";
import { Download, LockKeyhole, Upload } from "lucide-react";
import { Journal, validateJournal } from "@/lib/model";
import { Modal } from "./components";

function counts(j: Journal) {
  const been = j.places.filter((p) => p.status === "been").length;
  return { total: j.places.length, been, want: j.places.length - been };
}

function describe(j: Journal) {
  const c = counts(j);
  return `${c.total} destination${c.total === 1 ? "" : "s"} (${c.been} been, ${c.want} want to go)`;
}

export function backupFilename(date = new Date()) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `wayfarer-backup-${day}.json`;
}

function downloadBackup(journal: Journal) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(journal, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename();
  a.click();
  URL.revokeObjectURL(url);
}

async function readBackup(file: File): Promise<Journal> {
  if (file.size > 2_000_000) throw new Error("That backup file is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file is not a Wayfarer JSON backup.");
  }
  // Accept a bare journal or an API-style { journal } wrapper.
  const candidate =
    parsed && typeof parsed === "object" && "journal" in parsed
      ? (parsed as { journal: unknown }).journal
      : parsed;
  try {
    return validateJournal(candidate);
  } catch (e) {
    throw new Error(`This backup can't be restored: ${(e as Error).message}`);
  }
}

export function SettingsModal({
  journal,
  busy,
  loaded,
  onSaveNames,
  onRestore,
  onClose,
}: {
  journal: Journal;
  busy: boolean;
  loaded: boolean;
  onSaveNames: (people: [string, string]) => Promise<void>;
  onRestore: (journal: Journal) => Promise<void>;
  onClose: () => void;
}) {
  // Errors stay inside the dialog; page-level errors are not shown here.
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ name: string; journal: Journal }>();
  return (
    <Modal title="Settings" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError("");
          try {
            await onSaveNames([
              String(f.get("first")).trim(),
              String(f.get("second")).trim(),
            ]);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="field">
          <label htmlFor="person-one">First person</label>
          <input
            id="person-one"
            name="first"
            required
            maxLength={40}
            defaultValue={journal.people[0]}
          />
        </div>
        <div className="field">
          <label htmlFor="person-two">Second person</label>
          <input
            id="person-two"
            name="second"
            required
            maxLength={40}
            defaultValue={journal.people[1]}
          />
        </div>
        <button className="primary full" disabled={busy || !loaded}>
          {busy ? "Saving…" : "Save names"}
        </button>
      </form>
      <section className="backup-section" aria-labelledby="backup-heading">
        <h3 id="backup-heading">Backup</h3>
        <p className="muted small">
          A JSON backup holds every destination, note, date, and both
          rankings. Keep it somewhere private.
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="subtle"
            disabled={!loaded}
            onClick={() => downloadBackup(journal)}
          >
            <Download size={16} />
            Download backup
          </button>
          <label className="subtle file-button">
            <Upload size={16} />
            Restore from backup
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              disabled={!loaded || busy}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                input.value = "";
                if (!file) return;
                setError("");
                setPending(undefined);
                try {
                  setPending({ name: file.name, journal: await readBackup(file) });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
        </div>
        {pending && (
          <div className="restore-confirm" role="alertdialog" aria-labelledby="restore-warning">
            <p id="restore-warning">
              <strong>Replace everything?</strong> Restoring{" "}
              <em>{pending.name}</em> replaces the whole journal —{" "}
              {describe(journal)} — with the backup&apos;s{" "}
              {describe(pending.journal)}, including names and rankings.
              Anything not in the backup will be lost.
            </p>
            <div className="backup-actions">
              <button
                type="button"
                className="primary danger-button"
                disabled={busy}
                onClick={async () => {
                  setError("");
                  try {
                    await onRestore(pending.journal);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                {busy ? "Restoring…" : "Replace journal"}
              </button>
              <button
                type="button"
                className="subtle"
                disabled={busy}
                onClick={() => setPending(undefined)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="privacy-box">
        <LockKeyhole size={20} />
        <p>
          Anyone with the shared key can view and edit this journal. Lock it on
          shared devices.
        </p>
      </div>
      <p className="muted small shortcut-hint">
        Keyboard shortcuts: <kbd>/</kbd> search · <kbd>N</kbd> add a
        destination · <kbd>1</kbd> Been · <kbd>2</kbd> Want to go
      </p>
      <p className="muted small">
        On iPhone: open in Safari, tap Share, then Add to Home Screen. On
        Android: use your browser&apos;s Install app or Add to Home screen
        option.
      </p>
    </Modal>
  );
}
