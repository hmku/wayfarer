import { test, expect } from "@playwright/test";
import { emptyJournal, Journal, Place } from "../lib/model";
import { applyChanges, diffJournals } from "../lib/changes";
import { forgetRanking, moveRanking, personalGroups } from "../lib/ranking";
import { resetJournal } from "./app-helpers";

test.afterAll(resetJournal);

const place = (id: string, status: Place["status"] = "been"): Place => ({
  id,
  name: id,
  country: "Europe",
  status,
  date: "",
  notes: "",
  ratings: [null, null],
});

const base: Journal = {
  ...emptyJournal(),
  people: ["Alex", "Sam"],
  places: [place("A"), place("B"), place("C"), place("W", "want")],
  rankings: [
    [["A"], ["B"], ["C"], ["W"]],
    [["C"], ["B"], ["A"], ["W"]],
  ],
};

/** Both people edit from `base`; `theirs` saves first, then `mine`. */
function race(mine: Journal, theirs: Journal) {
  const afterTheirs = applyChanges(base, diffJournals(base, theirs));
  return applyChanges(afterTheirs, diffJournals(base, mine));
}

test("two people ranking their own lists at once both keep their order", () => {
  const alex = moveRanking(base, 0, "been", "C", "A", "before");
  const sam = moveRanking(base, 1, "been", "A", "C", "before");
  const result = race(alex, sam);
  expect(personalGroups(result, 0, "been")).toEqual([["C"], ["A"], ["B"]]);
  expect(personalGroups(result, 1, "been")).toEqual([["A"], ["C"], ["B"]]);
});

test("different fields of the same place merge", () => {
  const edit = (patch: Partial<Place>): Journal => ({
    ...base,
    places: base.places.map((p) => (p.id === "A" ? { ...p, ...patch } : p)),
  });
  const result = race(edit({ notes: "Mine" }), edit({ country: "Italy" }));
  const a = result.places.find((p) => p.id === "A")!;
  expect(a.notes).toBe("Mine");
  expect(a.country).toBe("Italy");
});

test("the same field changed differently conflicts", () => {
  const edit = (notes: string): Journal => ({
    ...base,
    places: base.places.map((p) => (p.id === "A" ? { ...p, notes } : p)),
  });
  expect(() => race(edit("Mine"), edit("Theirs"))).toThrow(
    "Your partner changed A's notes",
  );
  // The same change made twice is not a conflict.
  expect(race(edit("Same"), edit("Same")).places[0].notes).toBe("Same");
});

test("both reordering the same person's list conflicts", () => {
  const one = moveRanking(base, 0, "been", "C", "A", "before");
  const two = moveRanking(base, 0, "been", "B", "A", "before");
  expect(() => race(one, two)).toThrow("Alex's Been ranking");
});

test("a reorder survives the partner deleting or adding places", () => {
  const alex = moveRanking(base, 0, "been", "C", "A", "before");
  const sam: Journal = {
    ...base,
    places: [
      ...base.places.filter((p) => p.id !== "B"),
      { ...place("D"), ratings: [5, null] },
    ],
    rankings: [
      base.rankings![0].filter((g) => g[0] !== "B"),
      base.rankings![1].filter((g) => g[0] !== "B"),
    ],
  };
  const result = race(alex, sam);
  expect(result.places.map((p) => p.id)).not.toContain("B");
  expect(personalGroups(result, 0, "been").flat()).toEqual(["C", "A", "D"]);
});

test("moving a place to the other list leaves its old rankings", () => {
  // As the app does it: forget the rankings, then change the list.
  const forgotten = forgetRanking(base, "A");
  const moved: Journal = {
    ...forgotten,
    places: base.places.map((p) =>
      p.id === "A" ? { ...p, status: "want" } : p,
    ),
  };
  // Meanwhile the partner reorders their Been list, still including A.
  const sam = moveRanking(base, 1, "been", "A", "C", "before");
  const result = race(moved, sam);
  expect(result.places.find((p) => p.id === "A")?.status).toBe("want");
  expect(result.rankings!.flat(2)).not.toContain("A");
  expect(personalGroups(result, 1, "been")).toEqual([["C"], ["B"]]);
});

test("the API applies concurrent changes from stale copies", async ({
  request: api,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const headers = { origin };
  await api.post("/api/session", { headers, data: { key: "test-pass" } });
  const current = await (await api.get("/api/journal")).json();
  expect(
    (
      await api.put("/api/journal", {
        headers,
        data: { journal: base, revision: current.revision },
      })
    ).status(),
  ).toBe(200);
  // Both phones loaded `base`; each sends only its own ranking change.
  const alex = diffJournals(base, moveRanking(base, 0, "been", "C", "A", "before"));
  const sam = diffJournals(base, moveRanking(base, 1, "been", "A", "C", "before"));
  for (const changes of [sam, alex])
    expect(
      (await api.patch("/api/journal", { headers, data: { changes } })).status(),
    ).toBe(200);
  const saved = (await (await api.get("/api/journal")).json()).journal;
  expect(personalGroups(saved, 0, "been")).toEqual([["C"], ["A"], ["B"]]);
  expect(personalGroups(saved, 1, "been")).toEqual([["A"], ["C"], ["B"]]);

  // Editing the same field from the same stale copy is a real conflict.
  const note = (notes: string) =>
    diffJournals(base, {
      ...base,
      places: base.places.map((p) => (p.id === "B" ? { ...p, notes } : p)),
    });
  expect(
    (await api.patch("/api/journal", { headers, data: { changes: note("One") } })).status(),
  ).toBe(200);
  const clash = await api.patch("/api/journal", {
    headers,
    data: { changes: note("Two") },
  });
  expect(clash.status()).toBe(409);
  expect((await clash.json()).error).toContain("Your partner changed B's notes");

  // Malformed changes are rejected without touching the journal.
  const bad = await api.patch("/api/journal", {
    headers,
    data: { changes: [{ kind: "field", id: "B", field: "secret", value: 1, expect: 0 }] },
  });
  expect(bad.status()).toBe(400);
  const invalid = await api.patch("/api/journal", {
    headers,
    data: { changes: [{ kind: "field", id: "B", field: "rating0", value: 99, expect: null }] },
  });
  expect(invalid.status()).toBe(400);
});
