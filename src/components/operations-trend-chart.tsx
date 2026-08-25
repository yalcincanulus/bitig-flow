import { barY, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";

type OperationsTrendRow = Readonly<{
  day: string;
  environmentCount: number;
  visitCount: number;
}>;

export function OperationsTrendChart({
  trend,
}: Readonly<{ trend: ReadonlyArray<OperationsTrendRow> }>) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(trend, {
            x: "day",
            y: "environmentCount",
            fill: "var(--chart-1)",
          }),
          lineY(trend, {
            x: "day",
            y: "visitCount",
            stroke: "var(--chart-4)",
          }),
        ],
        x: {
          scale: () => scaleBand<string>().padding(0.18),
          axis: {
            label: "UTC start date",
            ticks: { format: (value) => value.slice(5) },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { label: "Aggregate count" },
        },
      }),
    [trend],
  );

  return (
    <Chart
      definition={definition}
      height={280}
      ariaLabel="Thirty-day Demo Environment starts and best-effort public Visits"
      className="w-full text-foreground [--ts-chart-1:var(--chart-1)] [--ts-chart-4:var(--chart-4)]"
    />
  );
}
