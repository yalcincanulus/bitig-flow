import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo, useState } from "react";

import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";

type AnalyticsDwellChartProps = Readonly<{
  pages: ReadonlyArray<{ page: number; ms: number }>;
  /** How many Views reached each page, read out beside the time on hover. */
  readersByPage?: ReadonlyMap<number, number>;
  views?: number;
}>;

type DwellPage = AnalyticsDwellChartProps["pages"][number];

function sameDwellPages(
  left: AnalyticsDwellChartProps["pages"],
  right: AnalyticsDwellChartProps["pages"],
) {
  return (
    left.length === right.length &&
    left.every((row, index) => row.page === right[index]!.page && row.ms === right[index]!.ms)
  );
}

function pageReading(
  page: DwellPage,
  readersByPage: ReadonlyMap<number, number> | undefined,
  views: number | undefined,
) {
  const time = page.ms > 0 ? formatTotalTime(page.ms) : "not read";
  if (readersByPage === undefined || views === undefined || views === 0) {
    return `Page ${page.page} · ${time}`;
  }
  const readers = analyticsNumberFormat.format(readersByPage.get(page.page) ?? 0);
  return `Page ${page.page} · ${time} · reached in ${readers} of ${analyticsNumberFormat.format(views)} views`;
}

export function AnalyticsDwellChart({
  pages: incoming,
  readersByPage,
  views,
}: AnalyticsDwellChartProps) {
  // The caller rebuilds this array every render, so hold the last one that differed by value.
  const [pages, setPages] = useState(incoming);
  if (!sameDwellPages(pages, incoming)) setPages(incoming);
  const [focused, setFocused] = useState<DwellPage | null>(null);

  const definition = useMemo(() => {
    return defineChart({
      marks: [
        barY(pages, {
          x: "page",
          y: "ms",
          fill: "var(--chart-2)",
          radius: { end: 3 },
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<number>().padding(0.2),
          axis: { label: "Page" },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: { strokeOpacity: 0.4 },
          axis: {
            ticks: { format: (value) => (value === 0 ? "0" : formatTotalTime(value)) },
          },
        },
      },
      tooltip: false,
    });
  }, [pages]);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <Chart
        definition={definition}
        height={220}
        ariaLabel="Time per page"
        className="w-full text-muted-foreground [--ts-chart-2:var(--chart-2)]"
        onFocusChange={(point) => setFocused(point?.datum ?? null)}
      />
      <figcaption className="min-h-4 text-[0.6875rem] text-muted-foreground tabular-nums">
        <span aria-live="polite" className={focused === null ? undefined : "text-foreground"}>
          {focused === null
            ? "Hover or focus a bar to read one page."
            : pageReading(focused, readersByPage, views)}
        </span>
      </figcaption>
    </figure>
  );
}
