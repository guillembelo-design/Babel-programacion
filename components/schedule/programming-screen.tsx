"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Film,
  Loader2,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  compareScreeningStartTimes,
  getScreeningEndTime,
  getScreeningStatus,
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

type SaveState = "saved" | "saving" | "error";
type MovieSearchState = "idle" | "searching" | "error";

type MovieDraft = {
  title: string;
  durationMinutes: number;
  distributorName: string;
  distributorId: string | null;
};

const emptyMovieForm: MovieDraft = {
  title: "",
  durationMinutes: 100,
  distributorName: "",
  distributorId: null
};

type MovieSearchResult = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  year: string | null;
  durationMinutes: number | null;
};

type MovieSearchResponse = {
  results?: MovieSearchResult[];
  error?: string;
};

export function ProgrammingScreen() {
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

  useEffect(() => {
    let mounted = true;

    loadSchedule()
      .then((loadedState) => {
        if (!mounted) return;
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

  const putScreeningInState = (screening: Screening) => {
    setState((current) => ({
      ...current,
      screenings: [
        ...current.screenings.filter((item) => item.id !== screening.id),
        screening
      ].sort(compareScreeningStartTimes)
    }));
  };

  const persistScreening = async (screening: Screening) => {
    putScreeningInState(screening);

    if (!isValidScreeningTime(screening.startsAt)) {
      setSaveState("error");
      setSaveError("Hora no valida. Usa HH:mm.");
      return false;
    }

    return runSaving(() => saveScreening(screening));
  };

  const addScreening = (room: Room) => {
    const screening: Screening = {
      id: crypto.randomUUID(),
      weekStart,
      day: activeDay,
      roomId: room.id,
      movieId: selectableMovies[0]?.id ?? null,
      startsAt: "18:00"
    };

    void persistScreening(screening);
  };

  const updateScreening = (screening: Screening, patch: Partial<Screening>) => {
    void persistScreening({ ...screening, ...patch });
  };

  const removeScreening = async (screening: Screening) => {
    setState((current) => ({
      ...current,
      screenings: current.screenings.filter((item) => item.id !== screening.id)
    }));

    const saved = await runSaving(() => deleteScreening(screening.id));
    if (!saved) {
      putScreeningInState(screening);
    }
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
    const copies = sourceScreenings.map((screening) => ({
      ...screening,
      id: crypto.randomUUID(),
      day: duplicateTarget
    }));

    setState((current) => ({
      ...current,
      screenings: [
        ...current.screenings.filter((screening) => !existingTargetIds.includes(screening.id)),
        ...copies
      ].sort(compareScreeningStartTimes)
    }));

    const saved = await runSaving(async () => {
      await Promise.all([
        ...existingTargetIds.map((id) => deleteScreening(id)),
        ...copies.map((screening) => saveScreening(screening))
      ]);
    });

    if (!saved) {
      setState((current) => ({ ...current, screenings: previousScreenings }));
    }
  };

  const conflictCount = weekScreenings.filter(
    (screening) => getScreeningStatus(screening, weekScreenings, state.movies) === "conflict"
  ).length;
  const invalidTimeCount = weekScreenings.filter(
    (screening) => getScreeningStatus(screening, weekScreenings, state.movies) === "invalid"
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

function ScreeningCard({
  screening,
  screenings,
  distributors,
  movies,
  onChange,
  onCreateMovie,
  onDelete
}: {
  screening: Screening;
  screenings: Screening[];
  distributors: Distributor[];
  movies: Movie[];
  onChange: (patch: Partial<Screening>) => void;
  onCreateMovie: (draft: MovieDraft) => Promise<Movie | null>;
  onDelete: () => void;
}) {
  const [isEditingMovie, setIsEditingMovie] = useState(!screening.movieId);
  const status = getScreeningStatus(screening, screenings, movies);
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

function MoviePicker({
  selectedMovieId,
  distributors,
  movies,
  onSelect,
  onCreateMovie
}: {
  selectedMovieId: string | null;
  distributors: Distributor[];
  movies: Movie[];
  onSelect: (movieId: string | null) => void;
  onCreateMovie: (draft: MovieDraft) => Promise<Movie | null>;
}) {
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

function MovieDraftFields({
  draft,
  distributors,
  sourceUrl,
  onChange
}: {
  draft: MovieDraft;
  distributors: Distributor[];
  sourceUrl: string;
  onChange: (draft: MovieDraft) => void;
}) {
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

function MovieEditFields({
  draft,
  distributors,
  onChange
}: {
  draft: MovieDraft;
  distributors: Distributor[];
  onChange: (draft: MovieDraft) => void;
}) {
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

function DistributorInput({
  value,
  selectedDistributorId,
  distributors,
  onChange,
  onSelect,
  compact = false
}: {
  value: string;
  selectedDistributorId: string | null;
  distributors: Distributor[];
  onChange: (value: string) => void;
  onSelect: (distributor: Distributor) => void;
  compact?: boolean;
}) {
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

function DistributorManager({
  activeActionId,
  activeAction,
  distributors,
  editingDistributorId,
  isOpen,
  mergeTargetDistributorId,
  movieCounts,
  renameDraft,
  onCancelAction,
  onCancelRename,
  onDetachAndRemove,
  onMerge,
  onRequestMerge,
  onRemove,
  onRename,
  onRenameDraftChange,
  onSelectMergeTarget,
  onStartRename,
  onToggle
}: {
  activeActionId: string | null;
  activeAction: "remove" | "merge" | null;
  distributors: Distributor[];
  editingDistributorId: string | null;
  isOpen: boolean;
  mergeTargetDistributorId: string;
  movieCounts: Map<string, number>;
  renameDraft: string;
  onCancelAction: () => void;
  onCancelRename: () => void;
  onDetachAndRemove: (distributor: Distributor) => void;
  onMerge: (distributor: Distributor) => void;
  onRequestMerge: (distributor: Distributor) => void;
  onRemove: (distributor: Distributor) => void;
  onRename: (distributor: Distributor) => void;
  onRenameDraftChange: (value: string) => void;
  onSelectMergeTarget: (distributorId: string) => void;
  onStartRename: (distributor: Distributor) => void;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-md border border-babel-line bg-babel-panel p-4">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onToggle}
      >
        <span>
          <span className="block font-medium">Distribuidoras</span>
          <span className="text-xs text-zinc-500">{distributors.length} registradas</span>
        </span>
        <span className="rounded border border-babel-line px-2 py-1 text-xs text-zinc-300">
          {isOpen ? "Ocultar" : "Ver"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-2">
          {distributors.length ? (
            distributors.map((distributor) => {
              const usageCount = movieCounts.get(distributor.id) ?? 0;
              const isEditing = editingDistributorId === distributor.id;
              const isActionOpen = activeActionId === distributor.id;
              const isMergeOpen = isActionOpen && activeAction === "merge";
              const isRemoveOpen = isActionOpen && activeAction === "remove";
              const mergeTargets = distributors.filter((item) => item.id !== distributor.id);

              return (
                <div key={distributor.id} className="rounded-md bg-babel-card p-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={renameDraft}
                        onChange={(event) => onRenameDraftChange(event.target.value)}
                        className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-sm text-white outline-none transition focus:border-babel-red"
                      />
                      <div className="flex gap-2">
                        <button
                          className="h-8 flex-1 rounded bg-babel-red px-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onRename(distributor)}
                          disabled={!renameDraft.trim()}
                        >
                          Guardar
                        </button>
                        <button
                          className="h-8 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                          onClick={onCancelRename}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {distributor.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {usageCount === 1
                              ? "1 pelicula"
                              : `${usageCount} peliculas`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <button
                            className="h-7 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            onClick={() => onStartRename(distributor)}
                          >
                            Editar
                          </button>
                          <button
                            className="h-7 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => onRequestMerge(distributor)}
                            disabled={mergeTargets.length === 0}
                          >
                            Fusionar
                          </button>
                          <button
                            className="h-7 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:border-red-500 hover:bg-red-950/30 hover:text-white"
                            onClick={() => onRemove(distributor)}
                          >
                            Borrar
                          </button>
                        </div>
                      </div>

                      {isRemoveOpen && usageCount > 0 ? (
                        <div className="mt-2 space-y-2 rounded border border-red-500/40 bg-red-950/20 p-2">
                          <p className="text-xs text-red-200">
                            Esta distribuidora esta usada en {usageCount}{" "}
                            {usageCount === 1 ? "pelicula" : "peliculas"}.
                          </p>
                          <button
                            className="h-8 w-full rounded border border-babel-line px-2 text-xs text-zinc-200 transition hover:border-red-500 hover:bg-red-950/40"
                            onClick={() => onDetachAndRemove(distributor)}
                          >
                            Quitar distribuidora de esas peliculas
                          </button>
                          <button
                            className="h-8 w-full rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            onClick={onCancelAction}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}

                      {isMergeOpen ? (
                        <div className="mt-2 space-y-2 rounded border border-babel-line bg-zinc-950/30 p-2">
                          <p className="text-xs text-zinc-400">
                            Mover {usageCount}{" "}
                            {usageCount === 1 ? "pelicula" : "peliculas"} a:
                          </p>
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <select
                              value={mergeTargetDistributorId}
                              onChange={(event) => onSelectMergeTarget(event.target.value)}
                              className="h-8 min-w-0 rounded border border-babel-line bg-zinc-950/40 px-2 text-xs text-white outline-none transition focus:border-babel-red"
                            >
                              {mergeTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="h-8 rounded bg-white px-2 text-xs font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => onMerge(distributor)}
                              disabled={!mergeTargets.length || !mergeTargetDistributorId}
                            >
                              Confirmar
                            </button>
                          </div>
                          <button
                            className="h-8 w-full rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            onClick={onCancelAction}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
              Sin distribuidoras
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function StatusBadge({
  isConfigured,
  saveError,
  saveState
}: {
  isConfigured: boolean;
  saveError: string;
  saveState: SaveState;
}) {
  const label =
    saveState === "saving"
      ? "Guardando"
      : saveState === "error"
        ? "Error al guardar"
        : isConfigured
          ? "Supabase guardado"
          : "Local guardado";

  return (
    <div
      className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-xs text-zinc-300"
      title={saveError}
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          saveState === "saving" && "bg-yellow-300",
          saveState === "saved" && "bg-green-400",
          saveState === "error" && "bg-red-400"
        )}
      />
      {label}
    </div>
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

function getDistributorName(distributors: Distributor[], distributorId: string | null) {
  if (!distributorId) return "";
  return distributors.find((distributor) => distributor.id === distributorId)?.name ?? "";
}

function getDistributorSuggestions(distributors: Distributor[], value: string) {
  const normalizedValue = normalizeDistributorName(value);

  if (!normalizedValue) {
    return [];
  }

  return distributors
    .filter(
      (distributor) =>
        distributor.normalizedName.includes(normalizedValue) ||
        normalizedValue.includes(distributor.normalizedName)
    )
    .slice(0, 3);
}

function getFilmAffinitySearchUrl(title: string) {
  return `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(title.trim())}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}
