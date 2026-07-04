"use client";

import { clsx } from "clsx";
import { Distributor } from "@/lib/schedule/types";
import { MovieDraft } from "./types";
import { getDistributorSuggestions, getFilmAffinitySearchUrl } from "./movie-utils";

type MovieDraftFieldsProps = {
  draft: MovieDraft;
  distributors: Distributor[];
  sourceUrl: string;
  onChange: (draft: MovieDraft) => void;
};

export function MovieDraftFields({
  draft,
  distributors,
  sourceUrl,
  onChange
}: MovieDraftFieldsProps) {
  const updateDraft = (patch: Partial<MovieDraft>) => {
    onChange({ ...draft, ...patch });
  };

  return (
    <div className="space-y-2">
      <input
        value={draft.title}
        onChange={(event) => updateDraft({ title: event.target.value })}
        placeholder="Titulo"
        className="h-9 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
      />
      <input
        type="number"
        min="1"
        value={draft.durationMinutes}
        onChange={(event) => updateDraft({ durationMinutes: Number(event.target.value) })}
        className="h-9 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition focus:border-babel-red"
      />
      <DistributorInput
        distributors={distributors}
        value={draft.distributorName}
        selectedDistributorId={draft.distributorId}
        onChange={(distributorName) =>
          updateDraft({
            distributorName,
            distributorId: null
          })
        }
        onSelect={(distributor) =>
          updateDraft({
            distributorName: distributor.name,
            distributorId: distributor.id
          })
        }
      />
      <div className="flex flex-wrap gap-2 text-xs">
        {sourceUrl ? (
          <a
            className="text-zinc-400 transition hover:text-white"
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            Ver en Wikidata
          </a>
        ) : null}
        <a
          className="text-zinc-400 transition hover:text-white"
          href={getFilmAffinitySearchUrl(draft.title)}
          rel="noreferrer"
          target="_blank"
        >
          Comprobar en FilmAffinity
        </a>
      </div>
    </div>
  );
}

type MovieEditFieldsProps = {
  draft: MovieDraft;
  distributors: Distributor[];
  onChange: (draft: MovieDraft) => void;
};

export function MovieEditFields({ draft, distributors, onChange }: MovieEditFieldsProps) {
  const updateDraft = (patch: Partial<MovieDraft>) => {
    onChange({ ...draft, ...patch });
  };

  return (
    <div className="space-y-2">
      <input
        value={draft.title}
        onChange={(event) => updateDraft({ title: event.target.value })}
        placeholder="Titulo"
        className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
      />
      <input
        type="number"
        min="1"
        value={draft.durationMinutes}
        onChange={(event) => updateDraft({ durationMinutes: Number(event.target.value) })}
        className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-sm text-white outline-none transition focus:border-babel-red"
      />
      <DistributorInput
        compact
        distributors={distributors}
        value={draft.distributorName}
        selectedDistributorId={draft.distributorId}
        onChange={(distributorName) =>
          updateDraft({
            distributorName,
            distributorId: null
          })
        }
        onSelect={(distributor) =>
          updateDraft({
            distributorName: distributor.name,
            distributorId: distributor.id
          })
        }
      />
    </div>
  );
}

type DistributorInputProps = {
  value: string;
  selectedDistributorId: string | null;
  distributors: Distributor[];
  onChange: (value: string) => void;
  onSelect: (distributor: Distributor) => void;
  compact?: boolean;
};

export function DistributorInput({
  value,
  selectedDistributorId,
  distributors,
  onChange,
  onSelect,
  compact = false
}: DistributorInputProps) {
  const selectedDistributor = distributors.find(
    (distributor) => distributor.id === selectedDistributorId
  );
  const suggestions = getDistributorSuggestions(distributors, value).filter(
    (distributor) => distributor.id !== selectedDistributorId
  );

  return (
    <div className="space-y-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Distribuidora"
        className={clsx(
          "w-full rounded border border-babel-line bg-babel-card text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red",
          compact ? "h-8 px-2 text-xs" : "h-10 px-3 text-sm"
        )}
      />

      {selectedDistributor ? (
        <div className="flex items-center justify-between rounded bg-zinc-950/30 px-2 py-1 text-[11px] text-zinc-400">
          <span className="truncate">{selectedDistributor.name}</span>
          <button className="text-zinc-500 transition hover:text-white" onClick={() => onChange("")}>
            Quitar
          </button>
        </div>
      ) : null}

      {suggestions.length ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">
            Coincidencias
          </p>
          {suggestions.map((distributor) => (
            <button
              key={distributor.id}
              className="w-full rounded border border-babel-line bg-zinc-950/30 px-2 py-1 text-left text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              onClick={() => onSelect(distributor)}
            >
              {distributor.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
