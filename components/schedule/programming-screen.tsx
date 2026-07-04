"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Film,
  Loader2,
  LogOut,
  Plus,
  Search
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
import { getNextScreeningStartTime } from "@/lib/schedule/screenings";
import {
  deleteScreening,
  deleteDistributor,
  detachAndDeleteDistributor,
  findOrCreateDistributor,
  loadSchedule,
  mergeDistributors,
  normalizeDistributorName,
  removeMovie,
  saveMovie,
  saveRooms,
  saveScreening,
  updateDistributor
} from "@/lib/schedule/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { DistributorManager } from "@/components/distributors/distributor-manager";
import {
  DistributorInput,
  MovieDraftFields,
  MovieEditFields
} from "@/components/movies/movie-fields";
import { getDistributorName } from "@/components/movies/movie-utils";
import {
  emptyMovieForm,
  MovieDraft,
  MovieSearchResponse,
  MovieSearchResult,
  MovieSearchState
} from "@/components/movies/types";
import { ScreeningCard } from "./screening-card";
import { SaveState, StatusBadge } from "./status-badge";

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
  const [isMoviePanelOpen, setIsMoviePanelOpen] = useState(false);
  const [isDistributorPanelOpen, setIsDistributorPanelOpen] = useState(false);
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

  const rememberPersistedScreenings = useCallback((screenings: Screening[]) => {
    persistedScreeningsRef.current = [...screenings].sort(compareScreeningStartTimes);
  }, []);

  useEffect(() => {
    let mounted = true;

    loadSchedule()
      .then((loadedState) => {
        if (!mounted) return;
        rememberPersistedScreenings(loadedState.screenings);
        setState(loadedState);
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
  }, [rememberPersistedScreenings]);

  useEffect(() => {
    if (duplicateTarget === duplicateSource) {
      setDuplicateTarget(WEEKDAYS.find((day) => day.key !== duplicateSource)?.key ?? "friday");
    }
  }, [duplicateSource, duplicateTarget]);

  const weekScreenings = useMemo(
    () => state.screenings.filter((screening) => screening.weekStart === weekStart),
    [state.screenings, weekStart]
  );

  const selectableMovies = useMemo(
    () => state.movies.filter((movie) => !movie.retiredAt),
    [state.movies]
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
      `Hay menos de ${conflict.turnoverMinutes} minutos entre sesiones. Anterior termina a las ${conflict.previousEndsAt}. Con ${conflict.turnoverMinutes} min de margen, esta sesion deberia empezar a partir de las ${conflict.minimumStartAt}. Margen real: ${conflict.actualGapMinutes} min. Quieres guardar igualmente?`
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
      setSaveError("Hora no valida. Usa HH:mm.");
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
    return true;
  };

  const addScreening = (room: Room) => {
    const screening: Screening = {
      id: crypto.randomUUID(),
      weekStart,
      day: activeDay,
      roomId: room.id,
      movieId: selectableMovies[0]?.id ?? null,
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
  };

  const resolveDistributorFromDraft = async (draft: MovieDraft) => {
    const distributorName = draft.distributorName.trim();
    const normalizedName = normalizeDistributorName(distributorName);

    if (!distributorName || !normalizedName) {
      return null;
    }

    const selectedDistributor = draft.distributorId
      ? state.distributors.find((distributor) => distributor.id === draft.distributorId)
      : null;

    if (selectedDistributor?.normalizedName === normalizedName) {
      return selectedDistributor;
    }

    const existingDistributor = state.distributors.find(
      (distributor) => distributor.normalizedName === normalizedName
    );

    if (existingDistributor) {
      return existingDistributor;
    }

    return findOrCreateDistributor(distributorName);
  };

  const createMovieFromDraft = async (draft: MovieDraft) => {
    const title = draft.title.trim();
    const durationMinutes = Number(draft.durationMinutes);

    if (!title || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setSaveState("error");
      setSaveError("Introduce titulo y duracion validos.");
      return null;
    }

    setSaveState("saving");
    setSaveError("");

    try {
      const distributor = await resolveDistributorFromDraft(draft);
      const movie: Movie = {
        id: crypto.randomUUID(),
        title,
        durationMinutes,
        posterUrl: "",
        distributorId: distributor?.id ?? null,
        retiredAt: null
      };

      await saveMovie(movie);

      setState((current) => ({
        ...current,
        distributors: distributor
          ? upsertDistributor(current.distributors, distributor)
          : current.distributors,
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
    const distributor = movie.distributorId
      ? state.distributors.find((item) => item.id === movie.distributorId)
      : null;

    setEditingMovieId(movie.id);
    setMovieEditDraft({
      title: movie.title,
      durationMinutes: movie.durationMinutes,
      distributorName: distributor?.name ?? "",
      distributorId: distributor?.id ?? null
    });
  };

  const cancelEditMovie = () => {
    setEditingMovieId(null);
    setMovieEditDraft(emptyMovieForm);
  };

  const updateMovieFromDraft = async (movie: Movie, draft: MovieDraft) => {
    const title = draft.title.trim();
    const durationMinutes = Number(draft.durationMinutes);

    if (!title || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setSaveState("error");
      setSaveError("Introduce titulo y duracion validos.");
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
      const distributor = await resolveDistributorFromDraft(draft);
      const updatedMovie: Movie = {
        ...movie,
        title,
        durationMinutes,
        distributorId: distributor?.id ?? null
      };

      await saveMovie(updatedMovie);

      setState((current) => ({
        ...current,
        distributors: distributor
          ? upsertDistributor(current.distributors, distributor)
          : current.distributors,
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
      distributorName: "",
      distributorId: null
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
        ? `Retirar "${movie.title}" del selector. Las sesiones existentes conservaran la pelicula.`
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
      const loadedState = await loadSchedule();
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
      setSaveError("Elige una distribuidora destino valida.");
      return;
    }

    const usageCount = distributorMovieCounts.get(sourceDistributor.id) ?? 0;
    const confirmed = window.confirm(
      `Fusionar "${sourceDistributor.name}" en "${targetDistributor.name}". Se moveran ${usageCount} peliculas y se borrara la distribuidora origen.`
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
      setSaveError("El dia origen no tiene sesiones.");
      return;
    }

    const sourceLabel = getWeekdayLabel(duplicateSource);
    const targetLabel = getWeekdayLabel(duplicateTarget);
    const confirmed = window.confirm(
      `Duplicar ${sourceLabel} sobre ${targetLabel}. Se sustituiran ${existingTargetIds.length} sesiones del dia destino.`
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
  };

  const conflictCount = weekScreenings.filter(
    (screening) =>
      getScreeningStatus(screening, weekScreenings, state.movies, turnoverMinutes) === "conflict"
  ).length;
  const invalidTimeCount = weekScreenings.filter(
    (screening) =>
      getScreeningStatus(screening, weekScreenings, state.movies, turnoverMinutes) === "invalid"
  ).length;

  return (
    <main className="min-h-screen bg-babel-bg text-white">
      <div className="border-b border-babel-line bg-babel-bg/92 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-babel-red">
              Cines Babel
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal md:text-2xl">
              Programacion
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              isConfigured={isSupabaseConfigured}
              saveError={saveError}
              saveState={saveState}
            />
            {onSignOut ? (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-babel-card hover:text-white disabled:cursor-not-allowed disabled:text-zinc-500"
                onClick={() => void onSignOut()}
                disabled={isSigningOut}
                title={userEmail ? `Sesion: ${userEmail}` : "Cerrar sesion"}
              >
                {isSigningOut ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <LogOut size={14} />
                )}
                {isSigningOut ? "Saliendo" : "Cerrar sesion"}
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

      <div
        className={clsx(
          "mx-auto grid max-w-[1600px] gap-4 px-4 py-3",
          isMoviePanelOpen ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-1"
        )}
      >
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
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card"
                onClick={() => setIsMoviePanelOpen((current) => !current)}
              >
                <Film size={16} className="text-babel-red" />
                {isMoviePanelOpen ? "Ocultar" : "Gestionar peliculas"}
              </button>

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
                ? `${invalidTimeCount} horas no validas`
                : conflictCount
                  ? `${conflictCount} conflictos`
                  : "Sin conflictos"}
            </span>
          </div>

          <div className="grid min-w-[1060px] grid-cols-5 gap-2 overflow-x-auto pb-3">
            {state.rooms.map((room) => {
              const roomScreenings = weekScreenings
                .filter((screening) => screening.day === activeDay && screening.roomId === room.id)
                .sort(compareScreeningStartTimes);

              return (
                <div key={room.id} className="rounded-md border border-babel-line bg-babel-panel">
                  <div className="flex items-center justify-between border-b border-babel-line px-3 py-2">
                    <h2 className="font-medium">{room.name}</h2>
                    <button
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-babel-red text-white transition hover:bg-red-600"
                      onClick={() => addScreening(room)}
                      title={`Anadir sesion en ${room.name}`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="space-y-2 p-2">
                    {isLoading ? (
                      <div className="flex h-24 items-center justify-center text-zinc-500">
                        <Loader2 className="animate-spin" size={18} />
                      </div>
                    ) : roomScreenings.length ? (
                      roomScreenings.map((screening) => (
                        <ScreeningCard
                          key={screening.id}
                          distributors={state.distributors}
                          movies={state.movies}
                          screening={screening}
                          screenings={weekScreenings}
                          turnoverMinutes={turnoverMinutes}
                          onChange={(patch) => updateScreening(screening, patch)}
                          onCreateMovie={createMovieFromDraft}
                          onDelete={() => removeScreening(screening)}
                        />
                      ))
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-zinc-500">
                        Sin sesiones
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {isMoviePanelOpen ? (
          <aside className="space-y-4">
            <section className="rounded-md border border-babel-line bg-babel-panel p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Film size={18} className="text-babel-red" />
                  <h2 className="font-medium">Peliculas</h2>
                </div>
                <button
                  className="rounded px-2 py-1 text-xs text-zinc-400 transition hover:bg-babel-card hover:text-white"
                  onClick={() => setIsMoviePanelOpen(false)}
                >
                  Ocultar
                </button>
              </div>

              <div className="space-y-3 border-b border-babel-line pb-4">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    Buscar pelicula
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={movieSearchQuery}
                      onChange={(event) => setMovieSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void searchMovies();
                        }
                      }}
                      placeholder="Titulo de pelicula"
                      className="h-10 min-w-0 flex-1 rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
                    />
                    <button
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-babel-red text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void searchMovies()}
                      disabled={movieSearchState === "searching"}
                      title="Buscar pelicula"
                    >
                      {movieSearchState === "searching" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                    </button>
                  </div>
                  {movieSearchState === "error" ? (
                    <p className="mt-2 text-xs text-red-300">{movieSearchError}</p>
                  ) : null}
                </div>

                {movieSearchResults.length ? (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {movieSearchResults.map((result) => (
                      <button
                        key={result.sourceId}
                        className="w-full rounded-md border border-babel-line bg-babel-card p-2 text-left transition hover:border-zinc-500"
                        onClick={() => startImportMovie(result)}
                      >
                        <span className="block truncate text-sm font-medium text-white">
                          {result.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-400">
                          {result.year ?? "Ano no disponible"} ·{" "}
                          {result.durationMinutes
                            ? `${result.durationMinutes} min`
                            : "Duracion pendiente"}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          Wikidata
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {importDraft ? (
                  <div className="rounded-md border border-babel-red/50 bg-red-950/20 p-3">
                    <p className="mb-3 text-sm font-medium text-white">
                      Es esta la pelicula?
                    </p>
                    <MovieDraftFields
                      distributors={state.distributors}
                      draft={importDraft}
                      sourceUrl={importSourceUrl}
                      onChange={(draft) => setImportDraft(draft)}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-babel-red px-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void createImportedMovie()}
                        disabled={!importDraft.title.trim() || Number(importDraft.durationMinutes) <= 0}
                      >
                        <Check size={15} />
                        Importar
                      </button>
                      <button
                        className="h-9 rounded-md border border-babel-line px-3 text-sm text-zinc-300 transition hover:bg-babel-card hover:text-white"
                        onClick={() => {
                          setImportDraft(null);
                          setImportSourceUrl("");
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
                  onChange={(event) =>
                    setMovieForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Titulo"
                  className="h-10 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
                />
                <input
                  type="number"
                  min="1"
                  value={movieForm.durationMinutes}
                  onChange={(event) =>
                    setMovieForm((current) => ({
                      ...current,
                      durationMinutes: Number(event.target.value)
                    }))
                  }
                  className="h-10 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition focus:border-babel-red"
                />
                <DistributorInput
                  distributors={state.distributors}
                  value={movieForm.distributorName}
                  selectedDistributorId={movieForm.distributorId}
                  onChange={(distributorName) =>
                    setMovieForm((current) => ({
                      ...current,
                      distributorName,
                      distributorId: null
                    }))
                  }
                  onSelect={(distributor) =>
                    setMovieForm((current) => ({
                      ...current,
                      distributorName: distributor.name,
                      distributorId: distributor.id
                    }))
                  }
                />
                <button
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-babel-red px-3 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={createMovie}
                  disabled={!movieForm.title.trim()}
                >
                  <Plus size={16} />
                  Anadir pelicula
                </button>
              </div>
            </section>

            <section className="rounded-md border border-babel-line bg-babel-panel p-4">
              <h2 className="mb-3 font-medium">Catalogo</h2>
              <div className="space-y-2">
                {state.movies.length ? (
                  state.movies.map((movie) => {
                    const usageCount = movieUsageCounts.get(movie.id) ?? 0;
                    const canDelete = usageCount === 0;
                    const isRetired = Boolean(movie.retiredAt);
                    const distributorName = getDistributorName(
                      state.distributors,
                      movie.distributorId
                    );
                    const isEditingMovie = editingMovieId === movie.id;
                    const buttonLabel = canDelete
                      ? "Borrar"
                      : isRetired
                        ? "Retirada"
                        : "Retirar pelicula";

                    return (
                      <div key={movie.id} className="rounded-md bg-babel-card p-2">
                        {isEditingMovie ? (
                          <div className="space-y-2">
                            <MovieEditFields
                              distributors={state.distributors}
                              draft={movieEditDraft}
                              onChange={setMovieEditDraft}
                            />
                            <div className="flex gap-2">
                              <button
                                className="h-8 flex-1 rounded bg-babel-red px-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => void updateMovieFromDraft(movie, movieEditDraft)}
                                disabled={
                                  !movieEditDraft.title.trim() ||
                                  Number(movieEditDraft.durationMinutes) <= 0
                                }
                              >
                                Guardar
                              </button>
                              <button
                                className="h-8 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                onClick={cancelEditMovie}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="truncate text-sm font-medium text-white">
                              {movie.title}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {movie.durationMinutes} min
                              {usageCount ? ` · ${usageCount} sesiones` : ""}
                            </p>
                            {distributorName ? (
                              <p className="truncate text-xs text-zinc-500">{distributorName}</p>
                            ) : null}
                            {isRetired ? (
                              <p className="mt-1 text-xs text-zinc-500">Retirada del selector</p>
                            ) : null}
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <button
                                className="h-8 rounded border border-babel-line text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                onClick={() => startEditMovie(movie)}
                              >
                                Editar
                              </button>
                              <button
                                className="h-8 rounded border border-babel-line text-xs text-zinc-300 transition hover:border-red-500 hover:bg-red-950/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => handleRemoveMovie(movie)}
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
                    Sin peliculas
                  </div>
                )}
              </div>
            </section>

            <DistributorManager
              activeActionId={activeDistributorActionId}
              activeAction={activeDistributorAction}
              distributors={state.distributors}
              editingDistributorId={editingDistributorId}
              isOpen={isDistributorPanelOpen}
              mergeTargetDistributorId={mergeTargetDistributorId}
              movieCounts={distributorMovieCounts}
              renameDraft={distributorRenameDraft}
              onCancelAction={() => {
                setActiveDistributorActionId(null);
                setActiveDistributorAction(null);
                setMergeTargetDistributorId("");
              }}
              onCancelRename={cancelRenameDistributor}
              onDetachAndRemove={detachMoviesAndRemoveDistributor}
              onMerge={mergeDistributorIntoTarget}
              onRequestMerge={requestMergeDistributor}
              onRemove={requestRemoveDistributor}
              onRename={renameDistributor}
              onRenameDraftChange={setDistributorRenameDraft}
              onSelectMergeTarget={setMergeTargetDistributorId}
              onStartRename={startRenameDistributor}
              onToggle={() => setIsDistributorPanelOpen((current) => !current)}
            />
          </aside>
        ) : null}
      </div>
    </main>
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}
