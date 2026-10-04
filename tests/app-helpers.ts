import { expect, Page, request } from "@playwright/test";
import { emptyJournal, Journal, Place } from "../lib/model";

export const origin = `http://localhost:${process.env.E2E_PORT || 3001}`;
const key = "test-pass";

export function place(
  id: string,
  name: string,
  country: string,
  status: Place["status"] = "been",
  date = "",
): Place {
  return { id, name, country, status, date, notes: "", ratings: [null, null] };
}

/** Log the page's browser context in and replace the journal with `journal`. */
export async function seed(page: Page, journal: Journal) {
  const login = await page.request.post("/api/session", {
    headers: { origin },
    data: { key },
  });
  expect(login.status()).toBe(200);
  const current = await (await page.request.get("/api/journal")).json();
  const put = await page.request.put("/api/journal", {
    headers: { origin },
    data: { journal, revision: current.revision },
  });
  expect(put.status()).toBe(200);
}

export async function readJournal(page: Page) {
  return (await (await page.request.get("/api/journal")).json()) as {
    journal: Journal;
    revision: string;
  };
}

export async function writeJournal(page: Page, journal: Journal) {
  const { revision } = await readJournal(page);
  const put = await page.request.put("/api/journal", {
    headers: { origin },
    data: { journal, revision },
  });
  expect(put.status()).toBe(200);
}

export async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Destinations", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel")).not.toContainText("Loading…");
}

export const rows = (page: Page) => page.locator("tbody tr");

/** Leave an empty journal behind: tests/journal.spec.ts expects to start from one. */
export async function resetJournal() {
  const api = await request.newContext({ baseURL: origin });
  await api.post("/api/session", { headers: { origin }, data: { key } });
  const current = await (await api.get("/api/journal")).json();
  await api.put("/api/journal", {
    headers: { origin },
    data: { journal: emptyJournal(), revision: current.revision },
  });
  await api.dispose();
}
