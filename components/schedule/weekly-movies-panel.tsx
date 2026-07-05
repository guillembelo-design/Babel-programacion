"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { getWeekLabel } from "@/lib/schedule/dates";
import { Movie, Screening } from "@/lib/schedule/types";
import { normalizeSearchText } from "@/components/movies/movie-utils";

type WeeklyMoviesPanelProps = {
  isSaving: boolean;
  movies: Movie[];
  screenings: Screening[];
  weekStart: string;
  weeklyMovieIds: string[];
  onAddMovie: (movieId: string) => void;
  onClose: () => void;
  onRemoveMovie: (movieId: string) => void;
};

export function WeeklyMoviesPanel({
  isSaving,
  movies,
  screenings,
  weekStart,
  weeklyMovieIds,
  onAddMovie,
  onClose,
  onRemoveMovie
}: WeeklyMoviesPanelProps) {
  const [query, setQuery] = useState("");
  const moviesById = useMemo(() => new Map(movies.map((movie) => [movie.id, movie])), [movies]);
  const weeklyMovieIdSet = useMemo(() => new Set(weeklyMovieIds), [weeklyMovieIds]);
  const normalizedQuery = normalizeSearchText(query);
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();

    screenings.forEach((screening) => {
      if (!screening.movieId) return;
      counts.set(screening.movieId, (counts.get(screening.movieId) ?? 0) + 1);
    });

    return counts;
  }, [screenings]);
  const weeklyMovies = weeklyMovieIds
    .map((movieId) => moviesById.get(movieId))
    .filter((movie): movie is Movie => Boolean(movie));
  const programmedOutsideList = Array.from(sessionCounts.keys())
    .filter((movieId) => !weeklyMovieIdSet.has(movieId))
    .map((movieId) => moviesById.get(movieId))
    .filter((movie): movie is Movie => Boolean(movie))
    .sort((a, b) => a.title.localeCompare(b.title));
  const addableMovies = movies
    .filter((movie) => !movie.retiredAt && !weeklyMovieIdSet.has(movie.id))
    .filter((movie) => normalizeSearchText(movie.title).includes(normalizedQuery))
    .slice(0, 8);

  const addMovie = (movieId: string) => {
    onAddMovie(movieId);
    setQuery("");
  };

  return (
    <aside className="rounded-md border border-babel-line bg-babel-panel p-3 shadow-[0_18px_44px_rgba(0,0,0,0.26)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Películas de la semana</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{getWeekLabel(weekStart)}</p>
        </div>
        <button
          className="inline-flex h-7 items-center rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white"
          onClick={onClose}
        >
          Ocultar
        </button>
      </div>

      <div className="space-y-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Añadir película"
          className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/50 px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
        />

        {query.trim() ? (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-babel-line bg-zinc-950/35 p-1">
            {addableMovies.length ? (
              addableMovies.map((movie) => (
                <button
                  key={movie.id}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-babel-card hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => addMovie(movie.id)}
                  disabled={isSaving}
                >
                  <span className="truncate font-medium">{movie.title}</span>
                  <span className="shrink-0 text-zinc-500">{movie.durationMinutes} min</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-2 text-center text-xs text-zinc-500">Sin resultados</p>
            )}
          </div>
        ) : null}

        <div className="space-y-1.5">
          {weeklyMovies.length ? (
            weeklyMovies.map((movie) => (
              <WeeklyMovieRow
                key={movie.id}
                count={sessionCounts.get(movie.id) ?? 0}
                disabled={isSaving}
                movie={movie}
                onRemove={() => onRemoveMovie(movie.id)}
              />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
              Añade películas para preparar esta semana.
            </div>
          )}
        </div>

        {programmedOutsideList.length ? (
          <div className="border-t border-babel-line pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-200/80">
              Programadas fuera del listado
            </p>
            <div className="space-y-1.5">
              {programmedOutsideList.map((movie) => (
                <div
                  key={movie.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-100">{movie.title}</p>
                    <p className="text-[11px] text-zinc-500">{movie.durationMinutes} min</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SessionCount count={sessionCounts.get(movie.id) ?? 0} />
                    <button
                      className="inline-flex h-7 items-center gap-1 rounded border border-babel-line px-2 text-[11px] text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => addMovie(movie.id)}
                      disabled={isSaving}
                    >
                      <Plus size={12} />
                      Añadir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function WeeklyMovieRow({
  count,
  disabled,
  movie,
  onRemove
}: {
  count: number;
  disabled: boolean;
  movie: Movie;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-babel-line bg-babel-card/70 px-2.5 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-white">{movie.title}</p>
        <p className="text-[11px] text-zinc-500">{movie.durationMinutes} min</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SessionCount count={count} />
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-babel-line text-zinc-400 transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onRemove}
          disabled={disabled}
          title="Quitar de la semana"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function SessionCount({ count }: { count: number }) {
  return (
    <span
      className={clsx(
        "inline-flex h-7 min-w-7 items-center justify-center rounded border px-2 text-xs font-semibold tabular-nums",
        count
          ? "border-green-400/25 bg-green-400/10 text-green-200"
          : "border-zinc-700 bg-zinc-950/30 text-zinc-500"
      )}
    >
      {count}
    </span>
  );
}
