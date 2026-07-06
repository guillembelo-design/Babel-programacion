"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Film, Loader2, Plus, Search } from "lucide-react";
import { Movie } from "@/lib/schedule/types";
import { MovieDraftFields, MovieEditFields } from "./movie-fields";
import { getFilmAffinitySearchUrl, normalizeSearchText } from "./movie-utils";
import { MovieDraft, MovieSearchResult, MovieSearchState } from "./types";

type MoviePanelProps = {
  editingMovieId: string | null;
  importDraft: MovieDraft | null;
  importSourceUrl: string;
  movieEditDraft: MovieDraft;
  movieForm: MovieDraft;
  movieSearchError: string;
  movieSearchQuery: string;
  movieSearchResults: MovieSearchResult[];
  movieSearchState: MovieSearchState;
  movieUsageCounts: Map<string, number>;
  movies: Movie[];
  onCancelEditMovie: () => void;
  onCreateImportedMovie: () => void;
  onCreateMovie: () => void;
  onImportDraftChange: (draft: MovieDraft | null) => void;
  onImportSourceUrlChange: (sourceUrl: string) => void;
  onMovieEditDraftChange: (draft: MovieDraft) => void;
  onMovieFormChange: (draft: MovieDraft) => void;
  onMovieSearchQueryChange: (query: string) => void;
  onRemoveMovie: (movie: Movie) => void;
  onSearchMovies: () => void;
  onStartEditMovie: (movie: Movie) => void;
  onStartImportMovie: (result: MovieSearchResult) => void;
  onUpdateMovie: (movie: Movie, draft: MovieDraft) => void;
};

