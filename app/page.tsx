"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, Compass, MapPin, Plus, Upload } from "lucide-react";
import { Journal, mergePlace, Place } from "@/lib/model";
import { exportCsv } from "@/lib/csv";
import {
  clearRatings,
  forgetRanking,
  moveRanking,
  Person,
  saveRanking,
} from "@/lib/ranking";
import { countryBreakdown, journalStats } from "@/lib/stats";
import { ImportForm, PlaceForm } from "./components";
import { ComparisonDialog, PlaceDetails } from "./place-details";
import { RankingTable } from "./ranking-table";
import { useJournal, useNotice } from "./use-journal";
import { LockScreen, SessionLoading } from "./lock-screen";
import { AppHeader } from "./app-header";
import { CountryBreakdown, Stats } from "./stats";
import { ListToolbar, PANEL_ID, tabId } from "./list-toolbar";
import { SettingsModal } from "./settings";
import {
  defaultSort,
  deriveView,
  effectiveSort,
  parseSortValue,
  personIndex,
  Sort,
  Tab,
} from "./journal-view";
import { PlaceSnapshot, restorePlace, snapshotPlace } from "./undo";

type ModalKind =
  | "add"
  | "details"
  | "compare"
  | "edit"
  | "import"
  | "settings"
  | "countries";

