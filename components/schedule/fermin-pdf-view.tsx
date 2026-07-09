import { getDayDateLabel, getWeekLabel } from "@/lib/schedule/dates";
import { Movie, Screening, WeekdayKey, WEEKDAYS } from "@/lib/schedule/types";

type FerminPdfViewProps = {
  movies: Movie[];
  screenings: Screening[];
  weekStart: string;
};

type MovieScheduleGroup = {
  id: string;
  movie: Movie | null;
  title: string;
  hoursByDay: Record<WeekdayKey, Array<{ sessionLabel: string; startsAt: string }>>;
};

export function FerminPdfView({ movies, screenings, weekStart }: FerminPdfViewProps) {
  const groups = getMovieScheduleGroups({ movies, screenings, weekStart });
  const weekLabel = getWeekLabel(weekStart);

  return (
    <section className="print-only fermin-print-view">
      <header className="fermin-print-header">
        <p>CINES BABEL — PDF películas y sesiones</p>
        <span>Semana: {weekLabel}</span>
      </header>

      {groups.length ? (
        <table className="fermin-print-table">
          <thead>
            <tr>
              <th>Película</th>
              {WEEKDAYS.map((day, dayIndex) => (
                <th key={day.key}>
                  {day.shortLabel} {getCompactDayNumber(weekStart, dayIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const meta = getMovieMeta(group.movie);

              return (
                <tr key={group.id}>
                  <td className="fermin-print-movie-cell">
                    <strong>{group.title}</strong>
                    {meta ? <span>{meta}</span> : null}
                  </td>
                  {WEEKDAYS.map((day) => (
                    <td key={day.key} className="fermin-print-hours-cell">
                      {group.hoursByDay[day.key].map(formatSessionSlot).join(" · ")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="fermin-print-empty">No hay sesiones en esta semana.</p>
      )}
    </section>
  );
}

function getMovieScheduleGroups({
  movies,
  screenings,
  weekStart
}: {
  movies: Movie[];
  screenings: Screening[];
  weekStart: string;
}) {
  const moviesById = new Map(movies.map((movie) => [movie.id, movie]));
  const groupsByMovieId = new Map<string, MovieScheduleGroup>();
  const emptyHoursByDay = () =>
    WEEKDAYS.reduce(
      (accumulator, day) => ({
        ...accumulator,
        [day.key]: []
      }),
      {} as MovieScheduleGroup["hoursByDay"]
    );

  screenings
    .filter((screening) => screening.weekStart === weekStart)
    .forEach((screening) => {
      const movie = screening.movieId ? moviesById.get(screening.movieId) ?? null : null;
      const groupId = movie?.id ?? "without-movie";
      const existingGroup = groupsByMovieId.get(groupId);
      const group =
        existingGroup ??
        ({
          id: groupId,
          movie,
          title: movie?.title ?? "Sin película",
          hoursByDay: emptyHoursByDay()
        } satisfies MovieScheduleGroup);

      if (screening.startsAt) {
        group.hoursByDay[screening.day].push({
          sessionLabel: screening.sessionLabel?.trim() ?? "",
          startsAt: screening.startsAt
        });
      }

      groupsByMovieId.set(groupId, group);
    });

  return Array.from(groupsByMovieId.values())
    .map((group) => ({
      ...group,
      hoursByDay: WEEKDAYS.reduce(
        (accumulator, day) => ({
          ...accumulator,
          [day.key]: [...group.hoursByDay[day.key]].sort((slotA, slotB) =>
            slotA.startsAt.localeCompare(slotB.startsAt)
          )
        }),
        {} as MovieScheduleGroup["hoursByDay"]
      )
    }))
    .sort((groupA, groupB) => {
      if (!groupA.movie && groupB.movie) return 1;
      if (groupA.movie && !groupB.movie) return -1;

      return groupA.title.localeCompare(groupB.title);
    });
}

function getMovieMeta(movie: Movie | null) {
  if (!movie) return "";

  return [
    movie.director ? `Director/a: ${movie.director}` : "",
    movie.durationMinutes ? `Duración: ${movie.durationMinutes} min` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function getCompactDayNumber(weekStart: string, offset: number) {
  return getDayDateLabel(weekStart, offset).split(" ")[0];
}

function formatSessionSlot(slot: { sessionLabel: string; startsAt: string }) {
  return slot.sessionLabel ? `${slot.startsAt} (${slot.sessionLabel})` : slot.startsAt;
}
