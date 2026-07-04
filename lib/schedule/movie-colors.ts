import { Movie, Screening } from "./types";

export const FALLBACK_MOVIE_ACCENT_COLOR = "#71717a";

const MOVIE_ACCENT_COLORS = [
  "#ff6b6b",
  "#4dabf7",
  "#69db7c",
  "#da77f2",
  "#ffd43b",
  "#3bc9db",
  "#f06595",
  "#a9e34b",
  "#ffa94d",
  "#748ffc",
  "#38d9a9",
  "#e599f7",
  "#74c0fc",
  "#ff8787",
  "#63e6be",
  "#fcc419",
  "#91a7ff",
  "#ff922b",
  "#66d9e8",
  "#faa2c1",
  "#8ce99a",
  "#b197fc",
  "#d8f5a2",
  "#f783ac"
] as const;

export function createMovieAccentColorMap({
  movies,
  screenings,
  weekStart
}: {
  movies: Movie[];
  screenings: Screening[];
  weekStart: string;
}) {
  const moviesById = new Map(movies.map((movie) => [movie.id, movie]));
  const weeklyMovieIds = Array.from(
    new Set(
      screenings
        .filter((screening) => screening.weekStart === weekStart && screening.movieId)
        .map((screening) => screening.movieId as string)
    )
  );

  const sortedMovieIds = weeklyMovieIds.sort((movieIdA, movieIdB) => {
    const movieA = moviesById.get(movieIdA);
    const movieB = moviesById.get(movieIdB);
    const hashDiff = stableHash(movieA?.id ?? movieIdA) - stableHash(movieB?.id ?? movieIdB);

    if (hashDiff !== 0) {
      return hashDiff;
    }

    return (movieA?.title ?? movieIdA).localeCompare(movieB?.title ?? movieIdB);
  });

  return new Map(
    sortedMovieIds.map((movieId, index) => [
      movieId,
      MOVIE_ACCENT_COLORS[index % MOVIE_ACCENT_COLORS.length]
    ])
  );
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
