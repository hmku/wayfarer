/**
 * Focus return for chains of modals.
 *
 * One dialog often replaces another in the same React commit (details → edit →
 * details). Native <dialog> focus restoration then targets an element that was
 * unmounted with the previous dialog, so focus falls to <body>. Instead we
 * remember the element that opened the first dialog of a chain and restore it
 * once the last dialog closes. If that element is gone (for example, the table
 * re-rendered on another tab), fall back to the table row for the same place,
 * then to the page's main heading.
 */
let openCount = 0;
let opener: HTMLElement | null = null;
let placeId: string | null = null;
let restoreTimer: ReturnType<typeof setTimeout> | undefined;

function rowControl(id: string) {
  const row = [
    ...document.querySelectorAll<HTMLElement>("tr[data-place-id]"),
  ].find((el) => el.dataset.placeId === id);
  if (!row) return null;
  const preferDrag = opener?.classList.contains("drag-handle");
  return (
    (preferDrag ? row.querySelector<HTMLElement>(".drag-handle") : null) ??
    row.querySelector<HTMLElement>(".place-link") ??
    row.querySelector<HTMLElement>("button")
  );
}

function mainHeading() {
  const heading = document.querySelector<HTMLElement>("main h1, h1");
  if (heading && !heading.hasAttribute("tabindex"))
    heading.setAttribute("tabindex", "-1");
  return heading;
}

/** Call before a modal opens. `id` names the place the dialog is about. */
export function dialogOpened(id?: string) {
  if (restoreTimer !== undefined) {
    // A dialog closed in this same commit; we are continuing its chain.
    clearTimeout(restoreTimer);
    restoreTimer = undefined;
  } else if (openCount === 0) {
    const active = document.activeElement;
    opener =
      active instanceof HTMLElement && active !== document.body
        ? active
        : null;
    placeId =
      opener?.closest<HTMLElement>("[data-place-id]")?.dataset.placeId ?? null;
  }
  if (id) placeId = id;
  openCount++;
}

/** Update the place a still-open chain is about (e.g. after "Add" saves). */
export function dialogPlace(id?: string) {
  if (id && openCount > 0) placeId = id;
}

/** Call after a modal closes; restores focus once the whole chain is closed. */
export function dialogClosed() {
  openCount = Math.max(0, openCount - 1);
  if (openCount > 0) return;
  if (restoreTimer !== undefined) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = undefined;
    if (openCount > 0) return;
    const target =
      (opener?.isConnected && !opener.matches(":disabled") ? opener : null) ??
      (placeId ? rowControl(placeId) : null) ??
      mainHeading();
    opener = null;
    placeId = null;
    target?.focus();
  });
}
