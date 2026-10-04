"use client";
import {
  ChartBar,
  Compass,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Settings,
} from "lucide-react";
import styles from "./stats-view.module.css";

export function AppHeader({
  busy,
  stats,
  onStats,
  onHome,
  onRefresh,
  onSettings,
  onLock,
}: {
  busy: boolean;
  /** Whether the stats view is showing. */
  stats: boolean;
  onStats: () => void;
  /** Brand click: back to the top of the list with filters cleared (no reload). */
  onHome: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  onLock: () => void;
}) {
  return (
    <header className="app-header">
      <button
        type="button"
        className="brand brand-button"
        title="Back to top"
        aria-label="Wayfarer, back to top"
        onClick={onHome}
      >
        <Compass size={28} />
        <span>
          wayfarer<span className="brand-dot">.</span>
        </span>
      </button>
      <span className="private-label">
        <LockKeyhole size={13} />
        Private
      </span>
      <div className="header-actions">
        <button
          type="button"
          className={`icon-button ${styles.headerToggle}`}
          title={stats ? "Back to the list (shortcut: S)" : "Stats (shortcut: S)"}
          aria-label="Stats"
          aria-pressed={stats}
          onClick={onStats}
        >
          <ChartBar size={19} />
        </button>
        <button
          className="icon-button"
          title="Refresh journal"
          aria-label="Refresh journal"
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw size={18} />
        </button>
        <button
          className="icon-button"
          title="Journal settings"
          aria-label="Journal settings"
          onClick={onSettings}
        >
          <Settings size={19} />
        </button>
        <button
          className="icon-button"
          title="Lock journal"
          aria-label="Lock journal"
          onClick={onLock}
          disabled={busy}
        >
          <LogOut size={19} />
        </button>
      </div>
    </header>
  );
}
