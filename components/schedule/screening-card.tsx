"use client";

import { KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { clsx } from "clsx";
import {
  getScreeningEndTime,
  getScreeningStatus,
  getTurnoverConflictForScreening,
  isValidScreeningTime
} from "@/lib/schedule/conflicts";
import { Distributor, Movie, Screening } from "@/lib/schedule/types";
import { ScreeningGapInfo, TimelineScreeningLayout } from "@/lib/schedule/timeline";
import { MoviePicker } from "@/components/movies/movie-picker";
import { MovieDraft } from "@/components/movies/types";

type ScreeningCardProps = {
  accentColor: string;
  gapInfo: ScreeningGapInfo | null;
  screening: Screening;
  screenings: Screening[];
  distributors: Distributor[];
  isSelected: boolean;
  movies: Movie[];
  timelineLayout: TimelineScreeningLayout | null;
  turnoverMinutes: number;
  onChange: (patch: Partial<Screening>) => Promise<boolean> | boolean | void;
  onCreateMovie: (draft: MovieDraft) => Promise<Movie | null>;
  onDelete: () => void;
  onSelect: () => void;
};

export function ScreeningCard({
  accentColor,
  gapInfo,
  screening,
  screenings,
  distributors,
  isSelected,
  movies,
  timelineLayout,
  turnoverMinutes,
  onChange,
  onCreateMovie,
  onDelete,
  onSelect
}: ScreeningCardProps) {
  const [isEditingMovie, setIsEditingMovie] = useState(!screening.movieId);
  const [timeDraft, setTimeDraft] = useState(screening.startsAt);
  const [timeError, setTimeError] = useState("");
  const cardRef = useRef<HTMLElement>(null);
  const isCommittingTimeRef = useRef(false);
  const skipNextBlurRef = useRef(false);
  const status = getScreeningStatus(screening, screenings, movies, turnoverMinutes);
  const turnoverConflict = getTurnoverConflictForScreening(
    screening,
    screenings,
    movies,
    turnoverMinutes
  );
  const movie = movies.find((item) => item.id === screening.movieId);
  const endTime = getScreeningEndTime(screening, movies);
  const cardHeight = timelineLayout?.height ?? 120;
  const isCompactCard = cardHeight < 112;
  const isTightCard = cardHeight < 88;

  useEffect(() => {
    if (!screening.movieId) {
      setIsEditingMovie(true);
    }
  }, [screening.movieId]);

  useEffect(() => {
    setTimeDraft(screening.startsAt);
    setTimeError("");
  }, [screening.startsAt]);

  useEffect(() => {
    if (!isEditingMovie) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target &&
        typeof target === "object" &&
        "nodeType" in target &&
        cardRef.current?.contains(target as Node)
      ) {
        return;
      }

      setIsEditingMovie(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isEditingMovie]);

  const commitTimeDraft = async () => {
    const nextTime = timeDraft.trim();

    if (isCommittingTimeRef.current) return;

    if (nextTime === screening.startsAt) {
      setTimeError("");
      return;
    }

    if (!isValidScreeningTime(nextTime)) {
      setTimeError("Usa HH:mm");
      return;
    }

    isCommittingTimeRef.current = true;
    setTimeError("");

    try {
      const saved = await onChange({ startsAt: nextTime });

      if (saved === false) {
        setTimeDraft(screening.startsAt);
      }
    } finally {
      isCommittingTimeRef.current = false;
    }
  };

  const handleTimeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTimeDraft();
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      skipNextBlurRef.current = true;
      setTimeDraft(screening.startsAt);
      setTimeError("");
      event.currentTarget.blur();
    }
  };

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();

    if (isInteractiveSelectionTarget(event.target)) {
      return;
    }

    onSelect();
  };

  return (
    <article
      ref={cardRef}
      onClick={handleCardClick}
      style={{
        height: timelineLayout?.height,
        top: timelineLayout?.top
      }}
      className={clsx(
        "flex flex-col rounded-md border shadow-[0_18px_46px_rgba(0,0,0,0.68)] transition",
        isCompactCard ? "px-1.5 py-1" : "px-2 py-1.5",
        isEditingMovie ? "z-30 overflow-visible" : "z-10 overflow-hidden",
        timelineLayout ? "absolute left-12 right-2" : "relative m-2",
        isSelected ? "ring-2 ring-white/70" : "ring-1 ring-white/10",
        (status === "conflict" || status === "invalid") && "border-red-400/90 bg-[#4a171d]",
        status === "valid" && "border-zinc-500/90 bg-[#363640]",
        status === "empty" && "border-zinc-600/90 bg-[#303039]"
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="HH:mm"
          value={timeDraft}
          onBlur={() => {
            if (skipNextBlurRef.current) {
              skipNextBlurRef.current = false;
              return;
            }

            void commitTimeDraft();
          }}
          onChange={(event) => {
            setTimeDraft(event.target.value);
            setTimeError("");
          }}
          onKeyDown={handleTimeKeyDown}
          className={clsx(
            "rounded-md border bg-zinc-950/40 px-1 text-center font-semibold tabular-nums text-white outline-none transition",
            isCompactCard ? "h-6 w-[56px] text-sm" : "h-7 w-[62px] text-base",
            timeError || status === "invalid"
              ? "border-red-500 focus:border-red-400"
              : "border-babel-line focus:border-babel-red"
          )}
        />
        <button
          className={clsx(
            "inline-flex shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-white",
            isCompactCard ? "h-6 w-6" : "h-7 w-7"
          )}
          onClick={onDelete}
          title="Eliminar sesion"
        >
          <Trash2 size={isCompactCard ? 13 : 14} />
        </button>
      </div>

      <button
        className={clsx(
          "block w-full shrink-0 rounded px-1 text-center transition hover:bg-zinc-900/70 focus:outline-none focus:ring-1 focus:ring-babel-red",
          isCompactCard ? "mt-0.5 py-0" : "mt-1 py-0.5"
        )}
        onClick={() => setIsEditingMovie((current) => !current)}
        title="Seleccionar pelicula"
      >
        <span
          className={clsx(
            "compact-session-title block font-extrabold uppercase drop-shadow-[0_1px_1px_rgba(0,0,0,0.78)]",
            isCompactCard ? "text-[13px] leading-none" : "text-[15px] leading-tight"
          )}
          style={{ color: accentColor, WebkitLineClamp: isTightCard ? 1 : 2 }}
        >
          {movie?.title ?? "Pelicula"}
        </span>
        <span className="mt-0.5 block text-[10px] leading-none text-zinc-400">
          {movie ? `${movie.durationMinutes} min` : "Selecciona una pelicula"}
        </span>
        {movie?.retiredAt && !isTightCard ? (
          <span className="mt-1 block text-[11px] leading-none text-zinc-500">Retirada</span>
        ) : null}
      </button>

      {timeError || status === "invalid" ? (
        <p className="mt-0.5 shrink-0 text-center text-[10px] leading-none text-red-300">
          {timeError || "Usa HH:mm"}
        </p>
      ) : null}

      {turnoverConflict && !isTightCard ? (
        <p className="mt-0.5 shrink-0 text-center text-[10px] leading-tight text-red-200">
          Menos de {turnoverConflict.turnoverMinutes} min. Minimo{" "}
          {turnoverConflict.minimumStartAt}. Margen real {turnoverConflict.actualGapMinutes} min.
        </p>
      ) : null}

      <div className="mt-auto flex shrink-0 items-center justify-center gap-1 text-[10px] leading-none">
        {endTime ? <span className="truncate text-zinc-400">Fin {endTime}</span> : null}
        {gapInfo ? (
          <span
            className={clsx(
              "truncate",
              gapInfo.kind === "gap" && "text-zinc-500",
              gapInfo.kind === "tight" && "text-yellow-200",
              gapInfo.kind === "overlap" && "text-red-200"
            )}
          >
            {endTime ? "· " : ""}
            {gapInfo.label}
          </span>
        ) : null}
        {status === "invalid" ? <span className="text-red-300">Hora invalida</span> : null}
      </div>

      {isEditingMovie ? (
        <div className="mt-2 flex shrink-0 items-center justify-end border-t border-zinc-700 pt-2">
          <button
            className="rounded border border-zinc-600 bg-[#202027] px-1.5 py-0.5 text-[11px] text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
            onClick={() => setIsEditingMovie(false)}
          >
            Cerrar selector
          </button>
        </div>
      ) : null}

      {isEditingMovie ? (
        <div
          className="mt-2 max-h-64 shrink-0 overflow-y-auto border-t border-zinc-700 pt-2"
          data-selection-ignore="true"
        >
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

function isInteractiveSelectionTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.isContentEditable ||
      target.closest("input, textarea, select, button, [data-selection-ignore='true']")
  );
}
