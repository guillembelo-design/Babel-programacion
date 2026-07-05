"use client";

import { supabase } from "@/lib/supabase/client";
import {
  Distributor,
  INITIAL_DISTRIBUTORS,
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
  distributor_id: string | null;
  retired_at: string | null;
};

type DatabaseDistributor = {
  id: string;
  name: string;
  normalized_name: string;
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
  distributorId: movie.distributor_id,
  retiredAt: movie.retired_at
});

const mapDistributorFromDatabase = (distributor: DatabaseDistributor): Distributor => ({
  id: distributor.id,
  name: distributor.name,
  normalizedName: distributor.normalized_name
});

const mapScreeningFromDatabase = (screening: DatabaseScreening): Screening => ({
  id: screening.id,
  weekStart: screening.week_start,
  day: screening.day,
  roomId: screening.room_id,
  movieId: screening.movie_id,
  startsAt: screening.starts_at.slice(0, 5)
});

export async function loadScheduleForWeek(weekStart: string): Promise<ScheduleState> {
  if (!supabase) {
    const localSchedule = loadLocalSchedule();
    return {
      ...localSchedule,
      screenings: localSchedule.screenings.filter((screening) => screening.weekStart === weekStart)
    };
  }

  const [roomsResponse, moviesResponse, distributorsResponse, screeningsResponse] = await Promise.all([
    supabase.from("rooms").select("id,name,position").order("position"),
    supabase
      .from("movies")
      .select("id,title,duration_minutes,poster_url,distributor_id,retired_at")
      .order("title"),
    supabase.from("distributors").select("id,name,normalized_name").order("name"),
    supabase
      .from("screenings")
      .select("id,week_start,day,room_id,movie_id,starts_at")
      .eq("week_start", weekStart)
      .order("starts_at")
  ]);

  assertSupabaseResult(roomsResponse.error, "No se pudieron cargar las salas");
  assertSupabaseResult(moviesResponse.error, "No se pudieron cargar las peliculas");
  assertSupabaseResult(distributorsResponse.error, "No se pudieron cargar las distribuidoras");
  assertSupabaseResult(screeningsResponse.error, "No se pudieron cargar las sesiones");

  return {
    rooms: roomsResponse.data?.length ? (roomsResponse.data as Room[]) : INITIAL_ROOMS,
    movies: moviesResponse.data?.length
      ? (moviesResponse.data as DatabaseMovie[]).map(mapMovieFromDatabase)
      : INITIAL_MOVIES,
    distributors: distributorsResponse.data?.length
      ? (distributorsResponse.data as DatabaseDistributor[]).map(mapDistributorFromDatabase)
      : INITIAL_DISTRIBUTORS,
    screenings: screeningsResponse.data?.length
      ? (screeningsResponse.data as DatabaseScreening[]).map(mapScreeningFromDatabase)
      : []
  };
}

export async function loadScreeningsForWeek(weekStart: string) {
  if (!supabase) {
    return loadLocalSchedule().screenings.filter((screening) => screening.weekStart === weekStart);
  }

  const { data, error } = await supabase
    .from("screenings")
    .select("id,week_start,day,room_id,movie_id,starts_at")
    .eq("week_start", weekStart)
    .order("starts_at");

  assertSupabaseResult(error, "No se pudieron cargar las sesiones");

  return data?.length ? (data as DatabaseScreening[]).map(mapScreeningFromDatabase) : [];
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
      distributor_id: movie.distributorId,
      retired_at: movie.retiredAt
    },
    { onConflict: "id" }
  );
  assertSupabaseResult(error, "No se pudo guardar la pelicula");
  saveLocalMovie(movie);
}

