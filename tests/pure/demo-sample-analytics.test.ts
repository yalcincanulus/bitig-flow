import { expect, test } from "vitest";

import { foldAnalyticsLink, resolveAnalyticsRange } from "#/lib/analytics-fold";
import { demoSampleAnalytics } from "#/server/demo-sample-analytics";
import { demoSamples } from "#/server/demo-samples";

const documents = {
  welcome: "00000000-0000-7000-8000-000000000011",
  pdf: "00000000-0000-7000-8000-000000000012",
  image: "00000000-0000-7000-8000-000000000013",
};

function sampleAnalytics(now = new Date("2026-09-08T17:00:00.000Z")) {
  return demoSampleAnalytics({
    linkId: "00000000-0000-7000-8000-000000000010",
    documents,
    now,
  });
}

test("demo sample analytics are a dated Visit history with downloads and PDF Dwell", () => {
  const sample = sampleAnalytics();
  const range = resolveAnalyticsRange({}, new Date("2026-09-08T17:00:00.000Z"));
  const folded = foldAnalyticsLink(
    sample.visits.map((visit) => ({
      id: visit.id,
      linkId: visit.linkId,
      visitorId: visit.visitorId,
      email: visit.email,
      startedAt: visit.startedAt,
      lastSeenAt: visit.lastSeenAt,
    })),
    sample.events.map((event) => ({
      visitId: event.visitId,
      documentId: event.documentId,
      type: event.type,
      payload: event.payload ?? null,
      occurredAt: event.occurredAt,
    })),
    range,
    false,
  );

  expect(sample.visitCount).toBe(sample.visits.length);
  expect(sample.eventCount).toBe(sample.events.length);
  expect(sample.visitCount).toBeGreaterThanOrEqual(20);
  expect(sample.downloadCount).toBeGreaterThanOrEqual(6);
  expect(sample.downloadCount).toBe(
    sample.events.filter((event) => event.type === "download").length,
  );
  expect(new Set(sample.visits.map((visit) => visit.visitorId)).size).toBeGreaterThanOrEqual(8);
  expect(new Set(sample.visits.flatMap((visit) => (visit.email ? [visit.email] : []))).size).toBe(
    4,
  );
  expect(folded.totals.visits).toBe(sample.visitCount);
  expect(folded.totals.downloads).toBe(sample.downloadCount);
  expect(folded.totals.emails).toBe(4);
  expect(folded.documents.map((document) => document.documentId).sort()).toEqual(
    [documents.welcome, documents.pdf, documents.image].sort(),
  );

  const pdf = folded.documents.find((document) => document.documentId === documents.pdf);
  expect(pdf?.pages.some((page) => page.page > 1)).toBe(true);
  expect(
    pdf?.pages.filter((page) => page.page > 21 && page.ms > 0).map((page) => page.page),
  ).toEqual([25, 32, 39]);
  const laterPages = pdf?.pages.filter((page) => page.page > 21 && page.ms > 0) ?? [];
  expect(new Set(laterPages.map((page) => page.ms)).size).toBe(laterPages.length);
  expect(Math.max(...(pdf?.pages.map((page) => page.page) ?? [0]))).toBeLessThanOrEqual(
    demoSamples.pdf.pageCount,
  );
  expect(
    sample.events.every(
      (event) =>
        event.type !== "download" ||
        (event.payload !== undefined && "via" in event.payload && event.payload.via === "button"),
    ),
  ).toBe(true);
  expect(sample.visits.every((visit) => visit.startedAt < visit.lastSeenAt)).toBe(true);
  expect(
    sample.visits.every((visit) => visit.startedAt <= new Date("2026-09-08T17:00:00.000Z")),
  ).toBe(true);
});
