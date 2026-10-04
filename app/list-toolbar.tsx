"use client";
import { useRef } from "react";
import { Bookmark, Download, MapPin, Search, Upload, X } from "lucide-react";
import { ScorePerson, Sort, sortValue, Tab } from "./journal-view";

export const PANEL_ID = "destinations-panel";
export const tabId = (tab: Tab) => `tab-${tab}`;
const tabs: Tab[] = ["been", "want"];

export function ListToolbar({
  tab,
  counts,
  people,
  sort,
  query,
  country,
  reordering,
  canReorder,
  loaded,
  busy,
  hasPlaces,
  searchRef,
  onTab,
  onSort,
  onReorderPerson,
  onQuery,
  onClearCountry,
  onToggleReorder,
  onImport,
  onExport,
}: {
  tab: Tab;
  counts: Record<Tab, number>;
  people: [string, string];
  /** The sort actually applied (already adjusted for the tab). */
  sort: Sort;
  query: string;
  /** Active country filter label, or "" for none. */
  country: string;
  reordering: boolean;
  canReorder: boolean;
  loaded: boolean;
  busy: boolean;
  hasPlaces: boolean;
  searchRef: React.Ref<HTMLInputElement>;
  onTab: (tab: Tab) => void;
  onSort: (value: string) => void;
  onReorderPerson: (person: ScorePerson) => void;
  onQuery: (query: string) => void;
  onClearCountry: () => void;
  onToggleReorder: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  function onTabKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    const i = tabs.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? tabs[(i + 1) % tabs.length]
        : e.key === "ArrowLeft"
          ? tabs[(i - 1 + tabs.length) % tabs.length]
          : e.key === "Home"
            ? tabs[0]
            : e.key === "End"
              ? tabs.at(-1)!
              : null;
    if (!next) return;
    e.preventDefault();
    onTab(next);
    tabRefs.current[next]?.focus();
  }
  return (
    <>
      <div className="list-top">
        <div className="tabs" role="tablist" aria-label="Destination lists">
          {tabs.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              id={tabId(t)}
              role="tab"
              type="button"
              aria-selected={tab === t}
              aria-controls={PANEL_ID}
              tabIndex={tab === t ? 0 : -1}
              title={`Shortcut: ${i + 1}`}
              onClick={() => onTab(t)}
              onKeyDown={onTabKey}
              className={tab === t ? "active" : ""}
            >
              {t === "been" ? <MapPin size={17} /> : <Bookmark size={17} />}
              {t === "been" ? "Been" : "Want to go"} <span>{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="file-actions">
          <button
            className="subtle"
            aria-label="Import CSV"
            disabled={!loaded || busy}
            onClick={onImport}
          >
            <Upload size={16} />
            <span>Import CSV</span>
          </button>
          <button
            className="subtle"
            aria-label="Export"
            disabled={!loaded || !hasPlaces}
            onClick={onExport}
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
            ref={searchRef}
            aria-label="Search destinations"
            placeholder="Search destinations"
            title="Search destinations (shortcut: /)"
            value={query}
            disabled={reordering}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        {country && (
          <span className="filter-chip">
            <span>{country}</span>
            <button
              type="button"
              aria-label={`Remove ${country} filter`}
              title="Remove filter"
              onClick={onClearCountry}
            >
              <X size={14} />
            </button>
          </span>
        )}
        <label className="sort-label">
          {reordering ? "Ranking" : "Sort by"}
          {reordering ? (
            <select
              aria-label="Reorder ranking for"
              value={sort.person === "second" ? "second" : "first"}
              disabled={busy}
              onChange={(e) => onReorderPerson(e.target.value as ScorePerson)}
            >
              <option value="first">{people[0]}</option>
              <option value="second">{people[1]}</option>
            </select>
          ) : (
            <select
              aria-label="Sort destinations"
              value={sortValue(sort)}
              disabled={busy}
              onChange={(e) => onSort(e.target.value)}
            >
              <optgroup label="Score">
                <option value="together">Together</option>
                <option value="first">{people[0]}</option>
                <option value="second">{people[1]}</option>
              </optgroup>
              <optgroup label="Order">
                <option value="name">Name A–Z</option>
                <option value="country">Country</option>
                {tab === "been" && (
                  <>
                    <option value="recent">Latest visit</option>
                    <option value="oldest">Oldest visit</option>
                  </>
                )}
              </optgroup>
            </select>
          )}
        </label>
        <button
          className="subtle reorder-toggle"
          disabled={!loaded || busy || !canReorder}
          onClick={onToggleReorder}
        >
          {reordering ? "Done" : "Reorder"}
        </button>
      </div>
    </>
  );
}