export async function findOrCreateDistributor(distributorName: string): Promise<Distributor | null> {
  const name = distributorName.trim();
  const normalizedName = normalizeDistributorName(name);

  if (!name || !normalizedName) {
    return null;
  }

  if (!supabase) {
    return findOrCreateLocalDistributor(name, normalizedName);
  }

  const { data: existing, error: selectError } = await supabase
    .from("distributors")
    .select("id,name,normalized_name")
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  assertSupabaseResult(selectError, "No se pudo comprobar la distribuidora");

  if (existing) {
    return mapDistributorFromDatabase(existing as DatabaseDistributor);
  }

  const { data: created, error: insertError } = await supabase
    .from("distributors")
    .insert({ name, normalized_name: normalizedName })
    .select("id,name,normalized_name")
    .single();

  if (insertError) {
    const { data: retryExisting, error: retryError } = await supabase
      .from("distributors")
      .select("id,name,normalized_name")
      .eq("normalized_name", normalizedName)
      .maybeSingle();

    assertSupabaseResult(retryError, "No se pudo recuperar la distribuidora");
    if (retryExisting) {
      return mapDistributorFromDatabase(retryExisting as DatabaseDistributor);
    }
  }

  assertSupabaseResult(insertError, "No se pudo crear la distribuidora");
  return created ? mapDistributorFromDatabase(created as DatabaseDistributor) : null;
}

