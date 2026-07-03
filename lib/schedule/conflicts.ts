import { CLEANING_MINUTES, Movie, Screening, ScreeningStatus } from "./types";

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getScreeningStatus(
  screening: Screening,
  screenings: Screening[],
  movies: Movie[]
): ScreeningStatus {
  const movie = movies.find((item) => item.id === screening.movieId);

  if (!movie || !screening.startsAt) {
    return "empty";
  }

  const start = timeToMinutes(screening.startsAt);
  const end = start + movie.durationMinutes + CLEANING_MINUTES;

  const hasConflict = screenings.some((candidate) => {
    if (candidate.id === screening.id) return false;
    if (candidate.roomId !== screening.roomId) return false;
    if (candidate.day !== screening.day) return false;

    const candidateMovie = movies.find((item) => item.id === candidate.movieId);
    if (!candidateMovie || !candidate.startsAt) return false;

    const candidateStart = timeToMinutes(candidate.startsAt);
    const candidateEnd = candidateStart + candidateMovie.durationMinutes + CLEANING_MINUTES;

    return start < candidateEnd && end > candidateStart;
  });

  return hasConflict ? "conflict" : "valid";
}

export function getScreeningEndTime(screening: Screening, movies: Movie[]) {
  const movie = movies.find((item) => item.id === screening.movieId);
  if (!movie || !screening.startsAt) return null;

  const totalMinutes = timeToMinutes(screening.startsAt) + movie.durationMinutes + CLEANING_MINUTES;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
