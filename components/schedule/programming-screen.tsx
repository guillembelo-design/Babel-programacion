"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Film,
  Loader2,
  Plus,
  Trash2
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { getScreeningEndTime, getScreeningStatus } from "@/lib/schedule/conflicts";
import { getDayDateLabel, getFridayWeekStart, getWeekLabel, shiftWeek, toDateKey } from "@/lib/schedule/dates";
import {
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
  loadSchedule,
  saveMovie,
  saveRooms,
  saveScreening
} from "@/lib/schedule/store";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const emptyMovieForm = {
  title: "",
  durationMinutes: 100,
  posterUrl: ""
};

export function ProgrammingScreen() {
  const [weekStart, setWeekStart] = useState(() => toDateKey(getFridayWeekStart()));
  const [state, setState] = useState<ScheduleState>({
    rooms: INITIAL_ROOMS,
    movies: [],
    screenings: []
  });
  const [activeDay, setActiveDay] = useState<WeekdayKey>("friday");
  const [duplicateTarget, setDuplicateTarget] = useState<WeekdayKey>("saturday");
  const [movieForm, setMovieForm] = useState(emptyMovieForm);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  useEffect(() => {
    let mounted = true;

    loadSchedule().then((loadedState) => {
      if (!mounted) return;
      setState(loadedState);
      setIsLoading(false);
      if (!loadedState.rooms.length) {
        saveRooms(INITIAL_ROOMS);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (duplicateTarget === activeDay) {
      setDuplicateTarget(WEEKDAYS.find((day) => day.key !== activeDay)?.key ?? "friday");
    }
  }, [activeDay, duplicateTarget]);

  const weekScreenings = useMemo(
    () => state.screenings.filter((screening) => screening.weekStart === weekStart),
    [state.screenings, weekStart]
  );

  const activeDayIndex = WEEKDAYS.findIndex((day) => day.key === activeDay);

  const persistScreening = async (screening: Screening) => {
    setSaveState("saving");
    setState((current) => ({
      ...current,
      screenings: [
        ...current.screenings.filter((item) => item.id !== screening.id),
        screening
      ].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    }));
    await saveScreening(screening);
    setSaveState("saved");
  };

  const addScreening = (room: Room) => {
    const screening: Screening = {
      id: crypto.randomUUID(),
      weekStart,
      day: activeDay,
      roomId: room.id,
      movieId: state.movies[0]?.id ?? null,
      startsAt: "18:00"
    };

    void persistScreening(screening);
  };

  const updateScreening = (screening: Screening, patch: Partial<Screening>) => {
    void persistScreening({ ...screening, ...patch });
  };

  const removeScreening = async (screeningId: string) => {
    setSaveState("saving");
    setState((current) => ({
      ...current,
      screenings: current.screenings.filter((item) => item.id !== screeningId)
    }));
    await deleteScreening(screeningId);
    setSaveState("saved");
  };

  const createMovie = async () => {
    const title = movieForm.title.trim();
    if (!title) return;

    const movie: Movie = {
      id: crypto.randomUUID(),
      title,
      durationMinutes: Number(movieForm.durationMinutes),
      posterUrl: movieForm.posterUrl.trim()
    };

    setSaveState("saving");
    setState((current) => ({
      ...current,
      movies: [...current.movies, movie].sort((a, b) => a.title.localeCompare(b.title))
    }));
    setMovieForm(emptyMovieForm);
    await saveMovie(movie);
    setSaveState("saved");
  };

  const duplicateDay = async () => {
    if (duplicateTarget === activeDay) return;

    const sourceScreenings = weekScreenings.filter((screening) => screening.day === activeDay);
    const existingTargetIds = state.screenings
      .filter((screening) => screening.weekStart === weekStart && screening.day === duplicateTarget)
      .map((screening) => screening.id);

    setSaveState("saving");
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
      ]
    }));

    await Promise.all([
      ...existingTargetIds.map((id) => deleteScreening(id)),
      ...copies.map((screening) => saveScreening(screening))
    ]);
    setSaveState("saved");
  };

  const conflictCount = weekScreenings.filter(
    (screening) => getScreeningStatus(screening, weekScreenings, state.movies) === "conflict"
  ).length;

  return (
    <main className="min-h-screen bg-babel-bg text-white">
      <div className="border-b border-babel-line bg-babel-bg/92 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-babel-red">
              Cines Babel
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">
              Programacion
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge isConfigured={isSupabaseConfigured} saveState={saveState} />
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-babel-line bg-babel-panel text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card"
              onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
              title="Semana anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-4 text-sm text-zinc-200">
              <CalendarDays size={16} className="text-babel-red" />
              {getWeekLabel(weekStart)}
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-babel-line bg-babel-panel text-zinc-200 transition hover:border-zinc-500 hover:bg-babel-card"
              onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
              title="Semana siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-5 py-5 xl:grid-cols-[1fr_320px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto rounded-md border border-babel-line bg-babel-panel p-1">
              {WEEKDAYS.map((day, index) => (
                <button
                  key={day.key}
                  className={clsx(
                    "min-w-[108px] rounded px-3 py-2 text-left text-sm transition",
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
              <select
                value={duplicateTarget}
                onChange={(event) => setDuplicateTarget(event.target.value as WeekdayKey)}
                className="h-10 rounded-md border border-babel-line bg-babel-panel px-3 text-sm text-white outline-none transition focus:border-babel-red"
              >
                {WEEKDAYS.filter((day) => day.key !== activeDay).map((day) => (
                  <option key={day.key} value={day.key}>
                    {day.label}
                  </option>
                ))}
              </select>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
                onClick={duplicateDay}
              >
                <Copy size={16} />
                Duplicar dia
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between text-sm text-zinc-400">
            <span>
              {WEEKDAYS[activeDayIndex]?.label} · {getDayDateLabel(weekStart, activeDayIndex)}
            </span>
            <span className={conflictCount ? "text-red-300" : "text-green-300"}>
              {conflictCount ? `${conflictCount} conflictos` : "Sin conflictos"}
            </span>
          </div>

          <div className="grid min-w-[1060px] grid-cols-5 gap-3 overflow-x-auto pb-4">
            {state.rooms.map((room) => {
              const roomScreenings = weekScreenings
                .filter((screening) => screening.day === activeDay && screening.roomId === room.id)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

              return (
                <div key={room.id} className="rounded-md border border-babel-line bg-babel-panel">
                  <div className="flex items-center justify-between border-b border-babel-line px-3 py-3">
                    <h2 className="font-medium">{room.name}</h2>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-babel-red text-white transition hover:bg-red-600"
                      onClick={() => addScreening(room)}
                      title={`Anadir sesion en ${room.name}`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="space-y-3 p-3">
                    {isLoading ? (
                      <div className="flex h-32 items-center justify-center text-zinc-500">
                        <Loader2 className="animate-spin" size={18} />
                      </div>
                    ) : roomScreenings.length ? (
                      roomScreenings.map((screening) => (
                        <ScreeningCard
                          key={screening.id}
                          movies={state.movies}
                          screening={screening}
                          screenings={weekScreenings}
                          onChange={(patch) => updateScreening(screening, patch)}
                          onDelete={() => removeScreening(screening.id)}
                        />
                      ))
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-zinc-500">
                        Sin sesiones
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-babel-line bg-babel-panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <Film size={18} className="text-babel-red" />
              <h2 className="font-medium">Peliculas</h2>
            </div>

            <div className="space-y-3">
              <input
                value={movieForm.title}
                onChange={(event) => setMovieForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Titulo"
                className="h-10 w-full rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
              />
              <div className="grid grid-cols-[110px_1fr] gap-2">
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
                  className="h-10 rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition focus:border-babel-red"
                />
                <input
                  value={movieForm.posterUrl}
                  onChange={(event) =>
                    setMovieForm((current) => ({ ...current, posterUrl: event.target.value }))
                  }
                  placeholder="URL cartel"
                  className="h-10 rounded-md border border-babel-line bg-babel-card px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-babel-red"
                />
              </div>
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
              {state.movies.map((movie) => (
                <div key={movie.id} className="flex gap-3 rounded-md bg-babel-card p-2">
                  <Poster movie={movie} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{movie.title}</p>
                    <p className="text-xs text-zinc-400">{movie.durationMinutes} min</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ScreeningCard({
  screening,
  screenings,
  movies,
  onChange,
  onDelete
}: {
  screening: Screening;
  screenings: Screening[];
  movies: Movie[];
  onChange: (patch: Partial<Screening>) => void;
  onDelete: () => void;
}) {
  const status = getScreeningStatus(screening, screenings, movies);
  const movie = movies.find((item) => item.id === screening.movieId);
  const endTime = getScreeningEndTime(screening, movies);

  return (
    <article
      className={clsx(
        "rounded-md border p-3 transition",
        status === "conflict" && "border-red-500/70 bg-red-950/30",
        status === "valid" && "border-green-500/60 bg-green-950/20",
        status === "empty" && "border-zinc-700 bg-babel-card"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          <Poster movie={movie} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{movie?.title ?? "Sin pelicula"}</p>
            <p className="text-xs text-zinc-400">
              {movie ? `${movie.durationMinutes} min + limpieza` : "Selecciona una pelicula"}
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          onClick={onDelete}
          title="Eliminar sesion"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="space-y-2">
        <input
          type="time"
          value={screening.startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value })}
          className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-sm text-white outline-none transition focus:border-babel-red"
        />
        <select
          value={screening.movieId ?? ""}
          onChange={(event) => onChange({ movieId: event.target.value || null })}
          className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-sm text-white outline-none transition focus:border-babel-red"
        >
          <option value="">Seleccionar pelicula</option>
          {movies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span
          className={clsx(
            status === "conflict" && "text-red-300",
            status === "valid" && "text-green-300",
            status === "empty" && "text-zinc-400"
          )}
        >
          {status === "conflict" ? "Conflicto" : status === "valid" ? "Correcta" : "Pendiente"}
        </span>
        <span className="text-zinc-400">{endTime ? `Fin ${endTime}` : ""}</span>
      </div>
    </article>
  );
}

function Poster({ movie }: { movie?: Movie }) {
  if (!movie?.posterUrl) {
    return (
      <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
        <Film size={16} />
      </div>
    );
  }

  return (
    <Image
      src={movie.posterUrl}
      alt={movie.title}
      width={40}
      height={56}
      className="h-14 w-10 shrink-0 rounded object-cover"
    />
  );
}

function StatusBadge({
  isConfigured,
  saveState
}: {
  isConfigured: boolean;
  saveState: "saved" | "saving";
}) {
  return (
    <div className="inline-flex h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 text-xs text-zinc-300">
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          saveState === "saving" ? "bg-yellow-300" : "bg-green-400"
        )}
      />
      {saveState === "saving" ? "Guardando" : isConfigured ? "Supabase" : "Local"}
    </div>
  );
}
