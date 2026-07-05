export type Room = {
  id: string;
  name: string;
  position: number;
};

export type Movie = {
  id: string;
  title: string;
  durationMinutes: number;
  posterUrl: string;
  distributorId: string | null;
  retiredAt: string | null;
};

export type Distributor = {
  id: string;
  name: string;
  normalizedName: string;
};

export type Screening = {
  id: string;
  weekStart: string;
  day: WeekdayKey;
  roomId: string;
  movieId: string | null;
  startsAt: string;
};

export type WeeklyMovie = {
  id: string;
  weekStart: string;
  movieId: string;
};

export type WeekdayKey =
  | "friday"
  | "saturday"
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday";

export type ScheduleState = {
  rooms: Room[];
  movies: Movie[];
  distributors: Distributor[];
  screenings: Screening[];
};

export type ScreeningStatus = "valid" | "conflict" | "empty" | "invalid";

export const DEFAULT_TURNOVER_MINUTES = 15;

export const WEEKDAYS: Array<{ key: WeekdayKey; label: string; shortLabel: string }> = [
  { key: "friday", label: "Viernes", shortLabel: "Vie" },
  { key: "saturday", label: "Sabado", shortLabel: "Sab" },
  { key: "sunday", label: "Domingo", shortLabel: "Dom" },
  { key: "monday", label: "Lunes", shortLabel: "Lun" },
  { key: "tuesday", label: "Martes", shortLabel: "Mar" },
  { key: "wednesday", label: "Miercoles", shortLabel: "Mie" },
  { key: "thursday", label: "Jueves", shortLabel: "Jue" }
];

export const INITIAL_ROOMS: Room[] = [
  { id: "room-1", name: "Sala 1", position: 1 },
  { id: "room-2", name: "Sala 2", position: 2 },
  { id: "room-3", name: "Sala 3", position: 3 },
  { id: "room-4", name: "Sala 4", position: 4 },
  { id: "room-5", name: "Sala 5", position: 5 }
];

export const INITIAL_MOVIES: Movie[] = [];

export const INITIAL_DISTRIBUTORS: Distributor[] = [];