export async function updateDistributor(distributorId: string, distributorName: string) {
  const name = distributorName.trim();
  const normalizedName = normalizeDistributorName(name);

  if (!name || !normalizedName) {
    throw new Error("Introduce un nombre de distribuidora valido.");
  }

  if (!supabase) {
    updateLocalDistributor(distributorId, name, normalizedName);
    return { id: distributorId, name, normalizedName };
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("distributors")
    .select("id,name,normalized_name")
    .eq("normalized_name", normalizedName)
    .neq("id", distributorId)
    .maybeSingle();

  assertSupabaseResult(duplicateError, "No se pudo comprobar si la distribuidora ya existe");

  if (duplicate) {
    throw new Error("Ya existe una distribuidora con ese nombre. Usa fusionar.");
  }

  const { data, error } = await supabase
    .from("distributors")
    .update({ name, normalized_name: normalizedName })
    .eq("id", distributorId)
    .select("id,name,normalized_name")
    .single();

  assertSupabaseResult(error, "No se pudo renombrar la distribuidora");
  updateLocalDistributor(distributorId, name, normalizedName);

  return mapDistributorFromDatabase(data as DatabaseDistributor);
}

export async function deleteDistributor(distributorId: string) {
  const current = loadLocalSchedule();
  const localUsageCount = current.movies.filter(
    (movie) => movie.distributorId === distributorId
  ).length;

  if (!supabase) {
    if (localUsageCount > 0) {
      throw new Error("Esta distribuidora esta usada en peliculas.");
    }

    deleteLocalDistributor(distributorId);
    return;
  }

  const { count, error: countError } = await supabase
    .from("movies")
    .select("id", { count: "exact", head: true })
    .eq("distributor_id", distributorId);

  assertSupabaseResult(countError, "No se pudo comprobar si la distribuidora esta en uso");

  if ((count ?? 0) > 0) {
    throw new Error("Esta distribuidora esta usada en peliculas.");
  }

  const { error } = await supabase.from("distributors").delete().eq("id", distributorId);
  assertSupabaseResult(error, "No se pudo borrar la distribuidora");
  deleteLocalDistributor(distributorId);
}

export async function detachAndDeleteDistributor(distributorId: string) {
  if (!supabase) {
    detachAndDeleteLocalDistributor(distributorId);
    return;
  }

  const { error: moviesError } = await supabase
    .from("movies")
    .update({ distributor_id: null })
    .eq("distributor_id", distributorId);

  assertSupabaseResult(moviesError, "No se pudo quitar la distribuidora de las peliculas");

  const { error: deleteError } = await supabase
    .from("distributors")
    .delete()
    .eq("id", distributorId);

  assertSupabaseResult(deleteError, "No se pudo borrar la distribuidora");
  detachAndDeleteLocalDistributor(distributorId);
}

export async function mergeDistributors(sourceDistributorId: string, targetDistributorId: string) {
  if (sourceDistributorId === targetDistributorId) {
    throw new Error("Elige otra distribuidora para fusionar.");
  }

  if (!supabase) {
    mergeLocalDistributors(sourceDistributorId, targetDistributorId);
    return;
  }

  const { error: moviesError } = await supabase
    .from("movies")
    .update({ distributor_id: targetDistributorId })
    .eq("distributor_id", sourceDistributorId);

  assertSupabaseResult(moviesError, "No se pudieron mover las peliculas");

  const { error: deleteError } = await supabase
    .from("distributors")
    .delete()
    .eq("id", sourceDistributorId);

  assertSupabaseResult(deleteError, "No se pudo borrar la distribuidora duplicada");
  mergeLocalDistributors(sourceDistributorId, targetDistributorId);
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
    return {
      rooms: INITIAL_ROOMS,
      movies: INITIAL_MOVIES,
      distributors: INITIAL_DISTRIBUTORS,
      screenings: []
    };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      rooms: INITIAL_ROOMS,
      movies: INITIAL_MOVIES,
      distributors: INITIAL_DISTRIBUTORS,
      screenings: []
    };
  }

  try {
    const parsed = JSON.parse(raw) as ScheduleState;
    return {
      rooms: parsed.rooms?.length ? parsed.rooms : INITIAL_ROOMS,
      movies: parsed.movies?.length
        ? parsed.movies.map((movie) => ({
            ...movie,
            distributorId: movie.distributorId ?? null,
            retiredAt: movie.retiredAt ?? null
          }))
        : INITIAL_MOVIES,
      distributors: parsed.distributors?.length
        ? parsed.distributors.map((distributor) => ({
            ...distributor,
            normalizedName:
              distributor.normalizedName || normalizeDistributorName(distributor.name)
          }))
        : INITIAL_DISTRIBUTORS,
      screenings: parsed.screenings ?? []
    };
  } catch {
    return {
      rooms: INITIAL_ROOMS,
      movies: INITIAL_MOVIES,
      distributors: INITIAL_DISTRIBUTORS,
      screenings: []
    };
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

function findOrCreateLocalDistributor(name: string, normalizedName: string) {
  const current = loadLocalSchedule();
  const existing = current.distributors.find(
    (distributor) => distributor.normalizedName === normalizedName
  );

  if (existing) {
    return existing;
  }

  const distributor: Distributor = {
    id: crypto.randomUUID(),
    name,
    normalizedName
  };

  persistLocal({
    ...current,
    distributors: [...current.distributors, distributor].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  });

  return distributor;
}

function updateLocalDistributor(distributorId: string, name: string, normalizedName: string) {
  const current = loadLocalSchedule();
  const duplicate = current.distributors.find(
    (distributor) =>
      distributor.id !== distributorId && distributor.normalizedName === normalizedName
  );

  if (duplicate) {
    throw new Error("Ya existe una distribuidora con ese nombre. Usa fusionar.");
  }

  persistLocal({
    ...current,
    distributors: current.distributors
      .map((distributor) =>
        distributor.id === distributorId ? { ...distributor, name, normalizedName } : distributor
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  });
}

function deleteLocalDistributor(distributorId: string) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    distributors: current.distributors.filter((distributor) => distributor.id !== distributorId)
  });
}

function detachAndDeleteLocalDistributor(distributorId: string) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    movies: current.movies.map((movie) =>
      movie.distributorId === distributorId ? { ...movie, distributorId: null } : movie
    ),
    distributors: current.distributors.filter((distributor) => distributor.id !== distributorId)
  });
}

function mergeLocalDistributors(sourceDistributorId: string, targetDistributorId: string) {
  const current = loadLocalSchedule();
  persistLocal({
    ...current,
    movies: current.movies.map((movie) =>
      movie.distributorId === sourceDistributorId
        ? { ...movie, distributorId: targetDistributorId }
        : movie
    ),
    distributors: current.distributors.filter(
      (distributor) => distributor.id !== sourceDistributorId
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

export function normalizeDistributorName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
