"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyJournal, Journal } from "@/lib/model";

export type Session = "loading" | "locked" | "open";

/** A load whose result was discarded because newer state exists. */
export class StaleLoad extends Error {
  constructor() {
    super("The journal changed while refreshing. Please try again.");
  }
}

/** Parse a JSON body without throwing on HTML/empty error pages. */
export async function readJson(r: Response): Promise<Record<string, unknown>> {
  try {
    const data = await r.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function responseError(r: Response, data: Record<string, unknown>) {
  if (typeof data.error === "string" && data.error) return data.error;
  if (r.status === 401) return "Your session expired. Unlock the journal again.";
  if (r.status === 409)
    return "Your partner changed the journal. Refresh, then apply your change again.";
  if (r.status >= 500)
    return "The journal server is unavailable right now. Please try again in a moment.";
  return `Something went wrong (error ${r.status}). Please try again.`;
}

const offlineMessage =
  "Could not reach the journal. Check your connection and try again.";

async function request(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(offlineMessage);
  }
}

export type Notice = {
  id: number;
  text: string;
  /** Present for undoable actions; the notice then lasts longer. */
  undo?: () => Promise<void>;
};

const NOTICE_MS = 4000;
const UNDO_MS = 8000;

/**
 * Transient success messages. Undo notices hold while `paused` (e.g. a
 * dialog covers them) and count down once visible again.
 */
export function useNotice(paused: boolean) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string, undo?: Notice["undo"]) => {
    setNotice({ id: ++counter.current, text, undo });
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  const hold = paused && !!notice?.undo;
  useEffect(() => {
    if (!notice || hold) return;
    const id = notice.id;
    const timer = setTimeout(
      () => setNotice((n) => (n?.id === id ? null : n)),
      notice.undo ? UNDO_MS : NOTICE_MS,
    );
    return () => clearTimeout(timer);
  }, [notice, hold]);
  return { notice, show, clear };
}

export function useJournal({
  onSessionReset,
}: {
  /** Called whenever the session ends (lock or 401) — close dialogs here. */
  onSessionReset?: () => void;
} = {}) {
  const [session, setSession] = useState<Session>("loading");
  const [configured, setConfigured] = useState(true);
  const [journal, setJournalState] = useState<Journal>(emptyJournal);
  // Latest journal for callbacks that outlive a render (e.g. Undo).
  const latest = useRef<Journal>(journal);
  const setJournal = useCallback((next: Journal) => {
    latest.current = next;
    setJournalState(next);
  }, []);
  const currentJournal = useCallback(() => latest.current, []);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef("new");
  const resetRef = useRef(onSessionReset);
  useEffect(() => {
    resetRef.current = onSessionReset;
  });
  // Every load gets a sequence number; only the latest may apply. Saves bump
  // `saveEpoch` when they start and finish so loads overlapping a save are
  // discarded rather than overwriting newer state.
  const loadSeq = useRef(0);
  const saveEpoch = useRef(0);
  const saving = useRef(false);

  const resetSession = useCallback(() => {
    loadSeq.current++;
    revision.current = "new";
    setSession("locked");
    setJournal(emptyJournal());
    setLoaded(false);
    resetRef.current?.();
  }, [setJournal]);

  /** Fetch and apply the journal. Returns null if the session has ended. */
  const load = useCallback(async (): Promise<Journal | null> => {
    const seq = ++loadSeq.current;
    const epoch = saveEpoch.current;
    const r = await request("/api/journal", { cache: "no-store" });
    const data = await readJson(r);
    const stale = () =>
      seq !== loadSeq.current || epoch !== saveEpoch.current || saving.current;
    if (stale()) throw new StaleLoad();
    if (r.status === 401) {
      resetSession();
      return null;
    }
    if (!r.ok || !data.journal || typeof data.revision !== "string")
      throw new Error(
        r.ok ? "The journal response was not understood." : responseError(r, data),
      );
    const next = data.journal as Journal;
    revision.current = data.revision;
    setJournal(next);
    setLoaded(true);
    return next;
  }, [resetSession, setJournal]);

  useEffect(() => {
    (async () => {
      try {
        const r = await request("/api/session");
        const s = await readJson(r);
        if (!r.ok) throw new Error(responseError(r, s));
        setConfigured(s.configured !== false);
        setSession(s.authorized ? "open" : "locked");
        if (s.authorized) await load();
      } catch (e) {
        if (e instanceof StaleLoad) return;
        setSession((current) => (current === "loading" ? "locked" : current));
        setError((e as Error).message);
      }
    })();
  }, [load]);

  const unlock = useCallback(
    async (key: string) => {
      setBusy(true);
      setError("");
      try {
        const r = await request("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        const data = await readJson(r);
        if (!r.ok) throw new Error(responseError(r, data));
        setSession("open");
        await load();
        return true;
      } catch (e) {
        if (!(e instanceof StaleLoad)) setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  /** Save the whole journal against the last known revision. Throws on failure. */
  const save = useCallback(
    async (next: Journal): Promise<Journal> => {
      setBusy(true);
      setError("");
      saving.current = true;
      saveEpoch.current++;
      try {
        const r = await request("/api/journal", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ journal: next, revision: revision.current }),
        });
        const data = await readJson(r);
        if (r.status === 401) resetSession();
        if (!r.ok || !data.journal || typeof data.revision !== "string")
          throw new Error(
            r.ok
              ? "The save response was not understood. Refresh to check your change."
              : responseError(r, data),
          );
        const saved = data.journal as Journal;
        revision.current = data.revision;
        setJournal(saved);
        return saved;
      } finally {
        saving.current = false;
        saveEpoch.current++;
        setBusy(false);
      }
    },
    [resetSession, setJournal],
  );

  /** Explicit refresh: shows errors on the page. Resolves true on success. */
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      return (await load()) !== null;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  /** Background refresh (window focus): silent unless something real fails. */
  const refreshQuietly = useCallback(() => {
    load().catch((e) => {
      if (!(e instanceof StaleLoad)) setError((e as Error).message);
    });
  }, [load]);

  const lock = useCallback(async () => {
    setBusy(true);
    try {
      const r = await request("/api/session", { method: "DELETE" });
      if (!r.ok) throw new Error("Could not lock the journal. Please try again.");
      resetSession();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [resetSession]);

  return {
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
  };
}
