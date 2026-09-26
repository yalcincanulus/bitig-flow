import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/**
 * A quantity against its ceiling. The bar turns amber at 80% and red at the limit, so the one
 * resource about to refuse writes is the one that stands out.
 */
export function UsageMeter({
  label,
  used,
  limit,
  format,
}: Readonly<{
  label: string;
  used: number;
  limit: number;
  format: (value: number) => string;
}>) {
  const share = limit > 0 ? Math.min(used / limit, 1) : 0;
  const tone = share >= 1 ? "bg-destructive" : share >= 0.8 ? "bg-warning" : "bg-chart-2";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          <span className="text-foreground">{format(used)}</span> of {format(limit)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={`${format(used)} of ${format(limit)}`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", tone)}
          // A sliver keeps a non-zero use visible against an empty track.
          style={{ width: used > 0 ? `max(${share * 100}%, 3px)` : "0" }}
        />
      </div>
    </div>
  );
}

export type ReachRow = Readonly<{ label: string; hint: string; value: number }>;

/**
 * How many of a cohort reached each step, as bars against the cohort's size. It is not a strict
 * funnel — a Demo's sample Link can be visited before its User publishes anything — so every bar is
 * measured against the whole cohort rather than the step above it.
 */
export function ReachBars({
  rows,
  base,
  format,
}: Readonly<{ rows: ReadonlyArray<ReachRow>; base: number; format: (value: number) => string }>) {
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row) => {
        const share = base > 0 ? row.value / base : 0;
        return (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium">{row.label}</span>
              <span className="truncate text-[0.6875rem] text-muted-foreground">{row.hint}</span>
            </span>
            <span className="self-end text-xs tabular-nums">
              {format(row.value)}
              <span className="ml-1.5 inline-block w-9 text-right text-muted-foreground">
                {base > 0 ? `${Math.round(share * 100)}%` : "–"}
              </span>
            </span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-chart-2"
                style={{ width: row.value > 0 ? `max(${share * 100}%, 3px)` : "0" }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A short caption and its value, for the facts that describe a row rather than measure it. */
export function Detail({
  label,
  children,
  className,
}: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-[0.625rem] text-muted-foreground">{label}</dt>
      <dd className="text-xs tabular-nums">{children}</dd>
    </div>
  );
}
