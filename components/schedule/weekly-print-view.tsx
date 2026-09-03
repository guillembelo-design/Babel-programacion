import {
  compareScreeningStartTimes,
  getScreeningEndTime,
  getTurnoverConflictForScreening
} from "@/lib/schedule/conflicts";
import { getDayDateLabel, getWeekLabel } from "@/lib/schedule/dates";
import { Movie, Room, Screening, WeekdayKey, WEEKDAYS } from "@/lib/schedule/types";

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
  movies: Movie[];
  rooms: Room[];
  screenings: Screening[];
  turnoverMinutes: number;
  weekStart: string;
};

export function WeeklyPrintView({
  movies,
  rooms,
  screenings,
  turnoverMinutes,
  weekStart
}: WeeklyPrintViewProps) {
  const weekScreenings = screenings.filter((screening) => screening.weekStart === weekStart);
  const weekLabel = getWeekLabel(weekStart);
  const roomColumnCount = Math.max(rooms.length, 1);

  return (
    <section className="print-only weekly-print-view">
      {WEEKDAYS.map((day, dayIndex) => (
        <section key={day.key} className="weekly-print-day">
          <header className="weekly-print-page-header">
            <div className="weekly-print-brand">
              <strong>CINES BABEL</strong>
              <span>Programación semanal · {weekLabel}</span>
            </div>
            <div className="weekly-print-date">
              <strong>{PRINT_DAY_LABELS[day.key]}</strong>
              <span>{getDayDateLabel(weekStart, dayIndex)}</span>
            </div>
          </header>

          <div
            className="weekly-print-grid"
            style={{ gridTemplateColumns: `repeat(${roomColumnCount}, minmax(0, 1fr))` }}
          >
            {rooms.map((room) => {
              const roomScreenings = weekScreenings
                .filter((screening) => screening.day === day.key && screening.roomId === room.id)
                .sort(compareScreeningStartTimes);

              return (
                <article key={room.id} className="weekly-print-room">
                  <h3>{room.name}</h3>

                  {roomScreenings.length ? (
                    <div
                      className="weekly-print-sessions"
                      style={{
                        gridTemplateRows: `repeat(${roomScreenings.length}, minmax(0, 1fr))`
                      }}
                    >
                      {roomScreenings.map((screening) => {
                        const movie = movies.find((item) => item.id === screening.movieId);
                        const endTime = getScreeningEndTime(screening, movies);
                        const conflict = getTurnoverConflictForScreening(
                          screening,
                          weekScreenings,
                          movies,
                          turnoverMinutes
                        );

                        return (
                          <div key={screening.id} className="weekly-print-session">
                            <strong className="weekly-print-session-time">
                              {screening.startsAt || "--:--"}
                            </strong>
                            <h4>{movie?.title ?? "Película pendiente"}</h4>
                            <p className="weekly-print-session-meta">
                              {movie ? `${movie.durationMinutes} min` : "Sin duración"}
                              {endTime ? ` · Fin ${endTime}` : ""}
                              {movie?.director ? ` · Director/a: ${movie.director}` : ""}
                            </p>
                            {screening.sessionLabel ? (
                              <p className="weekly-print-session-label">
                                {screening.sessionLabel}
                              </p>
                            ) : null}
                            {conflict ? (
                              <p className="weekly-print-conflict">
                                CONFLICTO ·{" "}
                                {conflict.actualGapMinutes < 0
                                  ? `Solapa ${Math.abs(conflict.actualGapMinutes)} min`
                                  : `Solo +${conflict.actualGapMinutes} min`}
                                {` · Mínimo ${conflict.minimumStartAt}`}
                              </p>
                            ) : null}
                            <div className="weekly-print-notes" aria-hidden="true">
                              <span />
                              <span />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="weekly-print-empty">
                      <span>Sin sesiones</span>
                    </div>
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
