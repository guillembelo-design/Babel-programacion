import { NextRequest, NextResponse } from "next/server";

type TmdbSearchMovie = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
};

type TmdbSearchResponse = {
  results?: TmdbSearchMovie[];
};

type TmdbMovieDetails = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  runtime?: number | null;
  poster_path?: string | null;
};

type MovieSearchResult = {
  tmdbId: number;
  title: string;
  year: string | null;
  durationMinutes: number | null;
  posterUrl: string;
  distributorName: string;
};

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const accessToken = process.env.TMDB_ACCESS_TOKEN;

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "Falta configurar TMDB_ACCESS_TOKEN en el servidor." },
      { status: 503 }
    );
  }

  try {
    const searchUrl = new URL(`${TMDB_API_URL}/search/movie`);
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.set("language", "es-ES");
    searchUrl.searchParams.set("region", "ES");
    searchUrl.searchParams.set("include_adult", "false");
    searchUrl.searchParams.set("page", "1");

    const searchData = await tmdbFetch<TmdbSearchResponse>(searchUrl, accessToken);
    const movies = (searchData.results ?? []).slice(0, 6);

    const results = await Promise.all(
      movies.map((movie) => buildMovieSearchResult(movie, accessToken))
    );

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo buscar en TMDB." },
      { status: 502 }
    );
  }
}

async function buildMovieSearchResult(
  movie: TmdbSearchMovie,
  accessToken: string
): Promise<MovieSearchResult> {
  const details = await getMovieDetails(movie.id, accessToken);
  const title = details?.title || movie.title || movie.original_title || "Sin titulo";
  const releaseDate = details?.release_date || movie.release_date || "";
  const posterPath = details?.poster_path || movie.poster_path || "";

  return {
    tmdbId: movie.id,
    title,
    year: releaseDate ? releaseDate.slice(0, 4) : null,
    durationMinutes: details?.runtime && details.runtime > 0 ? details.runtime : null,
    posterUrl: posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : "",
    distributorName: ""
  };
}

async function getMovieDetails(movieId: number, accessToken: string) {
  const detailsUrl = new URL(`${TMDB_API_URL}/movie/${movieId}`);
  detailsUrl.searchParams.set("language", "es-ES");

  try {
    return await tmdbFetch<TmdbMovieDetails>(detailsUrl, accessToken);
  } catch {
    return null;
  }
}

async function tmdbFetch<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("TMDB no ha respondido correctamente.");
  }

  return response.json() as Promise<T>;
}
