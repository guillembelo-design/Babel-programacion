import { Distributor } from "@/lib/schedule/types";
import { normalizeDistributorName } from "@/lib/schedule/store";

export function getDistributorName(distributors: Distributor[], distributorId: string | null) {
  if (!distributorId) return "";
  return distributors.find((distributor) => distributor.id === distributorId)?.name ?? "";
}

export function getDistributorSuggestions(distributors: Distributor[], value: string) {
  const normalizedValue = normalizeDistributorName(value);

  if (!normalizedValue) {
    return [];
  }

  return distributors
    .filter(
      (distributor) =>
        distributor.normalizedName.includes(normalizedValue) ||
        normalizedValue.includes(distributor.normalizedName)
    )
    .slice(0, 3);
}

export function getFilmAffinitySearchUrl(title: string) {
  return `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(title.trim())}`;
}
