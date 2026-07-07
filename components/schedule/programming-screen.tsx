"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Film,
  Loader2,
  LogOut,
  Plus,
  Printer,
  Undo2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  compareScreeningStartTimes,
  getScreeningStatus,
  getTurnoverConflicts,
  isValidScreeningTime
} from "@/lib/schedule/conflicts";
import {
  getDayDateLabel,
  getFridayWeekStart,
  getWeekLabel,
  shiftWeek,
  toDateKey
} from "@/lib/schedule/dates";
import {
  Distributor,
  DEFAULT_TURNOVER_MINUTES,
  INITIAL_DISTRIBUTORS,
  INITIAL_ROOMS,
  Movie,
  Room,
  ScheduleState,
  Screening,
  WeekdayKey,
  WEEKDAYS
} from "@/lib/schedule/types";
import {
  createMovieAccentColorMap,
  FALLBACK_MOVIE_ACCENT_COLOR
} from "@/lib/schedule/movie-colors";
import { getNextScreeningStartTime } from "@/lib/schedule/screenings";
import {
  formatTimelineTime,
  getNextScreeningForSameRoom,
  getScreeningGapInfo,
  getScreeningTimelineLayout,
  getTimelineHeight,
  getTimelineHourMarks,
  getTimelineOffsetForMinutes,
  getTimelineRangeForDay
} from "@/lib/schedule/timeline";
import {
  addWeeklyMovie,
  deleteScreening,
  deleteDistributor,
  detachAndDeleteDistributor,
  loadScheduleForWeek,
  loadScreeningsForWeek,
  loadWeeklyMoviesForWeek,
  mergeDistributors,
  normalizeDistributorName,
  removeMovie,
  removeWeeklyMovie,
  replaceWeeklyMoviesForWeek,
  saveMovie,
  saveRooms,
  saveScreening,
  updateDistributor
} from "@/lib/schedule/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { MoviePanel } from "@/components/movies/movie-panel";
import {
  emptyMovieForm,
  MovieDraft,
  MovieSearchResponse,
  MovieSearchResult,
  MovieSearchState
} from "@/components/movies/types";
import { ScreeningCard } from "./screening-card";
import { SaveState, StatusBadge } from "./status-badge";
import {
  ScreeningDropResult,
  ScreeningPasteResult,
  useScreeningDragAndDrop
} from "./use-screening-drag-and-drop";
import { useScheduleRealtime } from "./use-schedule-realtime";
import { useUndoableScreenings } from "./use-undoable-screenings";
import { FerminPdfView } from "./fermin-pdf-view";
import { WeeklyPrintView } from "./weekly-print-view";
import { WeeklyMoviesPanel } from "./weekly-movies-panel";

const MAIN_SECTIONS = [
  { key: "schedule", label: "Programación salas" },
  { key: "movies", label: "Películas" }
] as const;

type MainSection = (typeof MAIN_SECTIONS)[number]["key"];

type PrintMode = "weekly" | "fermin";

type ProgrammingScreenProps = {
  isSigningOut?: boolean;
  userEmail?: string;
  onSignOut?: () => void | Promise<void>;
};

