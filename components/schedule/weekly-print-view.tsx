import {
  compareScreeningStartTimes,
  getScreeningEndTime,
  getTurnoverConflictForScreening
} from "@/lib/schedule/conflicts";
import { getDayDateLabel, getWeekLabel } from "@/lib/schedule/dates";
import { Distributor, Movie, Room, Screening, WeekdayKey, WEEKDAYS } from "@/lib/schedule/types";

const PRINT_DAY_LABELS: Record<WeekdayKey, string> = {
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves"
};

type WeeklyPrintViewProps = {
  distributors: Distributor[];
  movies: Movie[];
  rooms: Room[];
  screenings: Screening[];
  turnoverMinutes: number;
  weekStart: string;
};

export function WeeklyPrintView({
  distributors,
  movies,
  rooms,
  screenings,
  turnoverMinutes,
  weekStart
}: WeeklyPrintViewProps) {
  const weekScreenings = screenings.filter((screening) => screening.weekStart === weekStart);
  const weekLabel = getWeekLabel(weekStart);

  return (
    <section className="print-only weekly-print-view">
      <header className="weekly-print-header">
        <p>CINES BABEL — PROGRAMACIÓN SEMANAL · {weekLabel}</p>
        <span>Viernes a jueves</span>
      </header>

      {WEEKDAYS.map((day, dayIndex) => (
        <section key={day.key} className="weekly-print-day">
          <p className="weekly-print-day-context">
            CINES BABEL — PROGRAMACIÓN SEMANAL · {weekLabel}
          </p>
          <h2>
            {PRINT_DAY_LABELS[day.key].toUpperCase()} · {getDayDateLabel(weekStart, dayIndex)}
          </h2>

          <div className="weekly-print-grid">
            {rooms.map((room) => {
              const roomScreenings = weekScreenings
                .filter((screening) => screening.day === day.key && screening.roomId === room.id)
                .sort(compareScreeningStartTimes);

              return (
                <article key={room.id} className="weekly-print-room">
                  <h3>{room.name}</h3>

                  {roomScreenings.length ? (
                    <div className="weekly-print-sessions">
                      {roomScreenings.map((screening) => {
                        const movie = movies.find((item) => item.id === screening.movieId);
                        const distributor = movie?.distributorId
                          ? distributors.find((item) => item.id === movie.distributorId)
                          : null;
                        const endTime = getScreeningEndTime(screening, movies);
                        const conflict = getTurnoverConflictForScreening(
                          screening,
                          weekScreenings,
                          movies,
                          turnoverMinutes
                        );

                        return (
                          <div key={screening.id} className="weekly-print-session">
                            <div className="weekly-print-session-main">
                              <strong>{screening.startsAt || "--:--"}</strong>
                              <span>{movie?.title ?? "Película pendiente"}</span>
                            </div>
                            <p>
                              {movie ? `${movie.durationMinutes} min` : "Sin duración"}
                              {endTime ? ` · Fin ${endTime}` : ""}
                              {distributor ? ` · ${distributor.name}` : ""}
                            </p>
                            {conflict ? (
                              <p className="weekly-print-conflict">
                                CONFLICTO ·{" "}
                                {conflict.actualGapMinutes < 0
                                  ? `Solapa ${Math.abs(conflict.actualGapMinutes)} min`
                                  : `Solo +${conflict.actualGapMinutes} min`}
                                {` · Mínimo ${conflict.minimumStartAt}`}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="weekly-print-empty">—</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
