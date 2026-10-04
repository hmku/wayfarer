"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Compass,
  Plus,
  Search,
  LockKeyhole,
  MapPin,
  Bookmark,
  Upload,
  Download,
  Settings,
  RefreshCw,
  LogOut,
  Check,
  Globe2,
} from "lucide-react";
import { average, emptyJournal, mergePlace, Journal, Place } from "@/lib/model";
import { exportCsv } from "@/lib/csv";
import { ImportForm, Modal, PlaceForm } from "./components";
const colors = ["#d4e8e0", "#e1e7ef", "#f3e6cf", "#e5e0ed", "#d9e8ef"];

export default function Home() {
  const [session, setSession] = useState<"loading" | "locked" | "open">(
    "loading",
  );
  const [configured, setConfigured] = useState(true);
  const [journal, setJournal] = useState<Journal>(emptyJournal);
  const [revision, setRevision] = useState("new");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"been" | "want">("been");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("together");
  const [modal, setModal] = useState<
    "add" | "edit" | "import" | "settings" | null
  >(null);
  const [place, setPlace] = useState<Place>();
  const load = useCallback(async () => {
    const r = await fetch("/api/journal", { cache: "no-store" });
    const data = await r.json();
    if (r.status === 401) {
      setSession("locked");
      setJournal(emptyJournal());
      setLoaded(false);
      return;
    }
    if (!r.ok) throw new Error(data.error);
    setJournal(data.journal);
    setRevision(data.revision);
    setLoaded(true);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/session");
        const s = await r.json();
        setConfigured(s.configured);
        setSession(s.authorized ? "open" : "locked");
        if (s.authorized) await load();
      } catch (e) {
        setSession("locked");
        setError((e as Error).message);
      }
    })();
  }, [load]);
  useEffect(() => {
    if (session !== "open") return;
    const refresh = () => {
      if (document.visibilityState === "visible" && !modal && !busy)
        load().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [session, modal, busy, load]);
  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: new FormData(form).get("key") }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      form.reset();
      setSession("open");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(next: Journal, message = "Saved") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/journal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journal: next, revision }),
      });
      const data = await r.json();
      if (r.status === 401) {
        setSession("locked");
        setJournal(emptyJournal());
        setLoaded(false);
      }
      if (!r.ok) throw new Error(data.error);
      setJournal(data.journal);
      setRevision(data.revision);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await load();
      setNotice("Journal refreshed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function lock() {
    setBusy(true);
    try {
      const r = await fetch("/api/session", { method: "DELETE" });
      if (!r.ok)
        throw new Error("Could not lock the journal. Please try again.");
      setSession("locked");
      setJournal(emptyJournal());
      setLoaded(false);
      setModal(null);
      setError("");
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportCsv(journal)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "wayfarer-travel.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const been = journal.places.filter((p) => p.status === "been");
  const want = journal.places.filter((p) => p.status === "want");
  const countries = new Set(
    been.map((p) => p.country.toLowerCase()).filter(Boolean),
  ).size;
  const list = journal.places
    .filter(
      (p) =>
        p.status === tab &&
        `${p.name} ${p.country} ${p.notes}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent")
        return b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
      const score = (p: Place) =>
        sort === "first"
          ? p.ratings[0]
          : sort === "second"
            ? p.ratings[1]
            : average(p);
      return (
        (score(b) ?? -1) - (score(a) ?? -1) || a.name.localeCompare(b.name)
      );
    });
  const ranking = been.toSorted(
    (a, b) =>
      (average(b) ?? -1) - (average(a) ?? -1) || a.name.localeCompare(b.name),
  );
  if (session !== "open")
    return (
      <main className="welcome">
        <div className="welcome-copy">
          <a className="brand" href="/">
            <Compass size={30} />
            <span>
              wayfarer<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="welcome-main">
            <h1>Travel journal</h1>
            <form onSubmit={unlock} className="unlock-form">
              <label htmlFor="shared-key">Your shared key</label>
              <input
                id="shared-key"
                name="key"
                type="password"
                placeholder="Enter your journal key"
                required
                autoComplete="current-password"
                disabled={session === "loading" || !configured}
              />
              <button
                className="primary full"
                disabled={busy || session === "loading" || !configured}
              >
                <LockKeyhole size={18} />
                {session === "loading"
                  ? "Opening…"
                  : busy
                    ? "Unlocking…"
                    : "Unlock"}
              </button>
              {!configured && (
                <p className="error">
                  Set the shared key to unlock this journal.
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>
        <div className="welcome-photo">
          <Image
            src="/coast.jpg"
            alt="Gondolas and historic buildings along the Grand Canal in Venice at sunset"
            fill
            priority
            sizes="(max-width: 760px) 100vw, 50vw"
          />
          <div className="photo-overlay" />
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/">
          <Compass size={28} />
          <span>
            wayfarer<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="private-label">
          <LockKeyhole size={13} />
          Private
        </span>
        <div className="header-actions">
          <button
            className="icon-button"
            title="Refresh journal"
            aria-label="Refresh journal"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button"
            title="Journal settings"
            aria-label="Journal settings"
            onClick={() => setModal("settings")}
          >
            <Settings size={19} />
          </button>
          <button
            className="icon-button"
            title="Lock journal"
            aria-label="Lock journal"
            onClick={lock}
            disabled={busy}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="journal-heading">
          <h1>Destinations</h1>
          <button
            className="primary"
            disabled={!loaded || busy}
            onClick={() => {
              setPlace(undefined);
              setModal("add");
            }}
          >
            <Plus size={19} />
            Add a destination
          </button>
        </section>
        <section className="stats" aria-label="Travel summary">
          <div>
            <span className="stat-icon">
              <MapPin size={20} />
            </span>
            <div>
              <strong>{been.length.toString().padStart(2, "0")}</strong>
              <span>Visited</span>
            </div>
          </div>
          <div>
            <span className="stat-icon">
              <Globe2 size={20} />
            </span>
            <div>
              <strong>{countries.toString().padStart(2, "0")}</strong>
              <span>Countries / regions</span>
            </div>
          </div>
          <div>
            <span className="stat-icon">
              <Bookmark size={20} />
            </span>
            <div>
              <strong>{want.length.toString().padStart(2, "0")}</strong>
              <span>Wishlist</span>
            </div>
          </div>
        </section>
        <section className="list-section">
          <div className="list-top">
            <div className="tabs" role="tablist" aria-label="Destination lists">
              <button
                role="tab"
                aria-selected={tab === "been"}
                onClick={() => setTab("been")}
                className={tab === "been" ? "active" : ""}
              >
                <MapPin size={17} />
                Been <span>{been.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "want"}
                onClick={() => setTab("want")}
                className={tab === "want" ? "active" : ""}
              >
                <Bookmark size={17} />
                Want to go <span>{want.length}</span>
              </button>
            </div>
            <div className="file-actions">
              <button
                className="subtle"
                aria-label="Import CSV"
                disabled={!loaded || busy}
                onClick={() => setModal("import")}
              >
                <Upload size={16} />
                <span>Import CSV</span>
              </button>
              <button
                className="subtle"
                aria-label="Export"
                disabled={!loaded || !journal.places.length}
                onClick={download}
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </div>
          <div className="list-controls">
            <label className="search">
              <Search size={18} />
              <input
                aria-label="Search destinations"
                placeholder="Search destinations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="sort-label">
              Sort by
              <select
                aria-label="Sort destinations"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="together">Our rating</option>
                <option value="first">{journal.people[0]}&apos;s rating</option>
                <option value="second">
                  {journal.people[1]}&apos;s rating
                </option>
                <option value="name">Name A–Z</option>
                <option value="recent">Latest visit</option>
              </select>
            </label>
          </div>
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button className="subtle" onClick={refresh} disabled={busy}>
                Refresh journal
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="success">
              <Check size={15} />
              {notice}
            </p>
          )}
          <div
            className="destination-list"
            role="tabpanel"
            aria-label={
              tab === "been" ? "Places we have been" : "Places we want to go"
            }
          >
            {!loaded ? (
              <div className="empty">
                <Compass size={34} />
                <h2>{error ? "Your journal could not load" : "Loading…"}</h2>
                {error && (
                  <button className="primary" onClick={refresh} disabled={busy}>
                    Try again
                  </button>
                )}
              </div>
            ) : !list.length ? (
              <div className="empty">
                <span className="empty-icon">
                  {tab === "been" ? (
                    <MapPin size={30} />
                  ) : (
                    <Bookmark size={30} />
                  )}
                </span>
                <h2>
                  {query ? "No matching destinations" : "No destinations yet"}
                </h2>
              </div>
            ) : (
              <>
                <div className="table-heading">
                  <span>DESTINATION</span>
                  <span>{journal.people[0]}</span>
                  <span>{journal.people[1]}</span>
                  <span>TOGETHER</span>
                </div>
                {list.map((p, i) => {
                  const score = average(p);
                  return (
                    <button
                      className="destination"
                      key={p.id}
                      onClick={() => {
                        setPlace(p);
                        setModal("edit");
                      }}
                    >
                      <div className="destination-info">
                        <span
                          className="place-art"
                          style={{ background: colors[i % colors.length] }}
                        >
                          <MapPin size={23} />
                        </span>
                        <div>
                          <span className="place-heading">
                            {tab === "been" && score !== null && (
                              <span className="rank">
                                {ranking.findIndex((r) => r.id === p.id) + 1}.
                              </span>
                            )}
                            <strong>{p.name}</strong>
                          </span>
                          <span className="place-meta">
                            {p.country}
                            {p.date
                              ? `${p.country ? " · " : ""}${new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
                              : ""}
                          </span>
                          {p.notes && (
                            <span className="place-note">{p.notes}</span>
                          )}
                        </div>
                      </div>
                      <div className="person-rating">
                        <span className="mobile-person">
                          {journal.people[0]}
                        </span>
                        <span>{p.ratings[0]?.toFixed(1) ?? "—"}</span>
                      </div>
                      <div className="person-rating">
                        <span className="mobile-person">
                          {journal.people[1]}
                        </span>
                        <span>{p.ratings[1]?.toFixed(1) ?? "—"}</span>
                      </div>
                      <div className="together-rating">
                        <span className="mobile-person">Together</span>
                        <span
                          className={score !== null ? "score-pill" : "unrated"}
                        >
                          {score?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          {tab === "been" && (
            <p className="list-footnote">
              Average of available ratings (0–10).
            </p>
          )}
        </section>
      </main>
      {(modal === "add" || modal === "edit") && (
        <PlaceForm
          place={modal === "edit" ? place : undefined}
          people={journal.people}
          defaultStatus={tab}
          busy={busy}
          onRefresh={refresh}
          onClose={() => setModal(null)}
          onSave={async (p) => {
            const found = journal.places.some((x) => x.id === p.id);
            if (modal === "edit" && !found)
              throw new Error(
                "This destination was removed by your partner. Close this draft and add it as a new destination if you want to keep it.",
              );
            await save({
              ...journal,
              places: found
                ? journal.places.map((x) =>
                    x.id === p.id ? mergePlace(p, place!, x) : x,
                  )
                : [...journal.places, p],
            });
          }}
          onDelete={async (p) =>
            save(
              {
                ...journal,
                places: journal.places.filter((x) => x.id !== p.id),
              },
              "Destination removed",
            )
          }
        />
      )}{" "}
      {modal === "import" && (
        <ImportForm
          journal={journal}
          busy={busy}
          onRefresh={refresh}
          onClose={() => setModal(null)}
          onImport={async (places) =>
            save(
              { ...journal, places: [...journal.places, ...places] },
              `${places.length} destinations imported`,
            )
          }
        />
      )}{" "}
      {modal === "settings" && (
        <Modal title="Settings" onClose={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await save(
                  {
                    ...journal,
                    people: [
                      String(f.get("first")).trim(),
                      String(f.get("second")).trim(),
                    ],
                  },
                  "Names updated",
                );
                setModal(null);
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
            <div className="privacy-box">
              <LockKeyhole size={20} />
              <p>
                Anyone with the shared key can view and edit this journal. Lock
                it on shared devices.
              </p>
            </div>
            <p className="muted small">
              On iPhone: open in Safari, tap Share, then Add to Home Screen. On
              Android: use your browser&apos;s Install app or Add to Home screen
              option.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy || !loaded}>
              {busy ? "Saving…" : "Save names"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
