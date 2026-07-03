import { addDays, format, parseISO, startOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";

export function getFridayWeekStart(date = new Date()) {
  const day = date.getDay();
  const distanceFromFriday = (day + 2) % 7;
  return startOfDay(subDays(date, distanceFromFriday));
}

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function getWeekLabel(weekStart: string) {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);

  return `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM yyyy", {
    locale: es
  })}`;
}

export function getDayDateLabel(weekStart: string, offset: number) {
  return format(addDays(parseISO(weekStart), offset), "d MMM", { locale: es });
}

export function shiftWeek(weekStart: string, weeks: number) {
  return toDateKey(addDays(parseISO(weekStart), weeks * 7));
}
