import { CLEANING_MINUTES, Movie, Screening, ScreeningStatus } from "./types";

export function isValidScreeningTime(time: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function timeToMinutes(time: string) {
  if (!isValidScreeningTime(time)) return null;

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
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
  movies: Movie[]
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

  const start = timeToMinutes(screening.startsAt);
  if (start === null) return "invalid";
  const end = start + movie.durationMinutes + CLEANING_MINUTES;

  const hasConflict = screenings.some((candidate) => {
    if (candidate.id === screening.id) return false;
    if (candidate.roomId !== screening.roomId) return false;
    if (candidate.day !== screening.day) return false;

    const candidateMovie = movies.find((item) => item.id === candidate.movieId);
    if (!candidateMovie || !candidate.startsAt) return false;

    const candidateStart = timeToMinutes(candidate.startsAt);
    if (candidateStart === null) return false;
    const candidateEnd = candidateStart + candidateMovie.durationMinutes + CLEANING_MINUTES;

    return start < candidateEnd && end > candidateStart;
  });

  return hasConflict ? "conflict" : "valid";
}

export function getScreeningEndTime(screening: Screening, movies: Movie[]) {
  const movie = movies.find((item) => item.id === screening.movieId);
  if (!movie || !screening.startsAt) return null;

  const startsAt = timeToMinutes(screening.startsAt);
  if (startsAt === null) return null;

  const totalMinutes = startsAt + movie.durationMinutes + CLEANING_MINUTES;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
