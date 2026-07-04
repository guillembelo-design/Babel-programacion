import { formatMinutesAsTime, timeToMinutes } from "./conflicts";
import { Movie, Screening, WeekdayKey } from "./types";

const DEFAULT_DAY_START_MINUTES = 16 * 60;
const DEFAULT_DAY_END_MINUTES = 23 * 60;
const MINUTES_PER_STEP = 5;
const PIXELS_PER_MINUTE = 1;

export type TimelineRange = {
  startMinutes: number;
  endMinutes: number;
};

export type TimelineScreeningLayout = {
  height: number;
  top: number;
};

export type ScreeningGapInfo =
  | {
      kind: "gap";
      label: string;
      minutes: number;
    }
  | {
      kind: "tight";
      label: string;
      minutes: number;
    }
  | {
      kind: "overlap";
      label: string;
      minutes: number;
    };

export function roundMinutesToNearestFive(minutes: number) {
  return Math.round(minutes / MINUTES_PER_STEP) * MINUTES_PER_STEP;
}

export function roundMinutesDownToFive(minutes: number) {
  return Math.floor(minutes / MINUTES_PER_STEP) * MINUTES_PER_STEP;
}

export function roundMinutesUpToFive(minutes: number) {
  return Math.ceil(minutes / MINUTES_PER_STEP) * MINUTES_PER_STEP;
}

export function roundMinutesDownToHour(minutes: number) {
  return Math.floor(minutes / 60) * 60;
}

export function roundMinutesUpToHour(minutes: number) {
  return Math.ceil(minutes / 60) * 60;
}

export function getTimelineRangeForDay({
  day,
  movies,
  screenings,
  turnoverMinutes,
  weekStart
}: {
  day: WeekdayKey;
  movies: Movie[];
  screenings: Screening[];
  turnoverMinutes: number;
  weekStart: string;
}): TimelineRange {
  const dayScreenings = getScreeningsWithTimes({
    day,
    movies,
    screenings,
    weekStart
  });

  if (!dayScreenings.length) {
    return {
      startMinutes: DEFAULT_DAY_START_MINUTES,
      endMinutes: DEFAULT_DAY_END_MINUTES
    };
  }

  const earliestStart = Math.min(...dayScreenings.map((screening) => screening.startMinutes));
  const latestAllowedEnd = Math.max(
    ...dayScreenings.map((screening) => screening.endMinutes + turnoverMinutes)
  );

  const startMinutes =
    earliestStart < DEFAULT_DAY_START_MINUTES
      ? roundMinutesDownToHour(earliestStart)
      : DEFAULT_DAY_START_MINUTES;

  const endMinutes = Math.max(DEFAULT_DAY_END_MINUTES, roundMinutesUpToHour(latestAllowedEnd));

  return {
    startMinutes,
    endMinutes
  };
}

export function getTimelineHourMarks(range: TimelineRange) {
  const firstHour = roundMinutesUpToHour(range.startMinutes);
  const marks: number[] = [];

  for (let minute = firstHour; minute <= range.endMinutes; minute += 60) {
    marks.push(minute);
  }

  return marks;
}

export function getTimelineHeight(range: TimelineRange) {
  return Math.max(0, (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE);
}

export function getScreeningTimelineLayout(
  screening: Screening,
  movies: Movie[],
  range: TimelineRange
): TimelineScreeningLayout | null {
  const movie = movies.find((item) => item.id === screening.movieId);
  const startMinutes = timeToMinutes(screening.startsAt);

  if (startMinutes === null) {
    return null;
  }

  const durationMinutes =
    movie?.durationMinutes && movie.durationMinutes > 0 ? movie.durationMinutes : 60;
  const roundedStart = roundMinutesDownToFive(startMinutes);
  const roundedEnd = roundMinutesUpToFive(startMinutes + durationMinutes);

  return {
    top: Math.max(0, (roundedStart - range.startMinutes) * PIXELS_PER_MINUTE),
    height: Math.max(0, (roundedEnd - roundedStart) * PIXELS_PER_MINUTE)
  };
}

export function getTimelineOffsetForMinutes(minutes: number, range: TimelineRange) {
  return Math.max(0, (minutes - range.startMinutes) * PIXELS_PER_MINUTE);
}

export function getNextScreeningForSameRoom(
  screening: Screening,
  screenings: Screening[]
) {
  const startMinutes = timeToMinutes(screening.startsAt);
  if (startMinutes === null) return null;

  return (
    screenings
      .filter(
        (candidate) =>
          candidate.id !== screening.id &&
          candidate.weekStart === screening.weekStart &&
          candidate.day === screening.day &&
          candidate.roomId === screening.roomId
      )
      .map((candidate) => {
        const candidateStart = timeToMinutes(candidate.startsAt);
        return candidateStart === null
          ? null
          : { screening: candidate, startMinutes: candidateStart };
      })
      .filter((candidate): candidate is { screening: Screening; startMinutes: number } =>
        Boolean(candidate)
      )
      .filter((candidate) => candidate.startMinutes > startMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes)[0]?.screening ?? null
  );
}

export function getScreeningGapInfo({
  movie,
  nextScreening,
  screening,
  turnoverMinutes
}: {
  movie: Movie | null;
  nextScreening: Screening | null;
  screening: Screening;
  turnoverMinutes: number;
}): ScreeningGapInfo | null {
  if (!movie || !nextScreening) return null;

  const startMinutes = timeToMinutes(screening.startsAt);
  const nextStartMinutes = timeToMinutes(nextScreening.startsAt);
  if (startMinutes === null || nextStartMinutes === null) return null;

  const gapMinutes = nextStartMinutes - (startMinutes + movie.durationMinutes);

  if (gapMinutes < 0) {
    return {
      kind: "overlap",
      label: `Solapa ${Math.abs(gapMinutes)} min`,
      minutes: gapMinutes
    };
  }

  if (gapMinutes < turnoverMinutes) {
    return {
      kind: "tight",
      label: `solo +${gapMinutes} min`,
      minutes: gapMinutes
    };
  }

  return {
    kind: "gap",
    label: `+${gapMinutes} min`,
    minutes: gapMinutes
  };
}

export function formatTimelineTime(minutes: number) {
  return formatMinutesAsTime(minutes);
}

function getScreeningsWithTimes({
  day,
  movies,
  screenings,
  weekStart
}: {
  day: WeekdayKey;
  movies: Movie[];
  screenings: Screening[];
  weekStart: string;
}) {
  return screenings
    .filter((screening) => screening.weekStart === weekStart && screening.day === day)
    .map((screening) => {
      const movie = movies.find((item) => item.id === screening.movieId);
      const startMinutes = timeToMinutes(screening.startsAt);

      if (startMinutes === null) {
        return null;
      }

      const durationMinutes =
        movie?.durationMinutes && movie.durationMinutes > 0 ? movie.durationMinutes : 60;

      return {
        endMinutes: startMinutes + durationMinutes,
        startMinutes
      };
    })
    .filter((screening): screening is { endMinutes: number; startMinutes: number } =>
      Boolean(screening)
    );
}
