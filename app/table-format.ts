import type { Place } from "@/lib/model";

/** Human label for a list status. */
export function statusLabel(status: Place["status"]) {
  return status === "been" ? "Been" : "Want to go";
}

/** One-decimal score, or an em dash when unrated. */
export function formatScore(score: number | null | undefined) {
  return score == null ? "—" : score.toFixed(1);
}

/** Today's date in the user's local time zone as YYYY-MM-DD. */
export function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
