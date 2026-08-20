import { cn } from "#/lib/utils";

export type Stat = Readonly<{ label: string; value: string }>;

/**
 * The one way this Dashboard prints a row of numbers: a small caps label above a large figure.
 *
 * Analytics says the same five things in three places — the Organization roll-up, one Link, one
 * Document — and they were drifting apart in type size and spacing. They no longer can.
 */
export function StatList({
  stats,
  className,
}: Readonly<{ stats: ReadonlyArray<Stat>; className?: string }>) {
  return (
    <dl className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-0.5">
          <dt className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
            {stat.label}
          </dt>
          <dd className="text-xl leading-tight font-semibold tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
