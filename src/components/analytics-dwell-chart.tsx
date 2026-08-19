import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo, useRef } from "react";

import { formatTotalTime } from "#/lib/analytics-format";

type AnalyticsDwellChartProps = Readonly<{
  pages: ReadonlyArray<{ page: number; ms: number }>;
}>;

function sameDwellPages(
  left: AnalyticsDwellChartProps["pages"],
  right: AnalyticsDwellChartProps["pages"],
) {
  return (
    left.length === right.length &&
    left.every((row, index) => row.page === right[index]!.page && row.ms === right[index]!.ms)
  );
}

export function AnalyticsDwellChart({ pages: incoming }: AnalyticsDwellChartProps) {
  const captured = useRef(incoming);
  if (!sameDwellPages(captured.current, incoming)) captured.current = incoming;
  const pages = captured.current;

  const definition = useMemo(() => {
    return defineChart({
      marks: [
        barY(pages, {
          x: "page",
          y: "ms",
          fill: "var(--chart-1)",
        }),
      ],
      x: {
        scale: () => scaleBand<number>().padding(0.18),
        axis: { label: "Page" },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: {
          label: "Total time",
          ticks: { format: (value) => formatTotalTime(value) },
        },
      },
    });
  }, [pages]);

  return (
    <Chart
      definition={definition}
      height={280}
      ariaLabel="Per-page Dwell"
      className="w-full text-foreground [--ts-chart-1:var(--chart-1)]"
    />
  );
}
