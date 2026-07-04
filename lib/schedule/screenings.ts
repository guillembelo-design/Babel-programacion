import { formatMinutesAsTime, timeToMinutes } from "./conflicts";
import { Movie, Screening, WeekdayKey } from "./types";

const DEFAULT_FIRST_SCREENING_TIME = "18:00";

export function getNextScreeningStartTime({
  day,
  movies,
  roomId,
  screenings,
  turnoverMinutes,
  weekStart
}: {
  day: WeekdayKey;
  movies: Movie[];
  roomId: string;
  screenings: Screening[];
  turnoverMinutes: number;
  weekStart: string;
}) {
  const validScreenings = screenings
    .filter(
      (screening) =>
        screening.weekStart === weekStart && screening.day === day && screening.roomId === roomId
    )
    .map((screening) => {
      const movie = movies.find((item) => item.id === screening.movieId);
      const startMinutes = timeToMinutes(screening.startsAt);

      if (!movie || movie.durationMinutes <= 0 || startMinutes === null) {
        return null;
      }

      return {
        startMinutes,
        nextStartMinutes: startMinutes + movie.durationMinutes + turnoverMinutes
      };
    })
    .filter((screening): screening is { startMinutes: number; nextStartMinutes: number } =>
      Boolean(screening)
    )
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const lastValidScreening = validScreenings.at(-1);

  if (!lastValidScreening) {
    return DEFAULT_FIRST_SCREENING_TIME;
  }

  return formatMinutesAsTime(lastValidScreening.nextStartMinutes);
}
