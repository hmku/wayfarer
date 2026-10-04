"use client";
import Image from "next/image";
import { Compass, LockKeyhole } from "lucide-react";

function Brand({ size }: { size: number }) {
  return (
    <div className="brand">
      <Compass size={size} />
      <span>
        wayfarer<span className="brand-dot">.</span>
      </span>
    </div>
  );
}

/** Neutral placeholder while the session check runs, so unlocked users never see the lock form flash. */
export function SessionLoading() {
  return (
    <main className="app-loading" aria-busy="true">
      <div className="empty">
        <Compass size={34} />
        <h2>Opening your journal…</h2>
      </div>
    </main>
  );
}

export function LockScreen({
  configured,
  busy,
  error,
  onUnlock,
}: {
  configured: boolean;
  busy: boolean;
  error: string;
  onUnlock: (key: string) => Promise<boolean>;
}) {
  return (
    <main className="welcome">
      <div className="welcome-copy">
        <Brand size={30} />
        <div className="welcome-main">
          <h1>Travel journal</h1>
          <form
            className="unlock-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const key = String(new FormData(form).get("key") ?? "");
              if (await onUnlock(key)) form.reset();
            }}
          >
            <label htmlFor="shared-key">Your shared key</label>
            <input
              id="shared-key"
              name="key"
              type="password"
              placeholder="Enter your journal key"
              required
              autoComplete="current-password"
              disabled={!configured}
            />
            <button className="primary full" disabled={busy || !configured}>
              <LockKeyhole size={18} />
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            {!configured && (
              <p className="error">Set the shared key to unlock this journal.</p>
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
}
