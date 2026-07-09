"use client";

import {
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState
} from "react";
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

const MIN_SCREENING_CARD_HEIGHT = 104;
const MIN_CONFLICT_SCREENING_CARD_HEIGHT = 132;
const SESSION_LABEL_PRESETS = [
  "Cine club",
  "Cine con cineastas",
  "Presentación",
  "Presentación con coloquio",
  "Coloquio con el director",
  "Sesión escolar"
];

type ScreeningCardProps = {
  accentColor: string;
  gapInfo: ScreeningGapInfo | null;
  screening: Screening;
  screenings: Screening[];
  distributors: Distributor[];
  isDragging: boolean;
  isSelected: boolean;
  movies: Movie[];
  timelineLayout: TimelineScreeningLayout | null;
  turnoverMinutes: number;
  onChange: (patch: Partial<Screening>) => Promise<boolean> | boolean | void;
  onCreateMovie: (draft: MovieDraft) => Promise<Movie | null>;
  onDelete: () => void;
  onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onSelect: () => void;
  shouldIgnoreSelectionClick: () => boolean;
};

export function ScreeningCard({
  accentColor,
  gapInfo,
  screening,
  screenings,
  distributors,
  isDragging,
  isSelected,
  movies,
  timelineLayout,
  turnoverMinutes,
  onChange,
  onCreateMovie,
  onDelete,
  onDragPointerDown,
  onSelect,
  shouldIgnoreSelectionClick
}: ScreeningCardProps) {
  const [isEditingMovie, setIsEditingMovie] = useState(!screening.movieId);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(screening.sessionLabel ?? "");
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
  const sessionLabel = screening.sessionLabel?.trim() ?? "";
  const movie = movies.find((item) => item.id === screening.movieId);
  const endTime = getScreeningEndTime(screening, movies);
  const baseCardHeight = timelineLayout?.height ?? 120;
  const cardHeight = Math.max(
    baseCardHeight,
    turnoverConflict || sessionLabel ? MIN_CONFLICT_SCREENING_CARD_HEIGHT : MIN_SCREENING_CARD_HEIGHT
  );
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
    setLabelDraft(screening.sessionLabel ?? "");
  }, [screening.sessionLabel]);

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

    if (shouldIgnoreSelectionClick() || isInteractiveSelectionTarget(event.target)) {
      return;
    }

    onSelect();
  };

  const handleCardPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isInteractiveSelectionTarget(event.target)) {
      return;
    }

    onDragPointerDown(event);
  };

  const commitLabelDraft = async () => {
    const nextLabel = labelDraft.trim();
    const saved = await onChange({ sessionLabel: nextLabel || null });

    if (saved === false) {
      setLabelDraft(screening.sessionLabel ?? "");
      return;
    }

    setIsEditingLabel(false);
  };

  const removeLabel = async () => {
    const saved = await onChange({ sessionLabel: null });

    if (saved === false) {
      setLabelDraft(screening.sessionLabel ?? "");
      return;
    }

    setLabelDraft("");
    setIsEditingLabel(false);
  };

  return (
    <article
      ref={cardRef}
      data-screening-id={screening.id}
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      style={{
        height: cardHeight,
        top: timelineLayout?.top
      }}
      className={clsx(
        "flex flex-col rounded-md border shadow-[0_18px_46px_rgba(0,0,0,0.68)] transition",
        isCompactCard ? "px-1.5 py-1" : "px-2 py-1.5",
        isDragging ? "cursor-grabbing opacity-35" : "cursor-grab",
        isEditingMovie || isEditingLabel ? "z-30 overflow-visible" : "z-10 overflow-hidden",
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={clsx(
              "inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-700 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white",
              sessionLabel && "border-white/30 bg-white/10 text-white",
              isCompactCard ? "h-6 w-6" : "h-7 w-7"
            )}
            onClick={() => {
              setLabelDraft(screening.sessionLabel ?? "");
              setIsEditingLabel((current) => !current);
            }}
            title={sessionLabel ? "Editar etiqueta" : "Añadir etiqueta"}
          >
            +
          </button>
          <button
            className={clsx(
              "inline-flex shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-white",
              isCompactCard ? "h-6 w-6" : "h-7 w-7"
            )}
            onClick={onDelete}
            title="Eliminar sesión"
          >
            <Trash2 size={isCompactCard ? 13 : 14} />
          </button>
        </div>
      </div>

      {isEditingLabel ? (
        <div
          className="absolute left-2 right-2 top-9 z-50 rounded-md border border-zinc-600 bg-[#18181d] p-2 shadow-[0_22px_54px_rgba(0,0,0,0.72)]"
          data-selection-ignore="true"
        >
          <input
            className="h-8 w-full rounded border border-zinc-700 bg-zinc-950/80 px-2 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-400"
            placeholder="Etiqueta de sesión"
            value={labelDraft}
            onChange={(event) => setLabelDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitLabelDraft();
              }

              if (event.key === "Escape") {
                setLabelDraft(screening.sessionLabel ?? "");
                setIsEditingLabel(false);
              }
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {SESSION_LABEL_PRESETS.map((label) => (
              <button
                key={label}
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                onClick={() => setLabelDraft(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              className="text-[11px] text-zinc-500 transition hover:text-white"
              onClick={() => {
                setLabelDraft(screening.sessionLabel ?? "");
                setIsEditingLabel(false);
              }}
            >
              Cancelar
            </button>
            <div className="flex items-center gap-2">
              {sessionLabel ? (
                <button
                  className="text-[11px] text-red-200 transition hover:text-red-100"
                  onClick={() => void removeLabel()}
                >
                  Quitar
                </button>
              ) : null}
              <button
                className="rounded border border-zinc-500 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
                onClick={() => void commitLabelDraft()}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        className={clsx(
          "block w-full shrink-0 rounded px-1 text-center transition hover:bg-zinc-900/70 focus:outline-none focus:ring-1 focus:ring-babel-red",
          isCompactCard ? "mt-0.5 py-0" : "mt-1 py-0.5"
        )}
        onClick={() => setIsEditingMovie((current) => !current)}
        title="Seleccionar película"
      >
        <span
          className={clsx(
            "compact-session-title block font-extrabold uppercase drop-shadow-[0_1px_1px_rgba(0,0,0,0.78)]",
            isCompactCard ? "text-[13px] leading-none" : "text-[15px] leading-tight"
          )}
          style={{ color: accentColor, WebkitLineClamp: isTightCard ? 1 : 2 }}
        >
          {movie?.title ?? "Película"}
        </span>
        <span className="mt-0.5 block text-[10px] leading-none text-zinc-400">
          {movie ? `${movie.durationMinutes} min` : "Selecciona una película"}
        </span>
        {movie?.retiredAt && !isTightCard ? (
          <span className="mt-1 block text-[11px] leading-none text-zinc-500">Retirada</span>
        ) : null}
      </button>

      {sessionLabel ? (
        <button
          className="mx-auto mt-1 max-w-full shrink-0 truncate rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-zinc-100 transition hover:border-white/30 hover:bg-white/15"
          onClick={() => {
            setLabelDraft(screening.sessionLabel ?? "");
            setIsEditingLabel(true);
          }}
          title="Editar etiqueta"
        >
          {sessionLabel}
        </button>
      ) : null}

      {timeError || status === "invalid" ? (
        <p className="mt-0.5 shrink-0 text-center text-[10px] leading-none text-red-300">
          {timeError || "Usa HH:mm"}
        </p>
      ) : null}

      {turnoverConflict && !isTightCard ? (
        <p className="mt-0.5 shrink-0 text-center text-[10px] leading-tight text-red-200">
          {turnoverConflict.actualGapMinutes < 0
            ? `Solapa ${Math.abs(turnoverConflict.actualGapMinutes)} min. Anterior termina a las ${turnoverConflict.previousEndsAt}.`
            : `Menos de ${turnoverConflict.turnoverMinutes} min. Mínimo ${turnoverConflict.minimumStartAt}. Margen real ${turnoverConflict.actualGapMinutes} min.`}
        </p>
      ) : null}

      <div className="mt-auto flex shrink-0 flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-center text-[10px] leading-tight">
        {endTime ? <span className="text-zinc-400">Fin {endTime}</span> : null}
        {gapInfo ? (
          <span
            className={clsx(
              gapInfo.kind === "gap" && "text-zinc-500",
              gapInfo.kind === "tight" && "text-yellow-200",
              gapInfo.kind === "overlap" && "text-red-200"
            )}
          >
            {endTime ? "· " : ""}
            {gapInfo.label}
          </span>
        ) : null}
        {status === "invalid" ? <span className="text-red-300">Hora inválida</span> : null}
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
