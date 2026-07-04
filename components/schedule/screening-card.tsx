"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { clsx } from "clsx";
import {
  getScreeningEndTime,
  getScreeningStatus,
  getTurnoverConflictForScreening
} from "@/lib/schedule/conflicts";
import { Distributor, Movie, Screening } from "@/lib/schedule/types";
import { MoviePicker } from "@/components/movies/movie-picker";
import { MovieDraft } from "@/components/movies/types";

type ScreeningCardProps = {
  screening: Screening;
  screenings: Screening[];
  distributors: Distributor[];
  movies: Movie[];
  turnoverMinutes: number;
  onChange: (patch: Partial<Screening>) => void;
  onCreateMovie: (draft: MovieDraft) => Promise<Movie | null>;
  onDelete: () => void;
};

export function ScreeningCard({
  screening,
  screenings,
  distributors,
  movies,
  turnoverMinutes,
  onChange,
  onCreateMovie,
  onDelete
}: ScreeningCardProps) {
  const [isEditingMovie, setIsEditingMovie] = useState(!screening.movieId);
  const status = getScreeningStatus(screening, screenings, movies, turnoverMinutes);
  const turnoverConflict = getTurnoverConflictForScreening(
    screening,
    screenings,
    movies,
    turnoverMinutes
  );
  const movie = movies.find((item) => item.id === screening.movieId);
  const endTime = getScreeningEndTime(screening, movies);

  useEffect(() => {
    if (!screening.movieId) {
      setIsEditingMovie(true);
    }
  }, [screening.movieId]);

  return (
    <article
      className={clsx(
        "rounded-md border px-2 py-2 transition",
        (status === "conflict" || status === "invalid") && "border-red-500/70 bg-red-950/30",
        status === "valid" && "border-green-500/60 bg-green-950/20",
        status === "empty" && "border-zinc-700 bg-babel-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="HH:mm"
          value={screening.startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value })}
          className={clsx(
            "h-8 w-[68px] rounded-md border bg-zinc-950/40 px-1 text-center text-lg font-semibold tabular-nums text-white outline-none transition",
            status === "invalid"
              ? "border-red-500 focus:border-red-400"
              : "border-babel-line focus:border-babel-red"
          )}
        />
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
          onClick={onDelete}
          title="Eliminar sesion"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-1 min-h-[40px] text-center">
        <p className="compact-session-title text-sm font-semibold uppercase leading-tight text-white">
          {movie?.title ?? "Sin pelicula"}
        </p>
        <p className="mt-0.5 text-[11px] leading-none text-zinc-400">
          {movie ? `${movie.durationMinutes} min` : "Selecciona una pelicula"}
        </p>
        {movie?.retiredAt ? (
          <p className="mt-1 text-[11px] leading-none text-zinc-500">Retirada</p>
        ) : null}
      </div>

      {status === "invalid" ? (
        <p className="mt-1 text-center text-[11px] leading-none text-red-300">Usa HH:mm</p>
      ) : null}

      {turnoverConflict ? (
        <p className="mt-1 text-center text-[11px] leading-tight text-red-200">
          Posible solape: anterior termina a las {turnoverConflict.previousEndsAt}. Minimo{" "}
          {turnoverConflict.minimumStartAt}. Margen real {turnoverConflict.actualGapMinutes} min.
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span
          className={clsx(
            (status === "conflict" || status === "invalid") && "text-red-300",
            status === "valid" && "text-green-300",
            status === "empty" && "text-zinc-400"
          )}
        >
          {status === "conflict"
            ? "Conflicto"
            : status === "invalid"
              ? "Hora"
              : status === "valid"
                ? "Correcta"
                : "Pendiente"}
        </span>
        <span className="truncate text-zinc-500">{endTime ? `Fin ${endTime}` : ""}</span>
        <button
          className="rounded border border-babel-line px-1.5 py-0.5 text-zinc-400 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
          onClick={() => setIsEditingMovie((current) => !current)}
        >
          {isEditingMovie ? "Cerrar" : "Cambiar"}
        </button>
      </div>

      {isEditingMovie ? (
        <div className="mt-2 border-t border-babel-line pt-2">
          <MoviePicker
            distributors={distributors}
            movies={movies}
            selectedMovieId={screening.movieId}
            onCreateMovie={onCreateMovie}
            onSelect={(movieId) => {
              onChange({ movieId });
              if (movieId) {
                setIsEditingMovie(false);
              }
            }}
          />
        </div>
      ) : null}
    </article>
  );
}
