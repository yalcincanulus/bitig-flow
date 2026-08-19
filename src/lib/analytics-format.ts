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

export { numberFormat as analyticsNumberFormat };
