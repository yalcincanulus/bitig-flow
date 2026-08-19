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

export function formatDownloadCount(count: number) {
  return count === 0 ? "" : numberFormat.format(count);
}

export function unidentifiedVisitorLabel(visitorId: string) {
  return `Visitor ${visitorId.slice(0, 8)}`;
}

export { numberFormat as analyticsNumberFormat };
