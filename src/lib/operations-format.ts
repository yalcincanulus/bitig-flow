const countFormat = new Intl.NumberFormat("en-US");

const instantFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatOperationsCount(value: number) {
  return countFormat.format(value);
}

export function formatOperationsBytes(bytes: number) {
  if (bytes < 1_024) return `${countFormat.format(bytes)} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1_024;
    unit += 1;
  } while (value >= 1_024 && unit < units.length - 1);
  return `${value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export function formatOperationsInstant(value: Date | string) {
  return `${instantFormat.format(value instanceof Date ? value : new Date(value))} UTC`;
}

export function formatOperationsDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
