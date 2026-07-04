import { NextRequest, NextResponse } from "next/server";

type WikidataSearchEntity = {
  id: string;
  label?: string;
  description?: string;
};

type WikidataSearchResponse = {
  search?: WikidataSearchEntity[];
};

type WikidataEntityResponse = {
  entities?: Record<string, WikidataEntity | { missing: string }>;
};

type WikidataEntity = {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WikidataClaim[]>;
};

type WikidataClaim = {
  rank?: "preferred" | "normal" | "deprecated";
  mainsnak?: {
    datavalue?: {
      value?: WikidataEntityValue | WikidataQuantityValue | WikidataTimeValue;
    };
  };
};

type WikidataEntityValue = {
  id?: string;
};

type WikidataQuantityValue = {
  amount?: string;
  unit?: string;
};

type WikidataTimeValue = {
  time?: string;
};

type MovieSearchResult = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  year: string | null;
  durationMinutes: number | null;
};

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const FILM_ENTITY_ID = "Q11424";
const MINUTE_UNIT_ID = "Q7727";
const SECOND_UNIT_ID = "Q11574";
const HOUR_UNIT_ID = "Q25235";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const searchResults = await searchWikidata(query);
    const entities = await getWikidataEntities(searchResults.map((result) => result.id));
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const results = searchResults
      .map((result) => {
        const entity = entityById.get(result.id);
        if (!entity || !isLikelyFilm(entity, result)) return null;
        return mapEntityToMovieResult(entity, result);
      })
      .filter((result): result is MovieSearchResult => Boolean(result))
      .slice(0, 6);

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo buscar en Wikidata." },
      { status: 502 }
    );
  }
}

async function searchWikidata(query: string) {
  const spanishResults = await wikidataSearch(query, "es");
  const englishResults = spanishResults.length ? [] : await wikidataSearch(query, "en");
  const uniqueResults = new Map<string, WikidataSearchEntity>();

  [...spanishResults, ...englishResults].forEach((result) => {
    uniqueResults.set(result.id, result);
  });

  return Array.from(uniqueResults.values()).slice(0, 10);
}

async function wikidataSearch(query: string, language: "es" | "en") {
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", query);
  url.searchParams.set("language", language);
  url.searchParams.set("uselang", "es");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "10");
  url.searchParams.set("format", "json");

  const data = await wikidataFetch<WikidataSearchResponse>(url);
  return data.search ?? [];
}

async function getWikidataEntities(ids: string[]) {
  if (!ids.length) return [];

  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("languages", "es|en");
  url.searchParams.set("props", "labels|descriptions|claims");
  url.searchParams.set("format", "json");

  const data = await wikidataFetch<WikidataEntityResponse>(url);
  return Object.values(data.entities ?? {}).filter(isWikidataEntity);
}

function mapEntityToMovieResult(
  entity: WikidataEntity,
  searchResult: WikidataSearchEntity
): MovieSearchResult {
  return {
    sourceId: entity.id,
    sourceUrl: `https://www.wikidata.org/wiki/${entity.id}`,
    title: getEntityLabel(entity, searchResult),
    year: getReleaseYear(entity),
    durationMinutes: getDurationMinutes(entity)
  };
}

function isLikelyFilm(entity: WikidataEntity, searchResult: WikidataSearchEntity) {
  const instanceIds = getEntityClaimIds(entity, "P31");
  if (instanceIds.includes(FILM_ENTITY_ID)) return true;

  const description = [
    searchResult.description,
    entity.descriptions?.es?.value,
    entity.descriptions?.en?.value
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return ["film", "movie", "pelicula", "largometraje", "cortometraje"].some(
    (word) => description.includes(word)
  );
}

function getEntityLabel(entity: WikidataEntity, searchResult: WikidataSearchEntity) {
  return entity.labels?.es?.value || entity.labels?.en?.value || searchResult.label || "Sin titulo";
}

function getReleaseYear(entity: WikidataEntity) {
  const releaseClaim = getBestClaim(entity.claims?.P577);
  const value = releaseClaim?.mainsnak?.datavalue?.value;

  if (!isTimeValue(value) || !value.time) return null;

  const match = value.time.match(/[+-](\d{4})/);
  return match?.[1] ?? null;
}

function getDurationMinutes(entity: WikidataEntity) {
  const durationClaim = getBestClaim(entity.claims?.P2047);
  const value = durationClaim?.mainsnak?.datavalue?.value;

  if (!isQuantityValue(value)) return null;

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unitId = getUnitId(value.unit);

  if (unitId === SECOND_UNIT_ID) {
    return Math.round(amount / 60);
  }

  if (unitId === HOUR_UNIT_ID) {
    return Math.round(amount * 60);
  }

  if (unitId === MINUTE_UNIT_ID || value.unit === "1") {
    return Math.round(amount);
  }

  return amount > 1000 ? Math.round(amount / 60) : Math.round(amount);
}

function getBestClaim(claims?: WikidataClaim[]) {
  if (!claims?.length) return null;
  return (
    claims.find((claim) => claim.rank === "preferred") ??
    claims.find((claim) => claim.rank !== "deprecated") ??
    null
  );
}

function getEntityClaimIds(entity: WikidataEntity, property: string) {
  return (entity.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter(isEntityValue)
    .map((value) => value.id)
    .filter((id): id is string => Boolean(id));
}

function getUnitId(unit?: string) {
  return unit?.match(/\/entity\/(Q\d+)$/)?.[1] ?? "";
}

function isWikidataEntity(entity: WikidataEntity | { missing: string }): entity is WikidataEntity {
  return "id" in entity;
}

function isEntityValue(value: unknown): value is WikidataEntityValue {
  return typeof value === "object" && value !== null && "id" in value;
}

function isQuantityValue(value: unknown): value is WikidataQuantityValue {
  return typeof value === "object" && value !== null && "amount" in value;
}

function isTimeValue(value: unknown): value is WikidataTimeValue {
  return typeof value === "object" && value !== null && "time" in value;
}

async function wikidataFetch<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "BabelProgramacion/1.0"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Wikidata no ha respondido correctamente.");
  }

  return response.json() as Promise<T>;
}
