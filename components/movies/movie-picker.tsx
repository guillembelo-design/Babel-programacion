"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { clsx } from "clsx";
import { Distributor, Movie } from "@/lib/schedule/types";
import { DistributorInput } from "./movie-fields";
import { emptyMovieForm, MovieDraft } from "./types";

type MoviePickerProps = {
  selectedMovieId: string | null;
  distributors: Distributor[];
  movies: Movie[];
  onSelect: (movieId: string | null) => void;
  onCreateMovie: (draft: MovieDraft) => Promise<Movie | null>;
};

export function MoviePicker({
  selectedMovieId,
  distributors,
  movies,
  onSelect,
  onCreateMovie
}: MoviePickerProps) {
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<MovieDraft>(emptyMovieForm);

  const selectedMovie = movies.find((movie) => movie.id === selectedMovieId);
  const selectableMovies = movies.filter((movie) => !movie.retiredAt);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMovies = selectableMovies
    .filter((movie) => movie.title.toLowerCase().includes(normalizedQuery))
    .slice(0, 6);

  const startCreating = () => {
    setDraft((current) => ({
      ...current,
      title: query.trim() || current.title
    }));
    setIsCreating(true);
  };

  const createMovie = async () => {
    const movie = await onCreateMovie(draft);
    if (!movie) return;

    onSelect(movie.id);
    setQuery("");
    setDraft(emptyMovieForm);
    setIsCreating(false);
  };

  return (
    <div className="space-y-1.5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar pelicula"
        className="h-8 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
      />

      <div className="max-h-28 space-y-1 overflow-y-auto">
        {filteredMovies.length ? (
          filteredMovies.map((movie) => (
            <button
              key={movie.id}
              className={clsx(
                "w-full rounded border px-2 py-1.5 text-left text-xs transition",
                selectedMovieId === movie.id
                  ? "border-babel-red bg-red-950/30 text-white"
                  : "border-babel-line bg-zinc-950/30 text-zinc-300 hover:border-zinc-500 hover:text-white"
              )}
              onClick={() => {
                onSelect(movie.id);
                setQuery("");
              }}
            >
              <span className="block truncate font-medium">{movie.title}</span>
              <span className="text-zinc-500">{movie.durationMinutes} min</span>
            </button>
          ))
        ) : (
          <div className="rounded border border-dashed border-zinc-700 px-2 py-2 text-center text-xs text-zinc-500">
            {selectableMovies.length ? "Sin resultados" : "Sin peliculas activas"}
          </div>
        )}
      </div>

      {selectedMovie ? (
        <div className="flex items-center justify-between rounded bg-zinc-950/30 px-2 py-1 text-[11px] text-zinc-400">
          <span className="truncate">{selectedMovie.title}</span>
          <button className="text-zinc-500 transition hover:text-white" onClick={() => onSelect(null)}>
            Quitar
          </button>
        </div>
      ) : null}

      {isCreating ? (
        <div className="space-y-1.5 rounded-md border border-babel-line bg-zinc-950/30 p-2">
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Titulo"
            className="h-8 w-full rounded border border-babel-line bg-babel-card px-2 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
          />
          <input
            type="number"
            min="1"
            value={draft.durationMinutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                durationMinutes: Number(event.target.value)
              }))
            }
            className="h-8 w-full rounded border border-babel-line bg-babel-card px-2 text-xs text-white outline-none transition focus:border-babel-red"
          />
          <DistributorInput
            compact
            distributors={distributors}
            value={draft.distributorName}
            selectedDistributorId={draft.distributorId}
            onChange={(distributorName) =>
              setDraft((current) => ({
                ...current,
                distributorName,
                distributorId: null
              }))
            }
            onSelect={(distributor) =>
              setDraft((current) => ({
                ...current,
                distributorName: distributor.name,
                distributorId: distributor.id
              }))
            }
          />
          <div className="flex gap-1.5">
            <button
              className="h-8 flex-1 rounded bg-babel-red px-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={createMovie}
              disabled={!draft.title.trim() || Number(draft.durationMinutes) <= 0}
            >
              Crear
            </button>
            <button
              className="h-8 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-babel-card hover:text-white"
              onClick={() => setIsCreating(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded border border-babel-line text-xs text-zinc-300 transition hover:bg-babel-card hover:text-white"
          onClick={startCreating}
        >
          <Plus size={13} />
          Crear pelicula
        </button>
      )}
    </div>
  );
}
