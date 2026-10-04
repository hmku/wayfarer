import { Journal, Place } from "../lib/model";
import { place } from "./app-helpers";

const with_ = (p: Place, patch: Partial<Place>): Place => ({ ...p, ...patch });

/** A journal with categories, regions, and rankings for both people. */
export const statsJournal: Journal = {
  version: 1,
  people: ["Harrison", "Maya"],
  places: [
    with_(place("st-bali", "Uluwatu", "Indonesia"), { category: "beach" }),
    with_(place("st-tulum", "Tulum", "Mexico"), { category: "beach" }),
    with_(place("st-rome", "Rome", "Italy"), { category: "city" }),
    with_(place("st-tokyo", "Tokyo", "Japan"), { category: "city" }),
    with_(place("st-banff", "Banff", "Canada"), { category: "nature" }),
    with_(place("st-dolo", "Dolomites", "Italy"), { category: "nature" }),
    // No category; region inferred from the country.
    place("st-lisbon", "Lisbon", "Portugal"),
    // Chosen region, no country.
    with_(place("st-fiji", "Coral Coast", ""), {
      category: "beach",
      region: "oceania",
    }),
    with_(place("st-kyoto", "Kyoto", "Japan", "want"), { category: "city" }),
    with_(place("st-patag", "Torres del Paine", "Chile", "want"), {
      category: "nature",
    }),
  ],
  rankings: [
    [
      ["st-bali"],
      ["st-fiji"],
      ["st-tulum", "st-dolo"],
      ["st-rome"],
      ["st-banff"],
      ["st-lisbon"],
      ["st-tokyo"],
      ["st-kyoto"],
    ],
    [
      ["st-dolo"],
      ["st-banff"],
      ["st-rome"],
      ["st-bali"],
      ["st-tokyo"],
      ["st-lisbon"],
      ["st-tulum"],
    ],
  ],
};
