import { formatMinutesAsTime, timeToMinutes } from "./conflicts";
import { Movie, Screening, WeekdayKey } from "./types";

export const DEFAULT_FIRST_SCREENING_TIME = "16:00";
export const PREFERRED_SCREENING_START_TIMES = ["16:00", "18:00", "20:00", "22:00"] as const;

const SCREENING_START_ROUNDING_MINUTES = 5;
const PREFERRED_START_GRACE_MINUTES = 5;

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

  const nextPreferredStart = PREFERRED_SCREENING_START_TIMES.map((time) => timeToMinutes(time))
    .filter((minutes): minutes is number => minutes !== null)
    .find((minutes) => minutes > lastValidScreening.startMinutes);

  if (
    nextPreferredStart !== undefined &&
    nextPreferredStart + PREFERRED_START_GRACE_MINUTES >= lastValidScreening.nextStartMinutes
  ) {
    return formatMinutesAsTime(nextPreferredStart);
  }

  return formatMinutesAsTime(roundMinutesUp(lastValidScreening.nextStartMinutes));
}

function roundMinutesUp(minutes: number) {
  return Math.ceil(minutes / SCREENING_START_ROUNDING_MINUTES) * SCREENING_START_ROUNDING_MINUTES;
}
