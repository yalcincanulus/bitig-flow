import { formatCompletion, formatTotalTime } from "#/lib/analytics-format";
import { cn } from "#/lib/utils";

/**
 * How much of a PDF was read, as a short track with its percentage beside it.
 *
 * The figure carries the value; the track only lets a column of them be compared at a glance.
 */
export function CompletionMeter({
  value,
  label = "Completion",
  className,
}: Readonly<{ value: number; label?: string; className?: string }>) {
  const percent = Math.round(value * 100);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={formatCompletion(value)}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-chart-2" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums">{formatCompletion(value)}</span>
    </div>
  );
}

/**
 * One View's Dwell across every page of a PDF, as a strip of tiny bars.
 *
 * It is the per-page breakdown folded to the height of a text line: where the reader lingered,
 * where they skimmed, and where they never arrived, without a table per View.
 */
export function PageStrip({
  pages,
  className,
}: Readonly<{
  pages: ReadonlyArray<{ page: number; ms: number }>;
  className?: string;
}>) {
  const longest = Math.max(...pages.map((row) => row.ms), 1);

  return (
    <ol aria-label="Time per page" className={cn("flex h-6 items-end gap-px", className)}>
      {pages.map((row) => {
        const reading = `Page ${row.page}: ${row.ms > 0 ? formatTotalTime(row.ms) : "not read"}`;

        return (
          <li
            key={row.page}
            aria-label={reading}
            title={reading}
            className="flex h-full max-w-3 min-w-0.5 flex-1 items-end"
          >
            <span
              className={cn(
                "w-full rounded-t-[1px]",
                row.ms > 0 ? "bg-chart-2" : "h-0.5 bg-muted-foreground/25",
              )}
              style={row.ms > 0 ? { height: `${Math.max((row.ms / longest) * 100, 12)}%` } : {}}
            />
          </li>
        );
      })}
    </ol>
  );
}
