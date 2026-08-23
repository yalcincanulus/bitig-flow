/**
 * The `YYYY-MM-DD` half of a date, read and written in local time.
 *
 * `new Date("2026-08-23")` is midnight UTC, which is the day before in every western timezone, so
 * a Calendar built on it highlights the wrong square. These two build and read the parts by hand
 * instead, which keeps the day someone picked the day they see.
 */
export function parseDateOnly(value: string | null | undefined) {
  if (!value) return undefined;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDateOnly(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `HH:mm`, the shape a time input reads and writes. */
export function formatTimeOnly(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Puts a `HH:mm` time on a day, for the moment a Link stops opening. */
export function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const combined = new Date(date);
  combined.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  return combined;
}
