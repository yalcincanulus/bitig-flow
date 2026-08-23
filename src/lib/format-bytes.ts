const units = ["B", "KB", "MB", "GB"] as const;

/**
 * A stored size at a glance. One decimal from KB up, none for bytes, so a column of sizes stays
 * the same width and can be read down rather than across.
 */
export function formatByteSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return null;

  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
}