export function ProgrammingScreen({
  isSigningOut = false,
  userEmail = "",
  onSignOut
}: ProgrammingScreenProps = {}) {
  const [weekStart, setWeekStart] = useState(() => toDateKey(getFridayWeekStart()));
  const [state, setState] = useState<ScheduleState>({
    rooms: INITIAL_ROOMS,
    movies: [],
    distributors: INITIAL_DISTRIBUTORS,
    screenings: []
  });
  const [activeDay, setActiveDay] = useState<WeekdayKey>("friday");
  const [duplicateSource, setDuplicateSource] = useState<WeekdayKey>("friday");
  const [duplicateTarget, setDuplicateTarget] = useState<WeekdayKey>("saturday");
  const [turnoverMinutes, setTurnoverMinutes] = useState(DEFAULT_TURNOVER_MINUTES);
  const [movieForm, setMovieForm] = useState<MovieDraft>(emptyMovieForm);
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [movieEditDraft, setMovieEditDraft] = useState<MovieDraft>(emptyMovieForm);
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [movieSearchResults, setMovieSearchResults] = useState<MovieSearchResult[]>([]);
  const [movieSearchState, setMovieSearchState] = useState<MovieSearchState>("idle");
  const [movieSearchError, setMovieSearchError] = useState("");
  const [importDraft, setImportDraft] = useState<MovieDraft | null>(null);
  const [importSourceUrl, setImportSourceUrl] = useState("");
  const [activeSection, setActiveSection] = useState<MainSection>("schedule");
  const [printMode, setPrintMode] = useState<PrintMode>("weekly");
  const [weeklyMovieIds, setWeeklyMovieIds] = useState<string[]>([]);
  const [isWeeklyMoviesPanelOpen, setIsWeeklyMoviesPanelOpen] = useState(true);
  const [selectedScreeningId, setSelectedScreeningId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [dragNotice, setDragNotice] = useState("");
  const [realtimeNotice, setRealtimeNotice] = useState("");
  const [isDistributorPanelOpen, setIsDistributorPanelOpen] = useState(true);
  const [editingDistributorId, setEditingDistributorId] = useState<string | null>(null);
  const [distributorRenameDraft, setDistributorRenameDraft] = useState("");
  const [activeDistributorActionId, setActiveDistributorActionId] = useState<string | null>(null);
  const [activeDistributorAction, setActiveDistributorAction] = useState<"remove" | "merge" | null>(
    null
  );
  const [mergeTargetDistributorId, setMergeTargetDistributorId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const persistedScreeningsRef = useRef<Screening[]>([]);
  const stateRef = useRef(state);
  const weeklyMovieIdsRef = useRef(weeklyMovieIds);

  const rememberPersistedScreenings = useCallback((screenings: Screening[]) => {
    persistedScreeningsRef.current = [...screenings].sort(compareScreeningStartTimes);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    weeklyMovieIdsRef.current = weeklyMovieIds;
  }, [weeklyMovieIds]);

  useEffect(() => {
    let mounted = true;

    setIsLoading(true);
    setState((current) => ({ ...current, screenings: [] }));
    setWeeklyMovieIds([]);
    rememberPersistedScreenings([]);

    Promise.all([loadScheduleForWeek(weekStart), loadWeeklyMoviesForWeek(weekStart)])
      .then(([loadedState, loadedWeeklyMovieIds]) => {
        if (!mounted) return;
        rememberPersistedScreenings(loadedState.screenings);
        setState(loadedState);
        setWeeklyMovieIds(loadedWeeklyMovieIds);
        setIsLoading(false);
        if (!loadedState.rooms.length) {
          void saveRooms(INITIAL_ROOMS);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setIsLoading(false);
        setSaveState("error");
        setSaveError(getErrorMessage(error));
      });

    return () => {
      mounted = false;
    };
  }, [rememberPersistedScreenings, weekStart]);

  useEffect(() => {
    setDuplicateSource(activeDay);
  }, [activeDay]);

  useEffect(() => {
    setSelectedScreeningId(null);
  }, [activeDay, weekStart]);

  useEffect(() => {
    if (
      selectedScreeningId &&
      !state.screenings.some((screening) => screening.id === selectedScreeningId)
    ) {
      setSelectedScreeningId(null);
    }
  }, [selectedScreeningId, state.screenings]);

  useEffect(() => {
    if (!dragNotice) return;

    const timeoutId = window.setTimeout(() => setDragNotice(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [dragNotice]);

  useEffect(() => {
    if (!copyNotice) return;

    const timeoutId = window.setTimeout(() => setCopyNotice(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyNotice]);

  useEffect(() => {
    if (!realtimeNotice) return;

    const timeoutId = window.setTimeout(() => setRealtimeNotice(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [realtimeNotice]);

  useEffect(() => {
    const handleAfterPrint = () => setPrintMode("weekly");

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  useEffect(() => {
    if (duplicateTarget === duplicateSource) {
      setDuplicateTarget(WEEKDAYS.find((day) => day.key !== duplicateSource)?.key ?? "friday");
    }
  }, [duplicateSource, duplicateTarget]);

  const weekScreenings = useMemo(
    () => state.screenings.filter((screening) => screening.weekStart === weekStart),
    [state.screenings, weekStart]
  );
  const movieAccentColors = useMemo(
    () =>
      createMovieAccentColorMap({
        movies: state.movies,
        screenings: state.screenings,
        weekStart
      }),
    [state.movies, state.screenings, weekStart]
  );

  const movieUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();

    state.screenings.forEach((screening) => {
      if (!screening.movieId) return;
      counts.set(screening.movieId, (counts.get(screening.movieId) ?? 0) + 1);
    });

    return counts;
  }, [state.screenings]);

  const distributorMovieCounts = useMemo(() => {
    const counts = new Map<string, number>();

    state.movies.forEach((movie) => {
      if (!movie.distributorId) return;
      counts.set(movie.distributorId, (counts.get(movie.distributorId) ?? 0) + 1);
    });

    return counts;
  }, [state.movies]);

  const activeDayIndex = WEEKDAYS.findIndex((day) => day.key === activeDay);
  const timelineRange = useMemo(
    () =>
      getTimelineRangeForDay({
        day: activeDay,
        movies: state.movies,
        screenings: state.screenings,
        turnoverMinutes,
        weekStart
      }),
    [activeDay, state.movies, state.screenings, turnoverMinutes, weekStart]
  );
  const timelineHourMarks = useMemo(() => getTimelineHourMarks(timelineRange), [timelineRange]);
  const timelineHeight = getTimelineHeight(timelineRange);

  const runSaving = async (operation: () => Promise<void>) => {
    setSaveState("saving");
    setSaveError("");

    try {
      await operation();
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error));
      return false;
    }
  };

  const printSchedule = (mode: PrintMode) => {
    setPrintMode(mode);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const reloadVisibleWeekFromRealtime = useCallback(async () => {
    const [loadedState, loadedWeeklyMovieIds] = await Promise.all([
      loadScheduleForWeek(weekStart),
      loadWeeklyMoviesForWeek(weekStart)
    ]);
    const hasChanged =
      !areScreeningListsEqual(stateRef.current.screenings, loadedState.screenings) ||
      !areStringListsEqual(weeklyMovieIdsRef.current, loadedWeeklyMovieIds);

    stateRef.current = loadedState;
    weeklyMovieIdsRef.current = loadedWeeklyMovieIds;
    rememberPersistedScreenings(loadedState.screenings);
    setState(loadedState);
    setWeeklyMovieIds(loadedWeeklyMovieIds);

    return hasChanged;
  }, [rememberPersistedScreenings, weekStart]);

  const { canUndo, clearUndoStack, pushUndoSnapshot, undoLastSessionAction, undoNotice } =
    useUndoableScreenings({
      persistedScreeningsRef,
      rememberPersistedScreenings,
      runSaving,
      saveState,
      screenings: state.screenings,
      setState,
      weekStart
    });

  const { broadcastWeeklyMoviesChanged } = useScheduleRealtime({
    onError: (error) => {
      setSaveState("error");
      setSaveError(getErrorMessage(error));
    },
    onReload: reloadVisibleWeekFromRealtime,
    onRemoteChange: ({ notify = true } = {}) => {
      clearUndoStack();
      if (notify) {
        setRealtimeNotice("Programación actualizada");
      }
    },
    screenings: state.screenings,
    weekStart
  });

  const addMovieToWeek = async (movieId: string) => {
    if (weeklyMovieIds.includes(movieId)) return;

    const previousWeeklyMovieIds = weeklyMovieIds;
    const nextWeeklyMovieIds = [...weeklyMovieIds, movieId];

    setWeeklyMovieIds(nextWeeklyMovieIds);
    const saved = await runSaving(() => addWeeklyMovie(weekStart, movieId));

    if (!saved) {
      setWeeklyMovieIds(previousWeeklyMovieIds);
      return;
    }

    void broadcastWeeklyMoviesChanged();
  };

  const removeMovieFromWeek = async (movieId: string) => {
    const previousWeeklyMovieIds = weeklyMovieIds;
    const nextWeeklyMovieIds = weeklyMovieIds.filter((id) => id !== movieId);

    setWeeklyMovieIds(nextWeeklyMovieIds);
    const saved = await runSaving(() => removeWeeklyMovie(weekStart, movieId));

    if (!saved) {
      setWeeklyMovieIds(previousWeeklyMovieIds);
      return;
    }

    void broadcastWeeklyMoviesChanged();
  };

  const showDragNotice = useCallback((message: string) => {
    setDragNotice(message);
  }, []);

  const buildScreeningsWithPatch = (screening: Screening) =>
    [
      ...state.screenings.filter((item) => item.id !== screening.id),
      screening
    ].sort(compareScreeningStartTimes);

  const getConflictsInvolvingScreening = (screeningId: string, screenings: Screening[]) =>
    getTurnoverConflicts(screenings, state.movies, turnoverMinutes).filter(
      (conflict) =>
        conflict.previousScreeningId === screeningId || conflict.currentScreeningId === screeningId
    );

  const confirmTurnoverConflict = (conflict: {
    previousEndsAt: string;
    minimumStartAt: string;
    actualGapMinutes: number;
    turnoverMinutes: number;
  }) =>
    window.confirm(
      `Hay menos de ${conflict.turnoverMinutes} minutos entre sesiones. Anterior termina a las ${conflict.previousEndsAt}. Con ${conflict.turnoverMinutes} min de margen, esta sesión debería empezar a partir de las ${conflict.minimumStartAt}. Margen real: ${conflict.actualGapMinutes} min. ¿Quieres guardar igualmente?`
    );

  const getConflictsInvolvingMovie = (
    movieId: string,
    screenings: Screening[],
    movies: Movie[]
  ) =>
    getTurnoverConflicts(screenings, movies, turnoverMinutes).filter((conflict) => {
      const previous = screenings.find((screening) => screening.id === conflict.previousScreeningId);
      const current = screenings.find((screening) => screening.id === conflict.currentScreeningId);

      return previous?.movieId === movieId || current?.movieId === movieId;
    });

  const revertScreeningToLastSaved = (screeningId: string) => {
    const savedScreening = persistedScreeningsRef.current.find((item) => item.id === screeningId);

    setState((current) => ({
      ...current,
      screenings: savedScreening
        ? [
            ...current.screenings.filter((item) => item.id !== screeningId),
            savedScreening
          ].sort(compareScreeningStartTimes)
        : current.screenings.filter((item) => item.id !== screeningId)
    }));
  };

  const persistScreening = async (screening: Screening) => {
    const previousScreenings = state.screenings;
    const previousPersistedScreenings = persistedScreeningsRef.current;
    const nextScreenings = buildScreeningsWithPatch(screening);
    const nextPersistedScreenings = [
      ...persistedScreeningsRef.current.filter((item) => item.id !== screening.id),
      screening
    ].sort(compareScreeningStartTimes);

    if (!isValidScreeningTime(screening.startsAt)) {
      setState((current) => ({ ...current, screenings: nextScreenings }));
      setSaveState("error");
      setSaveError("Hora no válida. Usa HH:mm.");
      return false;
    }

    const conflicts = getConflictsInvolvingScreening(screening.id, nextScreenings);
    if (conflicts.length && !confirmTurnoverConflict(conflicts[0])) {
      revertScreeningToLastSaved(screening.id);
      return false;
    }

    setState((current) => ({ ...current, screenings: nextScreenings }));
    const saved = await runSaving(() => saveScreening(screening));
    if (!saved) {
      setState((current) => ({ ...current, screenings: previousScreenings }));
      rememberPersistedScreenings(previousPersistedScreenings);
      return false;
    }

    rememberPersistedScreenings(nextPersistedScreenings);
    pushUndoSnapshot(previousPersistedScreenings);
    return true;
  };

  const addScreening = (room: Room) => {
    const screening: Screening = {
      id: crypto.randomUUID(),
      weekStart,
      day: activeDay,
      roomId: room.id,
      movieId: null,
      startsAt: getNextScreeningStartTime({
        day: activeDay,
        movies: state.movies,
        roomId: room.id,
        screenings: state.screenings,
        turnoverMinutes,
        weekStart
      })
    };

    void persistScreening(screening);
  };

  const updateScreening = (screening: Screening, patch: Partial<Screening>) => {
    return persistScreening({ ...screening, ...patch });
  };

  const removeScreening = async (screening: Screening) => {
    const previousScreenings = state.screenings;
    const previousPersistedScreenings = persistedScreeningsRef.current;
    const nextScreenings = state.screenings.filter((item) => item.id !== screening.id);

    setState((current) => ({
      ...current,
      screenings: nextScreenings
    }));

    const saved = await runSaving(() => deleteScreening(screening.id));
    if (!saved) {
      setState((current) => ({ ...current, screenings: previousScreenings }));
      rememberPersistedScreenings(previousPersistedScreenings);
      return;
    }

    rememberPersistedScreenings(
      persistedScreeningsRef.current.filter((item) => item.id !== screening.id)
    );
    pushUndoSnapshot(previousPersistedScreenings);
  };

  const persistDraggedScreeningDrop = useCallback(
    async (drop: ScreeningDropResult) => {
      const draggedScreening = state.screenings.find((screening) => screening.id === drop.screeningId);
      const replacementScreening = drop.targetScreeningId
        ? state.screenings.find((screening) => screening.id === drop.targetScreeningId)
        : null;

      if (!draggedScreening) return;
      if (replacementScreening?.id === draggedScreening.id) return;
      if (drop.targetScreeningId && !replacementScreening) {
        showDragNotice("No cabe ahí");
        return;
      }

      const nextRoomId = replacementScreening?.roomId ?? drop.roomId;
      const nextStartsAt = replacementScreening?.startsAt ?? drop.startsAt;

      if (
        !replacementScreening &&
        draggedScreening.weekStart === weekStart &&
        draggedScreening.day === activeDay &&
        draggedScreening.roomId === nextRoomId &&
        draggedScreening.startsAt === nextStartsAt
      ) {
        return;
      }

      const previousScreenings = state.screenings;
      const previousPersistedScreenings = persistedScreeningsRef.current;
      const movedScreening: Screening = {
        ...draggedScreening,
        weekStart,
        day: activeDay,
        roomId: nextRoomId,
        startsAt: nextStartsAt
      };
      const nextScreenings = [
        ...state.screenings.filter(
          (screening) =>
            screening.id !== draggedScreening.id && screening.id !== replacementScreening?.id
        ),
        movedScreening
      ].sort(compareScreeningStartTimes);
      const nextPersistedScreenings = [
        ...persistedScreeningsRef.current.filter(
          (screening) =>
            screening.id !== draggedScreening.id && screening.id !== replacementScreening?.id
        ),
        movedScreening
      ].sort(compareScreeningStartTimes);

      if (!replacementScreening) {
        const conflicts = getTurnoverConflicts(nextScreenings, state.movies, turnoverMinutes).filter(
          (conflict) =>
            conflict.previousScreeningId === movedScreening.id ||
            conflict.currentScreeningId === movedScreening.id
        );

        if (conflicts.length) {
          showDragNotice("No cabe ahí");
          return;
        }
      }

      setState((current) => ({ ...current, screenings: nextScreenings }));

      const saved = await runSaving(async () => {
        if (!replacementScreening) {
          await saveScreening(movedScreening);
          return;
        }

        try {
          await deleteScreening(replacementScreening.id);
          await saveScreening(movedScreening);
        } catch (error) {
          await Promise.allSettled([
            saveScreening(draggedScreening),
            saveScreening(replacementScreening)
          ]);
          throw error;
        }
      });

      if (!saved) {
        setState((current) => ({ ...current, screenings: previousScreenings }));
        rememberPersistedScreenings(previousPersistedScreenings);
        return;
      }

      rememberPersistedScreenings(nextPersistedScreenings);
      pushUndoSnapshot(previousPersistedScreenings);
      setSelectedScreeningId(movedScreening.id);
    },
    [
      activeDay,
      pushUndoSnapshot,
      rememberPersistedScreenings,
      runSaving,
      showDragNotice,
      state.movies,
      state.screenings,
      turnoverMinutes,
      weekStart
    ]
  );

  const persistPastedScreeningDrop = useCallback(
    async (drop: ScreeningPasteResult) => {
      const replacementScreening = drop.targetScreeningId
        ? state.screenings.find((screening) => screening.id === drop.targetScreeningId)
        : null;

      if (drop.targetScreeningId && !replacementScreening) {
        showDragNotice("No cabe ahí");
        return;
      }

      const nextRoomId = replacementScreening?.roomId ?? drop.roomId;
      const nextStartsAt = replacementScreening?.startsAt ?? drop.startsAt;
      const previousScreenings = state.screenings;
      const previousPersistedScreenings = persistedScreeningsRef.current;
      const pastedScreening: Screening = {
        ...drop.copiedScreening,
        id: crypto.randomUUID(),
        weekStart,
        day: activeDay,
        roomId: nextRoomId,
        startsAt: nextStartsAt
      };
      const nextScreenings = [
        ...state.screenings.filter((screening) => screening.id !== replacementScreening?.id),
        pastedScreening
      ].sort(compareScreeningStartTimes);
      const nextPersistedScreenings = [
        ...persistedScreeningsRef.current.filter(
          (screening) => screening.id !== replacementScreening?.id
        ),
        pastedScreening
      ].sort(compareScreeningStartTimes);

      if (!replacementScreening) {
        const conflicts = getTurnoverConflicts(nextScreenings, state.movies, turnoverMinutes).filter(
          (conflict) =>
            conflict.previousScreeningId === pastedScreening.id ||
            conflict.currentScreeningId === pastedScreening.id
        );

        if (conflicts.length) {
          showDragNotice("No cabe ahí");
          return;
        }
      }

      setState((current) => ({ ...current, screenings: nextScreenings }));

      const saved = await runSaving(async () => {
        if (!replacementScreening) {
          await saveScreening(pastedScreening);
          return;
        }

        try {
          await deleteScreening(replacementScreening.id);
          await saveScreening(pastedScreening);
        } catch (error) {
          await deleteScreening(pastedScreening.id).catch(() => undefined);
          await saveScreening(replacementScreening).catch(() => undefined);
          throw error;
        }
      });

      if (!saved) {
        setState((current) => ({ ...current, screenings: previousScreenings }));
        rememberPersistedScreenings(previousPersistedScreenings);
        return;
      }

      rememberPersistedScreenings(nextPersistedScreenings);
      pushUndoSnapshot(previousPersistedScreenings);
      setSelectedScreeningId(pastedScreening.id);
    },
    [
      activeDay,
      pushUndoSnapshot,
      rememberPersistedScreenings,
      runSaving,
      showDragNotice,
      state.movies,
      state.screenings,
      turnoverMinutes,
      weekStart
    ]
  );

  const {
    copiedScreening,
    consumeDragClickSuppression,
    dragState,
    pasteState,
    startScreeningDrag
  } =
    useScreeningDragAndDrop({
      activeDay,
      movies: state.movies,
      onBlockedDrop: showDragNotice,
      onCopyNotice: setCopyNotice,
      onDrop: persistDraggedScreeningDrop,
      onPaste: persistPastedScreeningDrop,
      onSelectScreening: setSelectedScreeningId,
      selectedScreeningId,
      screenings: state.screenings,
      timelineRange,
      turnoverMinutes,
      weekStart
    });

  const createMovieFromDraft = async (draft: MovieDraft) => {
    const title = draft.title.trim();
    const durationMinutes = Number(draft.durationMinutes);
    const director = draft.director.trim();

    if (!title || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setSaveState("error");
      setSaveError("Introduce título y duración válidos.");
      return null;
    }

    setSaveState("saving");
    setSaveError("");

    try {
      const movie: Movie = {
        id: crypto.randomUUID(),
        title,
        durationMinutes,
        director,
        posterUrl: "",
        distributorId: null,
        retiredAt: null
      };

      await saveMovie(movie);

      setState((current) => ({
        ...current,
        movies: [...current.movies, movie].sort((a, b) => a.title.localeCompare(b.title))
      }));
      setSaveState("saved");
      return movie;
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error));
      return null;
    }
  };

  const createMovie = async () => {
    const movie = await createMovieFromDraft(movieForm);
    if (movie) {
      setMovieForm(emptyMovieForm);
    }
  };

  const startEditMovie = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setMovieEditDraft({
      title: movie.title,
      durationMinutes: movie.durationMinutes,
      director: movie.director
    });
  };

  const cancelEditMovie = () => {
    setEditingMovieId(null);
    setMovieEditDraft(emptyMovieForm);
  };

  const updateMovieFromDraft = async (movie: Movie, draft: MovieDraft) => {
    const title = draft.title.trim();
    const durationMinutes = Number(draft.durationMinutes);
    const director = draft.director.trim();

    if (!title || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setSaveState("error");
      setSaveError("Introduce título y duración válidos.");
      return;
    }

    if (durationMinutes !== movie.durationMinutes) {
      const nextMovies = state.movies.map((item) =>
        item.id === movie.id ? { ...movie, title, durationMinutes } : item
      );
      const conflicts = getConflictsInvolvingMovie(movie.id, state.screenings, nextMovies);

      if (conflicts.length && !confirmTurnoverConflict(conflicts[0])) {
        return;
      }
    }

    setSaveState("saving");
    setSaveError("");

    try {
      const updatedMovie: Movie = {
        ...movie,
        title,
        durationMinutes,
        director
      };

      await saveMovie(updatedMovie);

      setState((current) => ({
        ...current,
        movies: current.movies
          .map((item) => (item.id === movie.id ? updatedMovie : item))
          .sort((a, b) => a.title.localeCompare(b.title))
      }));
      setSaveState("saved");
      cancelEditMovie();
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error));
    }
  };

  const searchMovies = async () => {
    const query = movieSearchQuery.trim();

    if (query.length < 2) {
      setMovieSearchState("error");
      setMovieSearchError("Escribe al menos 2 letras.");
      return;
    }

    setMovieSearchState("searching");
    setMovieSearchError("");
    setImportDraft(null);
    setImportSourceUrl("");

    try {
      const response = await fetch(`/api/movie-search?q=${encodeURIComponent(query)}`);
      const data = (await response.json()) as MovieSearchResponse;

      if (!response.ok) {
        throw new Error(data.error || "No se pudo buscar la pelicula.");
      }

      setMovieSearchResults(data.results ?? []);
      setMovieSearchState("idle");
    } catch (error) {
      setMovieSearchResults([]);
      setMovieSearchState("error");
      setMovieSearchError(getErrorMessage(error));
    }
  };

  const startImportMovie = (result: MovieSearchResult) => {
    setImportDraft({
      title: result.title,
      durationMinutes: result.durationMinutes ?? 100,
      director: ""
    });
    setImportSourceUrl(result.sourceUrl);
  };

  const createImportedMovie = async () => {
    if (!importDraft) return;

    const movie = await createMovieFromDraft(importDraft);
    if (movie) {
      setImportDraft(null);
      setImportSourceUrl("");
      setMovieSearchQuery("");
      setMovieSearchResults([]);
    }
  };

  const handleRemoveMovie = async (movie: Movie) => {
    const usageCount = movieUsageCounts.get(movie.id) ?? 0;
    const actionLabel = usageCount ? "retirar" : "borrar";
    const confirmed = window.confirm(
      usageCount
        ? `Retirar "${movie.title}" del selector. Las sesiones existentes conservarán la película.`
        : `Borrar "${movie.title}" definitivamente.`
    );

    if (!confirmed) return;

    const result = await runSaving(async () => {
      const removal = await removeMovie(movie.id);

      setState((current) => ({
        ...current,
        movies:
          removal.action === "deleted"
            ? current.movies.filter((item) => item.id !== movie.id)
            : current.movies.map((item) =>
                item.id === movie.id ? { ...item, retiredAt: removal.retiredAt } : item
              )
      }));
    });

    if (!result) {
      setSaveError(`No se pudo ${actionLabel} la pelicula.`);
    }
  };

  const reloadScheduleAfterDistributorError = async () => {
    try {
      const loadedState = await loadScheduleForWeek(weekStart);
      rememberPersistedScreenings(loadedState.screenings);
      setState(loadedState);
    } catch {
      // The visible save error already explains the failed operation.
    }
  };

  const startRenameDistributor = (distributor: Distributor) => {
    setEditingDistributorId(distributor.id);
    setDistributorRenameDraft(distributor.name);
    setActiveDistributorActionId(null);
  };

  const cancelRenameDistributor = () => {
    setEditingDistributorId(null);
    setDistributorRenameDraft("");
  };

  const renameDistributor = async (distributor: Distributor) => {
    const name = distributorRenameDraft.trim();
    const normalizedName = normalizeDistributorName(name);
    const duplicate = state.distributors.find(
      (item) => item.id !== distributor.id && item.normalizedName === normalizedName
    );

    if (!name || !normalizedName) {
      setSaveState("error");
      setSaveError("Introduce un nombre de distribuidora valido.");
      return;
    }

    if (duplicate) {
      setSaveState("error");
      setSaveError("Ya existe una distribuidora con ese nombre. Usa fusionar.");
      return;
    }

    const previousDistributors = state.distributors;
    const renamedDistributor = { ...distributor, name, normalizedName };

    setState((current) => ({
      ...current,
      distributors: upsertDistributor(current.distributors, renamedDistributor)
    }));

    const saved = await runSaving(async () => {
      const savedDistributor = await updateDistributor(distributor.id, name);
      setState((current) => ({
        ...current,
        distributors: upsertDistributor(current.distributors, savedDistributor)
      }));
    });

    if (!saved) {
      setState((current) => ({ ...current, distributors: previousDistributors }));
      await reloadScheduleAfterDistributorError();
      return;
    }

    cancelRenameDistributor();
  };

  const requestRemoveDistributor = (distributor: Distributor) => {
    const usageCount = distributorMovieCounts.get(distributor.id) ?? 0;

    setEditingDistributorId(null);
    setActiveDistributorActionId(distributor.id);
    setActiveDistributorAction("remove");
    setMergeTargetDistributorId(
      state.distributors.find((item) => item.id !== distributor.id)?.id ?? ""
    );

    if (usageCount === 0) {
      const confirmed = window.confirm(`Borrar "${distributor.name}" definitivamente.`);
      if (!confirmed) {
        setActiveDistributorActionId(null);
        setActiveDistributorAction(null);
        return;
      }

      void removeUnusedDistributor(distributor);
    }
  };

  const requestMergeDistributor = (distributor: Distributor) => {
    const currentTargetIsValid = state.distributors.some(
      (item) => item.id === mergeTargetDistributorId && item.id !== distributor.id
    );
    const defaultTargetId =
      currentTargetIsValid
        ? mergeTargetDistributorId
        : state.distributors.find((item) => item.id !== distributor.id)?.id ?? "";

    setEditingDistributorId(null);
    setActiveDistributorActionId(distributor.id);
    setActiveDistributorAction("merge");
    setMergeTargetDistributorId(defaultTargetId);
  };

  const removeUnusedDistributor = async (distributor: Distributor) => {
    const previousDistributors = state.distributors;

    setState((current) => ({
      ...current,
      distributors: current.distributors.filter((item) => item.id !== distributor.id)
    }));

    const saved = await runSaving(() => deleteDistributor(distributor.id));

    if (!saved) {
      setState((current) => ({ ...current, distributors: previousDistributors }));
      await reloadScheduleAfterDistributorError();
      return;
    }

    setActiveDistributorActionId(null);
    setActiveDistributorAction(null);
  };

  const detachMoviesAndRemoveDistributor = async (distributor: Distributor) => {
    const previousState = state;

    setState((current) => ({
      ...current,
      movies: current.movies.map((movie) =>
        movie.distributorId === distributor.id ? { ...movie, distributorId: null } : movie
      ),
      distributors: current.distributors.filter((item) => item.id !== distributor.id)
    }));

    const saved = await runSaving(() => detachAndDeleteDistributor(distributor.id));

    if (!saved) {
      setState(previousState);
      await reloadScheduleAfterDistributorError();
      return;
    }

    setActiveDistributorActionId(null);
    setActiveDistributorAction(null);
  };

  const mergeDistributorIntoTarget = async (sourceDistributor: Distributor) => {
    if (!mergeTargetDistributorId || mergeTargetDistributorId === sourceDistributor.id) {
      setSaveState("error");
      setSaveError("Elige otra distribuidora para fusionar.");
      return;
    }

    const targetDistributor = state.distributors.find(
      (distributor) => distributor.id === mergeTargetDistributorId
    );

    if (!targetDistributor) {
      setSaveState("error");
      setSaveError("Elige una distribuidora destino válida.");
      return;
    }

    const usageCount = distributorMovieCounts.get(sourceDistributor.id) ?? 0;
    const confirmed = window.confirm(
      `Fusionar "${sourceDistributor.name}" en "${targetDistributor.name}". Se moverán ${usageCount} películas y se borrará la distribuidora origen.`
    );

    if (!confirmed) return;

    const previousState = state;

    setState((current) => ({
      ...current,
      movies: current.movies.map((movie) =>
        movie.distributorId === sourceDistributor.id
          ? { ...movie, distributorId: mergeTargetDistributorId }
          : movie
      ),
      distributors: current.distributors.filter((item) => item.id !== sourceDistributor.id)
    }));

    const saved = await runSaving(() =>
      mergeDistributors(sourceDistributor.id, mergeTargetDistributorId)
    );

    if (!saved) {
      setState(previousState);
      await reloadScheduleAfterDistributorError();
      return;
    }

    setActiveDistributorActionId(null);
    setActiveDistributorAction(null);
    setMergeTargetDistributorId("");
  };

  const duplicateDay = async () => {
    if (duplicateSource === duplicateTarget) return;

    const sourceScreenings = weekScreenings.filter(
      (screening) => screening.day === duplicateSource
    );
    const existingTargetIds = state.screenings
      .filter((screening) => screening.weekStart === weekStart && screening.day === duplicateTarget)
      .map((screening) => screening.id);

    if (!sourceScreenings.length) {
      setSaveState("error");
      setSaveError("El día origen no tiene sesiones.");
      return;
    }

    const sourceLabel = getWeekdayLabel(duplicateSource);
    const targetLabel = getWeekdayLabel(duplicateTarget);
    const confirmed = window.confirm(
      `Duplicar ${sourceLabel} sobre ${targetLabel}. Se sustituirán ${existingTargetIds.length} sesiones del día destino.`
    );

    if (!confirmed) return;

    const previousScreenings = state.screenings;
    const previousPersistedScreenings = persistedScreeningsRef.current;
    const copies = sourceScreenings.map((screening) => ({
      ...screening,
      id: crypto.randomUUID(),
      day: duplicateTarget
    }));
    const nextScreenings = [
      ...state.screenings.filter((screening) => !existingTargetIds.includes(screening.id)),
      ...copies
    ].sort(compareScreeningStartTimes);
    const nextPersistedScreenings = [
      ...persistedScreeningsRef.current.filter(
        (screening) => !existingTargetIds.includes(screening.id)
      ),
      ...copies
    ].sort(compareScreeningStartTimes);

    setState((current) => ({
      ...current,
      screenings: nextScreenings
    }));

    const saved = await runSaving(async () => {
      await Promise.all([
        ...existingTargetIds.map((id) => deleteScreening(id)),
        ...copies.map((screening) => saveScreening(screening))
      ]);
    });

    if (!saved) {
      setState((current) => ({ ...current, screenings: previousScreenings }));
      rememberPersistedScreenings(previousPersistedScreenings);
      return;
    }

    rememberPersistedScreenings(nextPersistedScreenings);
    pushUndoSnapshot(previousPersistedScreenings);
  };

  const copyWeekToNextWeek = async () => {
    const nextWeekStart = shiftWeek(weekStart, 1);
    const sourceScreenings = weekScreenings;
    const sourceWeeklyMovieIds = weeklyMovieIds;

    if (!sourceScreenings.length && !sourceWeeklyMovieIds.length) {
      setSaveState("error");
      setSaveError("La semana actual no tiene sesiones ni películas en el listado.");
      return;
    }

    const targetData = await Promise.all([
      loadScreeningsForWeek(nextWeekStart),
      loadWeeklyMoviesForWeek(nextWeekStart)
    ]).catch((error) => {
      setSaveState("error");
      setSaveError(getErrorMessage(error));
      return null;
    });

    if (!targetData) return;

    const [targetScreenings, targetWeeklyMovieIds] = targetData;
    const hasTargetContent = Boolean(targetScreenings.length || targetWeeklyMovieIds.length);

    const confirmed = window.confirm(
      hasTargetContent
        ? `La semana siguiente ya tiene ${targetScreenings.length} sesiones y ${targetWeeklyMovieIds.length} películas en el listado. ¿Quieres reemplazarla por ${sourceScreenings.length} sesiones y ${sourceWeeklyMovieIds.length} películas de la semana actual?`
        : `Se copiarán ${sourceScreenings.length} sesiones y ${sourceWeeklyMovieIds.length} películas a la semana del ${getWeekLabel(nextWeekStart)}.`
    );

    if (!confirmed) return;

    const previousScreenings = state.screenings;
    const previousPersistedScreenings = persistedScreeningsRef.current;
    const previousWeeklyMovieIds = weeklyMovieIds;
    const copies = sourceScreenings.map((screening) => ({
      ...screening,
      id: crypto.randomUUID(),
      weekStart: nextWeekStart
    }));
    const saved = await runSaving(async () => {
      try {
        await Promise.all(targetScreenings.map((screening) => deleteScreening(screening.id)));
        await Promise.all(copies.map((screening) => saveScreening(screening)));
        await replaceWeeklyMoviesForWeek(nextWeekStart, sourceWeeklyMovieIds);
      } catch (error) {
        await Promise.allSettled(copies.map((screening) => deleteScreening(screening.id)));
        await Promise.allSettled(targetScreenings.map((screening) => saveScreening(screening)));
        await replaceWeeklyMoviesForWeek(nextWeekStart, targetWeeklyMovieIds).catch(() => undefined);
        throw error;
      }
    });

    if (!saved) {
      const loadedData = await Promise.all([
        loadScheduleForWeek(weekStart),
        loadWeeklyMoviesForWeek(weekStart)
      ]).catch(() => null);

      if (loadedData) {
        const [loadedState, loadedWeeklyMovieIds] = loadedData;
        setState(loadedState);
        setWeeklyMovieIds(loadedWeeklyMovieIds);
        rememberPersistedScreenings(loadedState.screenings);
      } else {
        setState((current) => ({ ...current, screenings: previousScreenings }));
        setWeeklyMovieIds(previousWeeklyMovieIds);
        rememberPersistedScreenings(previousPersistedScreenings);
      }

      return;
    }

    setCopyNotice("Semana copiada correctamente");
    setWeekStart(nextWeekStart);
  };

  const conflictCount = weekScreenings.filter(
    (screening) =>
      getScreeningStatus(screening, weekScreenings, state.movies, turnoverMinutes) === "conflict"
  ).length;
  const invalidTimeCount = weekScreenings.filter(
    (screening) =>
      getScreeningStatus(screening, weekScreenings, state.movies, turnoverMinutes) === "invalid"
  ).length;
  const draggedScreening = dragState
    ? state.screenings.find((screening) => screening.id === dragState.screeningId)
    : null;
  const placementState = dragState ?? pasteState;
  const placementScreening = draggedScreening ?? (pasteState ? copiedScreening : null);
  const placementMovie = placementScreening
    ? state.movies.find((movie) => movie.id === placementScreening.movieId)
    : null;
  const isPasteMode = Boolean(pasteState && copiedScreening);

  return (
    <>
      <main className="no-print min-h-screen bg-babel-bg text-white">
        <div className="border-b border-babel-line bg-babel-bg/92 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-babel-red">
                Cines Babel
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-normal md:text-2xl">
                Programación
              </h1>
            </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              isConfigured={isSupabaseConfigured}
              saveError={saveError}
              saveState={saveState}
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
              onClick={() => void undoLastSessionAction()}
              disabled={!canUndo}
              title="Deshacer última acción de sesiones"
            >
              <Undo2 size={14} />
              Deshacer
            </button>
            {undoNotice ? (
              <span className="inline-flex h-10 items-center rounded-md border border-green-500/20 bg-green-950/20 px-3 text-xs text-green-200">
                {undoNotice}
              </span>
            ) : null}
            {copyNotice ? (
              <span className="inline-flex h-10 items-center rounded-md border border-amber-500/25 bg-amber-950/25 px-3 text-xs text-amber-100">
                {copyNotice}
              </span>
            ) : null}
            {realtimeNotice ? (
              <span className="inline-flex h-10 items-center rounded-md border border-sky-500/25 bg-sky-950/25 px-3 text-xs text-sky-100">
                {realtimeNotice}
              </span>
            ) : null}
            {isPasteMode && placementMovie ? (
              <span className="inline-flex h-10 items-center rounded-md border border-green-500/25 bg-green-950/25 px-3 text-xs text-green-100">
                Pegando: {placementMovie.title} · Esc para cancelar
              </span>
            ) : null}
            {dragNotice ? (
              <span className="inline-flex h-10 items-center rounded-md border border-red-500/25 bg-red-950/30 px-3 text-xs text-red-100">
                {dragNotice}
              </span>
            ) : null}
            {onSignOut ? (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white disabled:cursor-not-allowed disabled:text-zinc-500"
                onClick={() => void onSignOut()}
                disabled={isSigningOut}
                title={userEmail ? `Sesión: ${userEmail}` : "Cerrar sesión"}
              >
                {isSigningOut ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <LogOut size={14} />
                )}
                {isSigningOut ? "Saliendo" : "Cerrar sesión"}
              </button>
            ) : null}
            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-xs text-zinc-300">
              Margen entre sesiones
              <input
                type="number"
                min="0"
                value={turnoverMinutes}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 0) {
                    setTurnoverMinutes(value);
                  }
                }}
                className="h-7 w-14 rounded border border-babel-line bg-zinc-950/40 px-2 text-right text-white outline-none transition focus:border-babel-red"
              />
              min
            </label>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-babel-line bg-babel-panel text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card"
              onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
              title="Semana anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="inline-flex h-9 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-sm text-zinc-200">
              <CalendarDays size={16} className="text-babel-red" />
              {getWeekLabel(weekStart)}
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-babel-line bg-babel-panel text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card"
              onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
              title="Semana siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-3">
        <div className="mb-3 flex gap-2 overflow-x-auto rounded-md border border-babel-line bg-babel-panel p-1">
          {MAIN_SECTIONS.map((section) => (
            <button
              key={section.key}
              className={clsx(
                "min-w-fit rounded px-3 py-2 text-sm transition",
                activeSection === section.key
                  ? "bg-babel-red text-white"
                  : "text-zinc-300 hover:bg-babel-card hover:text-white"
              )}
              onClick={() => setActiveSection(section.key)}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeSection === "schedule" ? (
          <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2 overflow-x-auto rounded-md border border-babel-line bg-babel-panel p-1">
              {WEEKDAYS.map((day, index) => (
                <button
                  key={day.key}
                  className={clsx(
                    "min-w-[96px] rounded px-3 py-1.5 text-left text-sm transition",
                    activeDay === day.key
                      ? "bg-babel-red text-white"
                      : "text-zinc-300 hover:bg-babel-card hover:text-white"
                  )}
                  onClick={() => setActiveDay(day.key)}
                >
                  <span className="block font-medium">{day.label}</span>
                  <span className="text-xs opacity-75">{getDayDateLabel(weekStart, index)}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-babel-line bg-babel-panel p-1">
                <select
                  value={duplicateSource}
                  onChange={(event) => setDuplicateSource(event.target.value as WeekdayKey)}
                  className="h-9 rounded bg-transparent px-2 text-sm text-white outline-none transition focus:bg-babel-card"
                  title="Dia origen"
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.key} value={day.key}>
                      {day.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-zinc-500">a</span>
                <select
                  value={duplicateTarget}
                  onChange={(event) => setDuplicateTarget(event.target.value as WeekdayKey)}
                  className="h-9 rounded bg-transparent px-2 text-sm text-white outline-none transition focus:bg-babel-card"
                  title="Dia destino"
                >
                  {WEEKDAYS.filter((day) => day.key !== duplicateSource).map((day) => (
                    <option key={day.key} value={day.key}>
                      {day.label}
                    </option>
                  ))}
                </select>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded bg-white px-3 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={duplicateDay}
                  disabled={duplicateSource === duplicateTarget}
                >
                  <Copy size={16} />
                  Duplicar
                </button>
              </div>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void copyWeekToNextWeek()}
                disabled={saveState === "saving"}
              >
                <Copy size={16} />
                Copiar semana a la siguiente
              </button>
              <button
                className={clsx(
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition",
                  isWeeklyMoviesPanelOpen
                    ? "border-babel-red bg-red-950/40 text-white"
                    : "border-babel-line bg-babel-panel text-zinc-200 hover:border-zinc-500 hover:bg-babel-card hover:text-white"
                )}
                onClick={() => setIsWeeklyMoviesPanelOpen((current) => !current)}
              >
                <Film size={16} />
                Películas de la semana
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white"
                onClick={() => printSchedule("weekly")}
              >
                <Printer size={16} />
                Imprimir semana
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white"
                onClick={() => printSchedule("fermin")}
              >
                <FileText size={16} />
                PDF películas y sesiones
              </button>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between text-sm text-zinc-400">
            <span>
              {WEEKDAYS[activeDayIndex]?.label} · {getDayDateLabel(weekStart, activeDayIndex)}
            </span>
            <span
              className={clsx(
                invalidTimeCount || conflictCount ? "text-red-300" : "text-green-300"
              )}
            >
              {invalidTimeCount
                ? `${invalidTimeCount} horas no válidas`
                : conflictCount
                  ? `${conflictCount} conflictos`
                  : "Sin conflictos"}
            </span>
          </div>

          <div
            className={clsx(
              "grid gap-3",
              isWeeklyMoviesPanelOpen ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"
            )}
          >
            <div className="min-w-0 overflow-x-auto pb-3">
              <div className="grid min-w-[1060px] grid-cols-5 gap-2">
                {state.rooms.map((room) => {
                  const roomScreenings = weekScreenings
                    .filter(
                      (screening) => screening.day === activeDay && screening.roomId === room.id
                    )
                    .sort(compareScreeningStartTimes);
                  const roomDropTarget =
                    placementState?.dropTarget?.roomId === room.id
                      ? placementState.dropTarget
                      : null;
                  const replacementScreening = roomDropTarget?.targetScreeningId
                    ? state.screenings.find(
                        (screening) => screening.id === roomDropTarget.targetScreeningId
                      )
                    : null;
                  const replacementLayout = replacementScreening
                    ? getScreeningTimelineLayout(replacementScreening, state.movies, timelineRange)
                    : null;
                  const dropPreviewTop = roomDropTarget
                    ? (replacementLayout?.top ??
                      getTimelineOffsetForMinutes(roomDropTarget.startMinutes, timelineRange))
                    : 0;
                  const dropPreviewHeight = roomDropTarget
                    ? Math.max(
                        34,
                        replacementLayout?.height ??
                          getTimelineOffsetForMinutes(
                            roomDropTarget.startMinutes + (placementMovie?.durationMinutes ?? 60),
                            timelineRange
                          ) -
                            getTimelineOffsetForMinutes(roomDropTarget.startMinutes, timelineRange)
                      )
                    : 0;

                  return (
                    <div key={room.id} className="rounded-md border border-babel-line bg-babel-panel">
                      <div className="grid grid-cols-[28px_1fr_28px] items-center border-b border-babel-line px-3 py-2">
                        <div aria-hidden="true" />
                        <h2 className="text-center text-base font-semibold tracking-wide text-white">
                          {room.name}
                        </h2>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-babel-red text-white transition hover:bg-red-600"
                          onClick={() => addScreening(room)}
                          title={`Añadir sesión en ${room.name}`}
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <div
                        data-timeline-room-id={room.id}
                        className="relative overflow-visible rounded-b-md bg-zinc-950/20"
                        style={{ height: timelineHeight }}
                        onClick={() => {
                          if (consumeDragClickSuppression()) return;
                          setSelectedScreeningId(null);
                        }}
                      >
                        {timelineHourMarks.map((hourMark) => (
                          <div
                            key={hourMark}
                            className="pointer-events-none absolute left-0 right-0"
                            style={{ top: getTimelineOffsetForMinutes(hourMark, timelineRange) }}
                          >
                            <div className="absolute left-12 right-0 top-0 z-0 border-t border-zinc-800/45" />
                            <span className="absolute left-1 top-[-7px] z-20 w-10 rounded bg-babel-panel/95 px-1 text-right text-[10px] tabular-nums text-zinc-500 ring-1 ring-zinc-900/70">
                              {formatTimelineTime(hourMark)}
                            </span>
                          </div>
                        ))}
                        {roomDropTarget ? (
                          <div
                            className={clsx(
                              "pointer-events-none absolute left-12 right-2 z-20 flex items-start rounded-md border border-dashed px-2 py-1 text-[11px] font-semibold shadow-lg",
                              roomDropTarget.status === "free" &&
                                "border-green-300/70 bg-green-500/15 text-green-100",
                              roomDropTarget.status === "replace" &&
                                "border-amber-300/80 bg-amber-500/20 text-amber-100",
                              roomDropTarget.status === "invalid" &&
                                "border-red-300/80 bg-red-500/20 text-red-100"
                            )}
                            style={{
                              height: dropPreviewHeight,
                              top: dropPreviewTop
                            }}
                          >
                            {roomDropTarget.status === "replace"
                              ? "Reemplazar"
                              : roomDropTarget.status === "invalid"
                                ? "No cabe ahí"
                                : roomDropTarget.startsAt}
                          </div>
                        ) : null}
                        {isLoading ? (
                          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                            <Loader2 className="animate-spin" size={18} />
                          </div>
                        ) : roomScreenings.length ? (
                          roomScreenings.map((screening) => {
                            const movie =
                              state.movies.find((item) => item.id === screening.movieId) ?? null;
                            const nextScreening = getNextScreeningForSameRoom(
                              screening,
                              weekScreenings
                            );
                            const gapInfo = getScreeningGapInfo({
                              movie,
                              nextScreening,
                              screening,
                              turnoverMinutes
                            });
                            const timelineLayout = getScreeningTimelineLayout(
                              screening,
                              state.movies,
                              timelineRange
                            );

                            return (
                              <ScreeningCard
                                key={screening.id}
                                accentColor={
                                  movie?.id
                                    ? (movieAccentColors.get(movie.id) ??
                                      FALLBACK_MOVIE_ACCENT_COLOR)
                                    : FALLBACK_MOVIE_ACCENT_COLOR
                                }
                                distributors={state.distributors}
                                gapInfo={gapInfo}
                                isDragging={dragState?.screeningId === screening.id}
                                isSelected={selectedScreeningId === screening.id}
                                movies={state.movies}
                                screening={screening}
                                screenings={weekScreenings}
                                timelineLayout={timelineLayout}
                                turnoverMinutes={turnoverMinutes}
                                onChange={(patch) => updateScreening(screening, patch)}
                                onCreateMovie={createMovieFromDraft}
                                onDelete={() => removeScreening(screening)}
                                onDragPointerDown={(event) => startScreeningDrag(screening, event)}
                                onSelect={() => setSelectedScreeningId(screening.id)}
                                shouldIgnoreSelectionClick={consumeDragClickSuppression}
                              />
                            );
                          })
                        ) : (
                          <div className="absolute left-12 right-2 top-2 flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-zinc-500">
                            Sin sesiones
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {isWeeklyMoviesPanelOpen ? (
              <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
                <WeeklyMoviesPanel
                  isSaving={saveState === "saving"}
                  movies={state.movies}
                  screenings={weekScreenings}
                  weekStart={weekStart}
                  weeklyMovieIds={weeklyMovieIds}
                  onAddMovie={(movieId) => void addMovieToWeek(movieId)}
                  onClose={() => setIsWeeklyMoviesPanelOpen(false)}
                  onRemoveMovie={(movieId) => void removeMovieFromWeek(movieId)}
                />
              </div>
            ) : null}
          </div>
        </section>
        ) : null}

        {activeSection === "movies" ? (
          <MoviePanel
            editingMovieId={editingMovieId}
            importDraft={importDraft}
            importSourceUrl={importSourceUrl}
            movieEditDraft={movieEditDraft}
            movieForm={movieForm}
            movieSearchError={movieSearchError}
            movieSearchQuery={movieSearchQuery}
            movieSearchResults={movieSearchResults}
            movieSearchState={movieSearchState}
            movieUsageCounts={movieUsageCounts}
            movies={state.movies}
            onCancelEditMovie={cancelEditMovie}
            onCreateImportedMovie={() => void createImportedMovie()}
            onCreateMovie={() => void createMovie()}
            onImportDraftChange={setImportDraft}
            onImportSourceUrlChange={setImportSourceUrl}
            onMovieEditDraftChange={setMovieEditDraft}
            onMovieFormChange={setMovieForm}
            onMovieSearchQueryChange={setMovieSearchQuery}
            onRemoveMovie={(movie) => void handleRemoveMovie(movie)}
            onSearchMovies={() => void searchMovies()}
            onStartEditMovie={startEditMovie}
            onStartImportMovie={startImportMovie}
            onUpdateMovie={(movie, draft) => void updateMovieFromDraft(movie, draft)}
          />
        ) : null}

      </div>
      {placementState && placementScreening ? (
        <div
          className={clsx(
            "pointer-events-none fixed z-[90] w-52 rounded-md border px-3 py-2 text-sm text-white shadow-2xl ring-1 ring-black/50",
            isPasteMode
              ? "border-green-300/25 bg-zinc-900/80 opacity-80"
              : "border-white/20 bg-zinc-900/95"
          )}
          style={{
            left: placementState.clientX + 12,
            top: placementState.clientY + 12
          }}
        >
          <div className="font-semibold tabular-nums">
            {isPasteMode ? "Pegar copia" : placementScreening.startsAt}
          </div>
          <div className="mt-1 truncate text-xs font-bold uppercase">
            {placementMovie?.title ?? "Película"}
          </div>
        </div>
      ) : null}
    </main>
      {printMode === "weekly" ? (
        <WeeklyPrintView
          movies={state.movies}
          rooms={state.rooms}
          screenings={state.screenings}
          turnoverMinutes={turnoverMinutes}
          weekStart={weekStart}
        />
      ) : (
        <FerminPdfView
          movies={state.movies}
          screenings={state.screenings}
          weekStart={weekStart}
        />
      )}
    </>
  );
}

function getWeekdayLabel(dayKey: WeekdayKey) {
  return WEEKDAYS.find((day) => day.key === dayKey)?.label ?? dayKey;
}

function upsertDistributor(distributors: Distributor[], distributor: Distributor) {
  return [
    ...distributors.filter((item) => item.id !== distributor.id),
    distributor
  ].sort((a, b) => a.name.localeCompare(b.name));
}

function areScreeningListsEqual(left: Screening[], right: Screening[]) {
  if (left.length !== right.length) return false;

  const leftById = new Map(left.map((screening) => [screening.id, screening]));

  return right.every((rightScreening) => {
    const leftScreening = leftById.get(rightScreening.id);

    return (
      leftScreening?.weekStart === rightScreening.weekStart &&
      leftScreening.day === rightScreening.day &&
      leftScreening.roomId === rightScreening.roomId &&
      leftScreening.movieId === rightScreening.movieId &&
      leftScreening.startsAt === rightScreening.startsAt
    );
  });
}

function areStringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}
