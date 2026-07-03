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
  posterUrl: movie.poster_url ?? ""
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

  const [{ data: rooms }, { data: movies }, { data: screenings }] = await Promise.all([
    supabase.from("rooms").select("id,name,position").order("position"),
    supabase.from("movies").select("id,title,duration_minutes,poster_url").order("title"),
    supabase
      .from("screenings")
      .select("id,week_start,day,room_id,movie_id,starts_at")
      .order("starts_at")
  ]);

  return {
    rooms: rooms?.length ? (rooms as Room[]) : INITIAL_ROOMS,
    movies: movies?.length ? (movies as DatabaseMovie[]).map(mapMovieFromDatabase) : INITIAL_MOVIES,
    screenings: screenings?.length
      ? (screenings as DatabaseScreening[]).map(mapScreeningFromDatabase)
      : []
  };
}

export async function saveRooms(rooms: Room[]) {
  saveLocalPatch({ rooms });

  if (!supabase) return;

  await supabase.from("rooms").upsert(rooms, { onConflict: "id" });
}

export async function saveMovie(movie: Movie) {
  saveLocalMovie(movie);

  if (!supabase) return;

  await supabase.from("movies").upsert(
    {
      id: movie.id,
      title: movie.title,
      duration_minutes: movie.durationMinutes,
      poster_url: movie.posterUrl || null
    },
    { onConflict: "id" }
  );
}

export async function saveScreening(screening: Screening) {
  saveLocalScreening(screening);

  if (!supabase) return;

  await supabase.from("screenings").upsert(
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
}

export async function deleteScreening(screeningId: string) {
  deleteLocalScreening(screeningId);

  if (!supabase) return;

  await supabase.from("screenings").delete().eq("id", screeningId);
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
      movies: parsed.movies?.length ? parsed.movies : INITIAL_MOVIES,
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
