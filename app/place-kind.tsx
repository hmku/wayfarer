import { Building2, LucideIcon, TreePalm, Trees } from "lucide-react";
import { location, Place, regionOf } from "@/lib/model";
import { Category, categoryLabels, regionLabels } from "@/lib/regions";

export const categoryIcons: Record<Category, LucideIcon> = {
  city: Building2,
  nature: Trees,
  beach: TreePalm,
};

/** Decorative category icon; pair it with visible or accessible text. */
export function CategoryIcon({
  category,
  size = 14,
}: {
  category: Category;
  size?: number;
}) {
  const Icon = categoryIcons[category];
  return <Icon size={size} aria-hidden="true" />;
}

/** Label of the place's effective region (explicit or inferred), or "". */
export function regionLabel(p: Place) {
  const region = regionOf(p);
  return region ? regionLabels[region] : "";
}

/** Location text for lists: the country, falling back to the region. */
export function displayLocation(p: Place) {
  return location(p) || regionLabel(p);
}

export const categoryLabel = (p: Place) =>
  p.category ? categoryLabels[p.category] : "";
