import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo, useState } from "react";

import { formatOperationsCount } from "#/lib/operations-format";

type OperationsTrendRow = Readonly<{
  day: string;
  environmentCount: number;
  visitCount: number;
}>;

type TrendMeasure = "environmentCount" | "visitCount";

const measures: ReadonlyArray<{ key: TrendMeasure; title: string; unit: [string, string] }> = [
  { key: "environmentCount", title: "Demos started", unit: ["demo", "demos"] },
  { key: "visitCount", title: "Best-effort visits", unit: ["visit", "visits"] },
];

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function TrendBars({
  trend,
  measure,
}: Readonly<{ trend: ReadonlyArray<OperationsTrendRow>; measure: (typeof measures)[number] }>) {
  const [focused, setFocused] = useState<OperationsTrendRow | null>(null);
  const total = trend.reduce((sum, row) => sum + row[measure.key], 0);
  const definition = useMemo(() => {
    // An empty month would otherwise stretch its zeroes into a meaningless half-height axis.
    const busiest = Math.max(...trend.map((row) => row[measure.key]), 1);
    return defineChart({
      marks: [
        barY(trend, {
          x: "day",
          y: measure.key,
          fill: "var(--chart-2)",
          radius: { end: 2 },
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.25),
          axis: { ticks: { format: (value) => shortDay(value) } },
        },
        y: {
          scale: () => scaleLinear().domain([0, busiest]),
          nice: true,
          grid: { strokeOpacity: 0.4 },
        },
      },
      tooltip: false,
    });
  }, [trend, measure.key]);

  const reading = focused
    ? `${shortDay(focused.day)} · ${formatOperationsCount(focused[measure.key])} ${
        focused[measure.key] === 1 ? measure.unit[0] : measure.unit[1]
      }`
    : `${formatOperationsCount(total)} in 30 days`;

  return (
    <figure className="m-0 flex flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{measure.title}</span>
        <span
          aria-live="polite"
          className={
            focused ? "text-foreground tabular-nums" : "text-muted-foreground tabular-nums"
          }
        >
          {reading}
        </span>
      </figcaption>
      <Chart
        definition={definition}
        height={140}
        ariaLabel={`${measure.title} per UTC day, last 30 days`}
        className="w-full text-muted-foreground [--ts-chart-2:var(--chart-2)]"
        onFocusChange={(point) => setFocused(point?.datum ?? null)}
      />
    </figure>
  );
}

/**
 * The last thirty UTC days as two small charts, one per measure. Demos started and the visits they
 * drew differ by an order of magnitude, so sharing one axis flattened the smaller into the floor.
 */
export function OperationsTrendChart({
  trend,
}: Readonly<{ trend: ReadonlyArray<OperationsTrendRow> }>) {
  return (
    <div className="flex flex-col gap-5">
      {measures.map((measure) => (
        <TrendBars key={measure.key} trend={trend} measure={measure} />
      ))}
    </div>
  );
}
