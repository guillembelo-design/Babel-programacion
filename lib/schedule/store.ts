"use client";

import { supabase } from "@/lib/supabase/client";
import {
  INITIAL_MOVIES,
  INITIAL_ROOMS,
  Movie,
  Room,
  ScheduleState,
  Screening
} from "./types";

const STORAGE_KEY = "babel-programacion-v1";

type DatabaseMovie = {
  id: string;
  title: string;
  duration_minutes: number;
  poster_url: string | null;
  retired_at: string | null;
};

type DatabaseScreening = {
  id: string;
  week_start: string;
  day: Screening["day"];
  room_id: string;
  movie_id: string | null;
  starts_at: string;
};

const mapMovieFromDatabase = (movie: DatabaseMovie): Movie => ({
  id: movie.id,
  title: movie.title,
  durationMinutes: movie.duration_minutes,
  posterUrl: movie.poster_url ?? "",
  retiredAt: movie.retired_at
});

const mapScreeningFromDatabase = (screening: DatabaseScreening): Screening => ({
  id: screening.id,
  weekStart: screening.week_start,
  day: screening.day,
  roomId: screening.room_id,
  movieId: screening.movie_id,
  startsAt: screening.starts_at.slice(0, 5)
});

export async function loadSchedule(): Promise<ScheduleState> {
  if (!supabase) {
    return loadLocalSchedule();
  }

  const [roomsResponse, moviesResponse, screeningsResponse] = await Promise.all([
    supabase.from("rooms").select("id,name,position").order("position"),
    supabase.from("movies").select("id,title,duration_minutes,poster_url,retired_at").order("title"),
    supabase
      .from("screenings")
      .select("id,week_start,day,room_id,movie_id,starts_at")
      .order("starts_at")
  ]);

  assertSupabaseResult(roomsResponse.error, "No se pudieron cargar las salas");
  assertSupabaseResult(moviesResponse.error, "No se pudieron cargar las peliculas");
  assertSupabaseResult(screeningsResponse.error, "No se pudieron cargar las sesiones");

  return {
    rooms: roomsResponse.data?.length ? (roomsResponse.data as Room[]) : INITIAL_ROOMS,
    movies: moviesResponse.data?.length
      ? (moviesResponse.data as DatabaseMovie[]).map(mapMovieFromDatabase)
      : INITIAL_MOVIES,
    screenings: screeningsResponse.data?.length
      ? (screeningsResponse.data as DatabaseScreening[]).map(mapScreeningFromDatabase)
      : []
  };
}

export async function saveRooms(rooms: Room[]) {
  if (!supabase) {
    saveLocalPatch({ rooms });
    return;
  }

  const { error } = await supabase.from("rooms").upsert(rooms, { onConflict: "id" });
  assertSupabaseResult(error, "No se pudieron guardar las salas");
  saveLocalPatch({ rooms });
}

export async function saveMovie(movie: Movie) {
  if (!supabase) {
    saveLocalMovie(movie);
    return;
  }

  const { error } = await supabase.from("movies").upsert(
    {
      id: movie.id,
      title: movie.title,
      duration_minutes: movie.durationMinutes,
      poster_url: movie.posterUrl || null,
      retired_at: movie.retiredAt
    },
    { onConflict: "id" }
  );
  assertSupabaseResult(error, "No se pudo guardar la pelicula");
  saveLocalMovie(movie);
}

export async function saveScreening(screening: Screening) {
  if (!supabase) {
    saveLocalScreening(screening);
    return;
  }

  const { error } = await supabase.from("screenings").upsert(
    {
      id: screening.id,
      week_start: screening.weekStart,
      day: screening.day,
      room_id: screening.roomId,
      movie_id: screening.movieId,
      starts_at: screening.startsAt
    },
    { onConflict: "id" }
  );
  assertSupabaseResult(error, "No se pudo guardar la sesion");
  saveLocalScreening(screening);
}

export async function deleteScreening(screeningId: string) {
  if (!supabase) {
    deleteLocalScreening(screeningId);
    return;
  }

  const { error } = await supabase.from("screenings").delete().eq("id", screeningId);
  assertSupabaseResult(error, "No se pudo eliminar la sesion");
  deleteLocalScreening(screeningId);
}

export type RemoveMovieResult =
  | { action: "deleted" }
  | { action: "retired"; retiredAt: string };

export async function removeMovie(movieId: string): Promise<RemoveMovieResult> {
  const current = loadLocalSchedule();
  const localIsUsed = current.screenings.some((screening) => screening.movieId === movieId);

  if (!supabase) {
    if (localIsUsed) {
      const retiredAt = new Date().toISOString();
      retireLocalMovie(movieId, retiredAt);
      return { action: "retired", retiredAt };
    }

    deleteLocalMovie(movieId);
    return { action: "deleted" };
  }

  const { count, error: countError } = await supabase
    .from("screenings")
    .select("id", { count: "exact", head: true })
    .eq("movie_id", movieId);

  assertSupabaseResult(countError, "No se pudo comprobar si la pelicula esta en uso");

  if ((count ?? 0) > 0) {
    const retiredAt = new Date().toISOString();
    const { error } = await supabase
      .from("movies")
      .update({ retired_at: retiredAt })
      .eq("id", movieId);

    assertSupabaseResult(error, "No se pudo retirar la pelicula");
    retireLocalMovie(movieId, retiredAt);
    return { action: "retired", retiredAt };
  }

  const { error } = await supabase.from("movies").delete().eq("id", movieId);
  assertSupabaseResult(error, "No se pudo borrar la pelicula");
  deleteLocalMovie(movieId);

  return { action: "deleted" };
}

function loadLocalSchedule(): ScheduleState {
  if (typeof window === "undefined") {
    return { rooms: INITIAL_ROOMS, movies: INITIAL_MOVIES, screenings: [] };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { rooms: INITIAL_ROOMS, movies: INITIAL_MOVIES, screenings: [] };
  }

  try {
    const parsed = JSON.parse(raw) as ScheduleState;
    return {
      rooms: parsed.rooms?.length ? parsed.rooms : INITIAL_ROOMS,
      movies: parsed.movies?.length
        ? parsed.movies.map((movie) => ({ ...movie, retiredAt: movie.retiredAt ?? null }))
        : INITIAL_MOVIES,
      screenings: parsed.screenings ?? []
    };
  } catch {
    return { rooms: INITIAL_ROOMS, movies: INITIAL_MOVIES, screenings: [] };
  }
}

function persistLocal(state: ScheduleState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveLocalPatch(patch: Partial<ScheduleState>) {
  persistLocal({ ...loadLocalSchedule(), ...patch });
}

function saveLocalMovie(movie: Movie) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    movies: [...current.movies.filter((item) => item.id !== movie.id), movie].sort((a, b) =>
      a.title.localeCompare(b.title)
    )
  });
}

function retireLocalMovie(movieId: string, retiredAt: string) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    movies: current.movies.map((movie) =>
      movie.id === movieId ? { ...movie, retiredAt } : movie
    )
  });
}

function deleteLocalMovie(movieId: string) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    movies: current.movies.filter((movie) => movie.id !== movieId)
  });
}

function saveLocalScreening(screening: Screening) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    screenings: [
      ...current.screenings.filter((item) => item.id !== screening.id),
      screening
    ].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  });
}

function deleteLocalScreening(screeningId: string) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    screenings: current.screenings.filter((item) => item.id !== screeningId)
  });
}

function assertSupabaseResult(error: { message?: string } | null, fallbackMessage: string) {
  if (!error) return;

  throw new Error(error.message || fallbackMessage);
}
