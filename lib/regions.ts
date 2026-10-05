export const categories = ["city", "nature", "beach"] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  city: "City",
  nature: "Nature",
  beach: "Beach",
};

export const regions = [
  "west-coast",
  "central",
  "east-coast",
  "caribbean",
  "south-america",
  "europe",
  "africa",
  "asia",
  "oceania",
] as const;
export type Region = (typeof regions)[number];
export const regionLabels: Record<Region, string> = {
  "west-coast": "US West Coast",
  central: "US Central",
  "east-coast": "US East Coast",
  caribbean: "Caribbean",
  "south-america": "South America",
  europe: "Europe",
  africa: "Africa",
  asia: "Asia",
  oceania: "Oceania",
};

export const isCategory = (v: unknown): v is Category =>
  categories.includes(v as Category);
export const isRegion = (v: unknown): v is Region =>
  regions.includes(v as Region);