export function MoviePanel({
  editingMovieId,
  importDraft,
  importSourceUrl,
  movieEditDraft,
  movieForm,
  movieSearchError,
  movieSearchQuery,
  movieSearchResults,
  movieSearchState,
  movieUsageCounts,
  movies,
  onCancelEditMovie,
  onCreateImportedMovie,
  onCreateMovie,
  onImportDraftChange,
  onImportSourceUrlChange,
  onMovieEditDraftChange,
  onMovieFormChange,
  onMovieSearchQueryChange,
  onRemoveMovie,
  onSearchMovies,
  onStartEditMovie,
  onStartImportMovie,
  onUpdateMovie
}: MoviePanelProps) {
  const [catalogQuery, setCatalogQuery] = useState("");
  const filmAffinityQuery = movieSearchQuery.trim() || movieForm.title.trim();
  const normalizedCatalogQuery = normalizeSearchText(catalogQuery);
  const filteredMovies = useMemo(
    () =>
      movies.filter((movie) => {
        if (!normalizedCatalogQuery) return true;

        const searchableText = normalizeSearchText(`${movie.title} ${movie.director}`);

        return searchableText.includes(normalizedCatalogQuery);
      }),
    [movies, normalizedCatalogQuery]
  );

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <section className="rounded-md border border-babel-line bg-babel-panel p-4">
          <div className="mb-4 flex items-center gap-2">
            <Film size={18} className="text-babel-red" />
            <h2 className="font-medium">Películas</h2>
          </div>

          <div className="space-y-3 border-b border-babel-line pb-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Buscar duración
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={movieSearchQuery}
                  onChange={(event) => onMovieSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onSearchMovies();
                    }
                  }}
                  placeholder="Título de película"
                  className="h-10 min-w-[220px] flex-1 rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
                />
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-babel-red px-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={onSearchMovies}
                  disabled={movieSearchState === "searching"}
                  title="Buscar pelicula"
                >
                  {movieSearchState === "searching" ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Search size={16} />
                  )}
                  Buscar
                </button>
                {filmAffinityQuery ? (
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-babel-line bg-babel-card px-3 text-sm text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                    href={getFilmAffinitySearchUrl(filmAffinityQuery)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={15} />
                    Buscar en FilmAffinity
                  </a>
                ) : (
                  <span className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-babel-line bg-babel-card px-3 text-sm text-zinc-600">
                    <ExternalLink size={15} />
                    Buscar en FilmAffinity
                  </span>
                )}
              </div>
              {movieSearchState === "error" ? (
                <p className="mt-2 text-xs text-red-300">{movieSearchError}</p>
              ) : null}
            </div>

            {movieSearchResults.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {movieSearchResults.map((result) => (
                  <button
                    key={result.sourceId}
                    className="rounded-md border border-babel-line bg-babel-card p-2 text-left transition hover:border-zinc-500"
                    onClick={() => onStartImportMovie(result)}
                  >
                    <span className="block truncate text-sm font-medium text-white">
                      {result.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      {result.year ?? "Año no disponible"} ·{" "}
                      {result.durationMinutes
                        ? `${result.durationMinutes} min`
                        : "Duración pendiente"}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">Wikidata</span>
                  </button>
                ))}
              </div>
            ) : null}

            {importDraft ? (
              <div className="rounded-md border border-babel-red/50 bg-red-950/20 p-3">
                <p className="mb-3 text-sm font-medium text-white">¿Es esta la película?</p>
                <MovieDraftFields
                  draft={importDraft}
                  sourceUrl={importSourceUrl}
                  onChange={onImportDraftChange}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-babel-red px-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onCreateImportedMovie}
                    disabled={!importDraft.title.trim() || Number(importDraft.durationMinutes) <= 0}
                  >
                    <Check size={15} />
                    Importar
                  </button>
                  <button
                    className="h-9 rounded-md border border-babel-line px-3 text-sm text-zinc-300 transition hover:bg-babel-card hover:text-white"
                    onClick={() => {
                      onImportDraftChange(null);
                      onImportSourceUrlChange("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              Crear manualmente
            </p>
            <input
              value={movieForm.title}
              onChange={(event) => onMovieFormChange({ ...movieForm, title: event.target.value })}
              placeholder="Título"
              className="h-10 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
            />
            <input
              type="number"
              min="1"
              value={movieForm.durationMinutes}
              onChange={(event) =>
                onMovieFormChange({
                  ...movieForm,
                  durationMinutes: Number(event.target.value)
                })
              }
              className="h-10 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition focus:border-babel-red"
            />
            <input
              value={movieForm.director}
              onChange={(event) =>
                onMovieFormChange({
                  ...movieForm,
                  director: event.target.value
                })
              }
              placeholder="Director/a"
              className="h-10 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
            />
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-babel-red px-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onCreateMovie}
              disabled={!movieForm.title.trim()}
            >
              <Plus size={16} />
              Añadir película
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-md border border-babel-line bg-babel-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Catálogo de películas</h2>
          <input
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Buscar en catálogo"
            className="h-9 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red sm:w-56"
          />
        </div>
        <div className="space-y-2">
          {filteredMovies.length ? (
            filteredMovies.map((movie) => {
              const usageCount = movieUsageCounts.get(movie.id) ?? 0;
              const canDelete = usageCount === 0;
              const isRetired = Boolean(movie.retiredAt);
              const director = movie.director.trim();
              const isEditingMovie = editingMovieId === movie.id;
              const buttonLabel = canDelete
                ? "Borrar"
                : isRetired
                  ? "Retirada"
                  : "Retirar película";

              return (
                <div key={movie.id} className="rounded-md bg-babel-card p-2">
                  {isEditingMovie ? (
                    <div className="space-y-2">
                      <MovieEditFields
                        draft={movieEditDraft}
                        onChange={onMovieEditDraftChange}
                      />
                      <div className="flex gap-2">
                        <button
                          className="h-8 flex-1 rounded bg-babel-red px-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onUpdateMovie(movie, movieEditDraft)}
                          disabled={
                            !movieEditDraft.title.trim() ||
                            Number(movieEditDraft.durationMinutes) <= 0
                          }
                        >
                          Guardar
                        </button>
                        <button
                          className="h-8 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                          onClick={onCancelEditMovie}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-white">{movie.title}</p>
                      <p className="text-xs text-zinc-400">
                        {movie.durationMinutes} min
                        {usageCount ? ` · ${usageCount} sesiones` : ""}
                      </p>
                      {director ? (
                        <p className="truncate text-xs text-zinc-500">Director/a: {director}</p>
                      ) : null}
                      {isRetired ? (
                        <p className="mt-1 text-xs text-zinc-500">Retirada del selector</p>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          className="h-8 rounded border border-babel-line text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                          onClick={() => onStartEditMovie(movie)}
                        >
                          Editar
                        </button>
                        <button
                          className="h-8 rounded border border-babel-line text-xs text-zinc-300 transition hover:border-red-500 hover:bg-red-950/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onRemoveMovie(movie)}
                          disabled={isRetired && !canDelete}
                        >
                          {buttonLabel}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
              Sin películas
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
