import { DEFAULT_TURNOVER_MINUTES, Movie, Screening, ScreeningStatus } from "./types";

export type TurnoverConflict = {
  previousScreeningId: string;
  currentScreeningId: string;
  previousEndsAt: string;
  minimumStartAt: string;
  actualGapMinutes: number;
  turnoverMinutes: number;
};

export function isValidScreeningTime(time: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function timeToMinutes(time: string) {
  if (!isValidScreeningTime(time)) return null;

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function compareScreeningStartTimes(a: Screening, b: Screening) {
  const aMinutes = timeToMinutes(a.startsAt);
  const bMinutes = timeToMinutes(b.startsAt);

  if (aMinutes === null && bMinutes === null) {
    return a.startsAt.localeCompare(b.startsAt);
  }

  if (aMinutes === null) return 1;
  if (bMinutes === null) return -1;

  return aMinutes - bMinutes;
}

export function getScreeningStatus(
  screening: Screening,
  screenings: Screening[],
  movies: Movie[],
  turnoverMinutes = DEFAULT_TURNOVER_MINUTES
): ScreeningStatus {
  if (!screening.startsAt) {
    return "empty";
  }

  if (!isValidScreeningTime(screening.startsAt)) {
    return "invalid";
  }

  const movie = movies.find((item) => item.id === screening.movieId);
  if (!movie) {
    return "empty";
  }

  const hasConflict = getTurnoverConflicts(screenings, movies, turnoverMinutes).some(
    (conflict) => conflict.currentScreeningId === screening.id
  );

  return hasConflict ? "conflict" : "valid";
}

export function getScreeningEndTime(screening: Screening, movies: Movie[]) {
  const movie = movies.find((item) => item.id === screening.movieId);
  if (!movie || !screening.startsAt) return null;

  const startsAt = timeToMinutes(screening.startsAt);
  if (startsAt === null) return null;

  return minutesToTime(startsAt + movie.durationMinutes);
}

export function getTurnoverConflictForScreening(
  screening: Screening,
  screenings: Screening[],
  movies: Movie[],
  turnoverMinutes = DEFAULT_TURNOVER_MINUTES
) {
  return (
    getTurnoverConflicts(screenings, movies, turnoverMinutes).find(
      (conflict) => conflict.currentScreeningId === screening.id
    ) ?? null
  );
}

export function getTurnoverConflicts(
  screenings: Screening[],
  movies: Movie[],
  turnoverMinutes = DEFAULT_TURNOVER_MINUTES
): TurnoverConflict[] {
  const groups = new Map<
    string,
    Array<{
      screening: Screening;
      startMinutes: number;
      endMinutes: number;
    }>
  >();

  screenings.forEach((screening) => {
    const movie = movies.find((item) => item.id === screening.movieId);
    const startMinutes = timeToMinutes(screening.startsAt);

    if (!movie || startMinutes === null) return;

    const groupKey = `${screening.weekStart}:${screening.roomId}:${screening.day}`;
    const group = groups.get(groupKey) ?? [];

    group.push({
      screening,
      startMinutes,
      endMinutes: startMinutes + movie.durationMinutes
    });
    groups.set(groupKey, group);
  });

  const conflicts: TurnoverConflict[] = [];

  groups.forEach((group) => {
    const sorted = [...group].sort((a, b) => a.startMinutes - b.startMinutes);

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const minimumStartMinutes = previous.endMinutes + turnoverMinutes;

      if (current.startMinutes < minimumStartMinutes) {
        conflicts.push({
          previousScreeningId: previous.screening.id,
          currentScreeningId: current.screening.id,
          previousEndsAt: minutesToTime(previous.endMinutes),
          minimumStartAt: minutesToTime(minimumStartMinutes),
          actualGapMinutes: current.startMinutes - previous.endMinutes,
          turnoverMinutes
        });
      }
    }
  });

  return conflicts;
}
