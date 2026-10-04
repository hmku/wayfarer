export const categories = ["city", "nature", "beach"] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  city: "City",
  nature: "Nature",
  beach: "Beach",
};

export const regions = [
  "europe",
  "asia",
  "middle-east",
  "africa",
  "north-america",
  "caribbean-central-america",
  "south-america",
  "oceania",
] as const;
export type Region = (typeof regions)[number];
export const regionLabels: Record<Region, string> = {
  europe: "Europe",
  asia: "Asia",
  "middle-east": "Middle East",
  africa: "Africa",
  "north-america": "North America",
  "caribbean-central-america": "Caribbean & Central America",
  "south-america": "South America",
  oceania: "Oceania",
};

export const isCategory = (v: unknown): v is Category =>
  categories.includes(v as Category);
export const isRegion = (v: unknown): v is Region =>
  regions.includes(v as Region);

// Country and common place names (lowercase) for each region, used to fill
// in a region from free-text country fields.
const names: Record<Region, string> = {
  europe:
    "europe|albania|andorra|austria|belarus|belgium|bosnia|bosnia and herzegovina|bulgaria|croatia|cyprus|czechia|czech republic|denmark|england|estonia|faroe islands|finland|france|germany|gibraltar|greece|greenland|hungary|iceland|ireland|northern ireland|italy|kosovo|latvia|liechtenstein|lithuania|luxembourg|malta|moldova|monaco|montenegro|netherlands|holland|north macedonia|macedonia|norway|poland|portugal|romania|russia|san marino|scotland|serbia|slovakia|slovenia|spain|sweden|switzerland|ukraine|united kingdom|uk|great britain|britain|vatican|vatican city|wales|scandinavia|balkans|mediterranean",
  asia: "asia|afghanistan|bangladesh|bhutan|brunei|cambodia|china|hong kong|india|indonesia|bali|japan|kazakhstan|kyrgyzstan|laos|macau|malaysia|maldives|mongolia|myanmar|burma|nepal|north korea|pakistan|philippines|singapore|south korea|korea|sri lanka|taiwan|tajikistan|thailand|tibet|timor-leste|east timor|turkmenistan|uzbekistan|vietnam|southeast asia|east asia|south asia|central asia",
  "middle-east":
    "middle east|armenia|azerbaijan|bahrain|georgia|iran|iraq|israel|jordan|kuwait|lebanon|oman|palestine|qatar|saudi arabia|syria|turkey|türkiye|turkiye|united arab emirates|uae|dubai|abu dhabi|yemen",
  africa:
    "africa|algeria|angola|benin|botswana|burkina faso|burundi|cabo verde|cape verde|cameroon|central african republic|chad|comoros|congo|democratic republic of the congo|djibouti|egypt|equatorial guinea|eritrea|eswatini|ethiopia|gabon|gambia|ghana|guinea|guinea-bissau|ivory coast|côte d'ivoire|kenya|lesotho|liberia|libya|madagascar|malawi|mali|mauritania|mauritius|morocco|mozambique|namibia|niger|nigeria|rwanda|senegal|seychelles|sierra leone|somalia|south africa|south sudan|sudan|tanzania|zanzibar|togo|tunisia|uganda|zambia|zimbabwe",
  "north-america":
    "north america|united states|united states of america|usa|us|america|canada|mexico|alaska|hawaii|bermuda",
  "caribbean-central-america":
    "caribbean|central america|antigua|antigua and barbuda|aruba|bahamas|barbados|belize|cayman islands|costa rica|cuba|curaçao|curacao|dominica|dominican republic|el salvador|grenada|guadeloupe|guatemala|haiti|honduras|jamaica|martinique|nicaragua|panama|puerto rico|saint lucia|st lucia|st. lucia|turks and caicos|trinidad and tobago|virgin islands",
  "south-america":
    "south america|argentina|bolivia|brazil|chile|colombia|ecuador|galápagos|galapagos|guyana|paraguay|patagonia|peru|suriname|uruguay|venezuela",
  oceania:
    "oceania|australia|fiji|french polynesia|tahiti|bora bora|kiribati|marshall islands|micronesia|nauru|new caledonia|new zealand|palau|papua new guinea|samoa|solomon islands|tonga|tuvalu|vanuatu|pacific islands",
};
const lookup = new Map<string, Region>(
  regions.flatMap((r) => names[r].split("|").map((n) => [n, r] as const)),
);

/** Best-guess region for free text like "Italy" or "Kyoto, Japan". */
export function inferRegion(text: string): Region | undefined {
  const value = text.trim().toLowerCase();
  if (!value) return undefined;
  const direct = lookup.get(value);
  if (direct) return direct;
  // "Kyoto, Japan" or "Tuscany / Italy": try each part, last first.
  const parts = value.split(/[,/()|·-]+/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts.toReversed()) {
    const match = lookup.get(part);
    if (match) return match;
  }
  return undefined;
}
