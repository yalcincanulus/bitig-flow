import { areaY, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { useMemo, useState } from "react";

import { analyticsNumberFormat, formatTotalTime } from "#/lib/analytics-format";
import { analyticsDaysWithZeros, type AnalyticsDay } from "#/lib/analytics-fold";

const gradientId = "home-visit-trend";

function dayReading(day: AnalyticsDay) {
  const visits = `${analyticsNumberFormat.format(day.visits)} ${day.visits === 1 ? "visit" : "visits"}`;
  return day.totalMs > 0 ? `${visits} · ${formatTotalTime(day.totalMs)}` : visits;
}

/**
 * The Organization's Visits across every UTC date of a range, as one unlabelled curve.
 *
 * Home answers "is anyone reading this?" before it answers anything else, and a shape answers that
 * faster than a column of figures can. It carries no axes on purpose: the figure beside it is the
 * quantity, the curve is only the rhythm, and one date's reading arrives on hover instead.
 */
export function HomeVisitTrend({
  range,
  days,
}: Readonly<{
  range: Readonly<{ from: string; to: string }>;
  days: ReadonlyArray<AnalyticsDay>;
}>) {
  const [focused, setFocused] = useState<AnalyticsDay | null>(null);
  const dates = useMemo(() => analyticsDaysWithZeros(range, days), [range, days]);
  const definition = useMemo(() => {
    // A range nobody visited would otherwise draw its zeroes halfway up the band.
    const busiest = Math.max(...dates.map((date) => date.visits), 1);

    return defineChart({
      marks: [
        // The gradient carries the fade, so the mark must not dim it a second time.
        areaY(dates, { x: "date", y: "visits", fill: `url(#${gradientId})`, fillOpacity: 1 }),
        lineY(dates, { x: "date", y: "visits", stroke: "var(--chart-2)", strokeWidth: 2 }),
      ],
      x: { scale: () => scalePoint<string>() },
      y: { scale: () => scaleLinear().domain([0, busiest]) },
      guides: false,
      margin: { top: 8, right: 2, bottom: 2, left: 2 },
      gradients: [
        {
          id: gradientId,
          y1: 0,
          y2: 1,
          stops: [
            { offset: 0, color: "var(--chart-2)", opacity: 0.35 },
            { offset: 1, color: "var(--chart-2)", opacity: 0 },
          ],
        },
      ],
    });
  }, [dates]);

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <Chart
        definition={definition}
        height={112}
        ariaLabel="Visits per UTC date in this range"
        className="w-full"
        onFocusChange={(point) => setFocused(point?.datum ?? null)}
      />
      <figcaption className="grid grid-cols-3 items-baseline text-[0.6875rem] text-muted-foreground tabular-nums">
        <time dateTime={range.from}>{range.from}</time>
        <span className="text-center text-foreground" aria-live="polite">
          {focused === null ? null : (
            <>
              <time dateTime={focused.date}>{focused.date}</time> · {dayReading(focused)}
            </>
          )}
        </span>
        <time dateTime={range.to} className="text-right">
          {range.to}
        </time>
      </figcaption>
    </figure>
  );
}