const conflictHint = "Your partner changed";

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export default function Home() {
  const [requestedModal, setModal] = useState<ModalKind | null>(null);
  const [reordering, setReordering] = useState(false);
  const {
    session,
    configured,
    journal,
    currentJournal,
    loaded,
    busy,
    error,
    setError,
    load,
    save,
    refresh,
    refreshQuietly,
    unlock,
    lock,
  } = useJournal({
    onSessionReset: () => {
      setModal(null);
      setReordering(false);
      setSort(defaultSort);
      clearNotice();
    },
  });
  const [tab, setTab] = useState<Tab>("been");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [sort, setSort] = useState<Sort>(defaultSort);
  const [previousSort, setPreviousSort] = useState<Sort>(defaultSort);
  const [place, setPlace] = useState<Place>();
  const [person, setPerson] = useState<Person>(0);
  const [comparisonKey, setComparisonKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeSort = effectiveSort(sort, tab);
  const { order, person: scorePerson } = activeSort;
  const stats = useMemo(() => journalStats(journal), [journal]);
  const countries = useMemo(() => countryBreakdown(journal), [journal]);
  const countryLabel = countries.find((c) => c.key === country)?.label ?? "";
  // A filter for a location that no longer exists is ignored, not stuck.
  const activeCountry = countryLabel ? country : "";
  const view = useMemo(
    () =>
      deriveView(
        journal,
        tab,
        { order, person: scorePerson },
        query,
        activeCountry,
      ),
    [journal, tab, order, scorePerson, query, activeCountry],
  );
  const currentPlace = journal.places.find((p) => p.id === place?.id);
  // Place dialogs close themselves if their place disappears (e.g. a partner
  // deleted it), so the page never sits in a modal state with nothing shown.
  const modal =
    (requestedModal === "details" || requestedModal === "compare") &&
    !currentPlace
      ? null
      : requestedModal;
  const { notice, show: showNotice, clear: clearNotice } = useNotice(
    modal !== null,
  );

  useEffect(() => {
    if (session !== "open") return;
    const onFocus = () => {
      if (
        document.visibilityState === "visible" &&
        !modal &&
        !busy &&
        !reordering
      )
        refreshQuietly();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [session, modal, busy, reordering, refreshQuietly]);

  const openAdd = useCallback(() => {
    setPlace(undefined);
    setModal("add");
  }, []);

  useEffect(() => {
    if (session !== "open") return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target) || modal || document.querySelector("dialog[open]"))
        return;
      if (e.key === "/") {
        if (reordering) return;
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        if (!loaded || busy) return;
        e.preventDefault();
        openAdd();
      } else if (e.key === "1" || e.key === "2") {
        e.preventDefault();
        setTab(e.key === "1" ? "been" : "want");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, modal, reordering, loaded, busy, openAdd]);

  /** Save, then offer to put `snapshot` back for a few seconds. */
  async function saveWithUndo(
    next: Journal,
    message: string,
    snapshot: PlaceSnapshot | undefined,
    undoneMessage: string,
  ) {
    await save(next);
    if (!snapshot) return showNotice(message);
    showNotice(message, async () => {
      clearNotice();
      try {
        // Restore onto the latest journal; a stale revision still conflicts.
        await save(restorePlace(currentJournal(), snapshot));
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      setTab(snapshot.place.status);
      showNotice(undoneMessage);
    });
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

  function goHome() {
    setQuery("");
    setCountry("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitReorder() {
    if (!reordering) return;
    setReordering(false);
    setSort(previousSort);
  }

  function toggleReorder() {
    if (reordering) exitReorder();
    else {
      setPreviousSort(sort);
      setSort({
        order: "score",
        person: activeSort.person === "second" ? "second" : "first",
      });
      setQuery("");
      setCountry("");
      setReordering(true);
    }
  }

  if (session === "loading") return <SessionLoading />;
  if (session !== "open")
    return (
      <LockScreen
        configured={configured}
        busy={busy}
        error={error}
        onUnlock={unlock}
      />
    );

  const filtered = Boolean(query.trim() || activeCountry);
  return (
    <div className="app-shell">
      <AppHeader
        busy={busy}
        onHome={goHome}
        onRefresh={async () => {
          if (await refresh()) showNotice("Journal refreshed");
        }}
        onSettings={() => setModal("settings")}
        onLock={lock}
      />
      <main className="workspace">
        <section className="journal-heading">
          <h1>Destinations</h1>
          <button
            className="primary"
            title="Add a destination (shortcut: N)"
            disabled={!loaded || busy}
            onClick={openAdd}
          >
            <Plus size={19} />
            Add a destination
          </button>
        </section>
        <Stats
          been={stats.been}
          want={stats.want}
          countries={stats.countries}
          onCountries={() => setModal("countries")}
        />
        <section className="list-section">
          <ListToolbar
            tab={tab}
            counts={{ been: stats.been, want: stats.want }}
            people={journal.people}
            sort={activeSort}
            query={query}
            country={countryLabel}
            reordering={reordering}
            canReorder={view.total > 0}
            loaded={loaded}
            busy={busy}
            hasPlaces={journal.places.length > 0}
            searchRef={searchRef}
            onTab={setTab}
            onSort={(value) => setSort(parseSortValue(value, activeSort))}
            onReorderPerson={(p) => setSort({ order: "score", person: p })}
            onQuery={setQuery}
            onClearCountry={() => setCountry("")}
            onToggleReorder={toggleReorder}
            onImport={() => setModal("import")}
            onExport={download}
          />
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
              {notice.text}
              {notice.undo && (
                <button
                  type="button"
                  className="subtle undo-button"
                  disabled={busy}
                  onClick={notice.undo}
                >
                  Undo
                </button>
              )}
            </p>
          )}
          <div
            className="destination-list"
            role="tabpanel"
            id={PANEL_ID}
            aria-labelledby={tabId(tab)}
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
            ) : !view.list.length ? (
              <div className="empty">
                <span className="empty-icon">
                  {tab === "been" ? <MapPin size={30} /> : <Bookmark size={30} />}
                </span>
                {view.total && filtered ? (
                  <>
                    <h2>No matching destinations</h2>
                    <div className="empty-actions">
                      <button
                        className="subtle"
                        onClick={() => {
                          setQuery("");
                          setCountry("");
                        }}
                      >
                        {query.trim() && activeCountry
                          ? "Clear search and filter"
                          : query.trim()
                            ? "Clear search"
                            : "Clear filter"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>No destinations yet</h2>
                    <div className="empty-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={openAdd}
                      >
                        <Plus size={17} />
                        {tab === "been" ? "Add a visited place" : "Add a place to go"}
                      </button>
                      <button
                        className="subtle"
                        disabled={busy}
                        onClick={() => setModal("import")}
                      >
                        <Upload size={16} />
                        Import from CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <RankingTable
                key={`${tab}-${activeSort.order}-${activeSort.person}`}
                places={view.list}
                people={journal.people}
                ranks={view.ranks}
                scores={view.scores}
                reorder={reordering}
                busy={busy}
                onOpen={(p) => {
                  setPlace(p);
                  setModal("details");
                }}
                onMove={async ({ targetId, anchorId, side }) => {
                  try {
                    await save(
                      moveRanking(
                        journal,
                        personIndex(activeSort.person),
                        tab,
                        targetId,
                        anchorId,
                        side,
                      ),
                    );
                    showNotice("Ranking saved");
                  } catch (e) {
                    const message = (e as Error).message;
                    setError(
                      message.includes(conflictHint)
                        ? "The ranking changed on another device. Refresh, then move the row again."
                        : message,
                    );
                  }
                }}
              />
            )}
          </div>
        </section>
      </main>
      {modal === "details" && currentPlace && (
        <PlaceDetails
          journal={journal}
          place={currentPlace}
          busy={busy}
          onClose={() => setModal(null)}
          onEdit={() => {
            setPlace(currentPlace);
            setModal("edit");
          }}
          onCompare={(i) => {
            setPlace(currentPlace);
            setPerson(i);
            setComparisonKey((k) => k + 1);
            setModal("compare");
          }}
          onMove={async (date?: string) => {
            const nextStatus = currentPlace.status === "been" ? "want" : "been";
            const snapshot = snapshotPlace(journal, currentPlace.id);
            const moved: Place = {
              ...currentPlace,
              status: nextStatus,
              ...(nextStatus === "been" && date !== undefined ? { date } : {}),
            };
            const base = forgetRanking(journal, moved.id);
            await saveWithUndo(
              {
                ...base,
                places: base.places.map((p) => (p.id === moved.id ? moved : p)),
              },
              nextStatus === "been" ? "Moved to Been" : "Moved to Want to go",
              snapshot,
              "Move undone",
            );
            setTab(nextStatus);
            // A move to Been keeps the dialog open so the place can be ranked.
            if (nextStatus === "want") setModal(null);
          }}
          onDelete={async () => {
            const snapshot = snapshotPlace(journal, currentPlace.id);
            const base = forgetRanking(journal, currentPlace.id);
            await saveWithUndo(
              {
                ...base,
                places: base.places.filter((p) => p.id !== currentPlace.id),
              },
              "Destination deleted",
              snapshot,
              `${currentPlace.name} restored`,
            );
          }}
        />
      )}
      {modal === "compare" && currentPlace && place && (
        <ComparisonDialog
          key={comparisonKey}
          journal={journal}
          place={place}
          person={person}
          busy={busy}
          onClose={() => setModal("details")}
          onSave={async (groups) => {
            await save(saveRanking(journal, place, person, groups));
            showNotice("Ranking saved");
          }}
          onRestart={async () => {
            const fresh = await load();
            if (!fresh) throw new Error("Unlock the journal again.");
            const updated = fresh.places.find((p) => p.id === place.id);
            setPlace(updated);
            setModal(updated ? "compare" : null);
            setComparisonKey((k) => k + 1);
          }}
        />
      )}
      {(modal === "add" || modal === "edit") && (
        <PlaceForm
          place={modal === "edit" ? place : undefined}
          defaultStatus={tab}
          busy={busy}
          onRefresh={refresh}
          onClose={() => setModal(place ? "details" : null)}
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
            showNotice("Saved");
            setPlace(p);
            setModal("details");
          }}
        />
      )}
      {modal === "import" && (
        <ImportForm
          journal={journal}
          busy={busy}
          onRefresh={refresh}
          onClose={() => setModal(null)}
          onImport={async (places) => {
            await save({ ...journal, places: [...journal.places, ...places] });
            showNotice(`${places.length} destinations imported`);
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsModal
          journal={journal}
          busy={busy}
          loaded={loaded}
          onClose={() => setModal(null)}
          onSaveNames={async (people) => {
            await save({ ...journal, people });
            showNotice("Names updated");
            setModal(null);
          }}
          onRestore={async (backup) => {
            await save(backup);
            setQuery("");
            setCountry("");
            exitReorder();
            showNotice("Journal restored from backup");
            setModal(null);
          }}
          onClearRatings={async () => {
            await save(clearRatings(journal));
            exitReorder();
            showNotice("All ratings cleared");
            setModal(null);
          }}
        />
      )}
      {modal === "countries" && (
        <CountryBreakdown
          countries={countries}
          onClose={() => setModal(null)}
          onChoose={(c) => {
            setCountry(c.key);
            setQuery("");
            exitReorder();
            // Show the list that actually has places for this location.
            if (c[tab] === 0 && c[tab === "been" ? "want" : "been"] > 0)
              setTab(tab === "been" ? "want" : "been");
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
