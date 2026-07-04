import { Distributor } from "@/lib/schedule/types";

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function getDistributorName(distributors: Distributor[], distributorId: string | null) {
  if (!distributorId) return "";
  return distributors.find((distributor) => distributor.id === distributorId)?.name ?? "";
}

export function getDistributorSuggestions(distributors: Distributor[], value: string) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue) {
    return [];
  }

  return distributors
    .filter((distributor) => {
      const normalizedDistributor = normalizeSearchText(
        distributor.normalizedName || distributor.name
      );

      return (
        normalizedDistributor.includes(normalizedValue) ||
        normalizedValue.includes(normalizedDistributor)
      );
    })
    .slice(0, 3);
}

export function getFilmAffinitySearchUrl(title: string) {
  return `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(title.trim())}`;
}
