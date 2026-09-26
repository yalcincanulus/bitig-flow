const numberFormat = new Intl.NumberFormat();

export function formatTotalTime(milliseconds: number) {
  if (milliseconds < 1_000) return `${numberFormat.format(milliseconds)} ms`;
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatAnalyticsInstant(value: Date | string) {
  const dateTime = value instanceof Date ? value.toISOString() : value;
  return { dateTime, label: `${dateTime.slice(0, 16).replace("T", " ")} UTC` };
}

const momentFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const clockFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const completionFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

/** A UTC instant as a reader scans it — "Sep 26, 13:29 UTC" — with the ISO form for `dateTime`. */
export function formatAnalyticsMoment(value: Date | string) {
  const date = new Date(value);
  return { dateTime: date.toISOString(), label: `${momentFormat.format(date)} UTC` };
}

/** A Visit's span, printing the date once when it starts and ends on the same UTC date. */
export function formatAnalyticsSpan(startedAt: Date | string, lastSeenAt: Date | string) {
  const start = new Date(startedAt);
  const end = new Date(lastSeenAt);
  const sameDate = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
  const endLabel = sameDate ? clockFormat.format(end) : momentFormat.format(end);
  return `${momentFormat.format(start)} – ${endLabel} UTC`;
}

export function formatCompletion(value: number) {
  return completionFormat.format(value);
}

export function formatDownloadCount(count: number) {
  return count === 0 ? "" : numberFormat.format(count);
}

export function unidentifiedVisitorLabel(visitorId: string) {
  return `Visitor ${visitorId.slice(0, 8)}`;
}

export { numberFormat as analyticsNumberFormat };
