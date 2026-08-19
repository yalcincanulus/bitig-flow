import { expect, test } from "vitest";

import { foldAnalytics, foldAnalyticsLink, resolveAnalyticsRange } from "#/lib/analytics-fold";

test("an absent analytics range resolves to the last 30 UTC dates", () => {
  expect(resolveAnalyticsRange({}, new Date("2026-08-19T23:30:00.000Z"))).toEqual({
    from: "2026-07-21",
    to: "2026-08-19",
    startInclusive: new Date("2026-07-21T00:00:00.000Z"),
    endExclusive: new Date("2026-08-20T00:00:00.000Z"),
  });
});

test("the analytics fold includes the whole UTC end date", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [
    visitRow("start", "2026-08-01T00:00:00.000Z"),
    visitRow("end", "2026-08-17T23:59:59.999Z"),
    visitRow("after", "2026-08-18T00:00:00.000Z"),
  ];

  expect(foldAnalytics(visits, [], range).totals.visits).toBe(2);
});

test("one Visitor id stays split after an email is captured", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [
    visitRow("anonymous", "2026-08-01T12:00:00.000Z", { visitorId: "same-visitor" }),
    visitRow("identified", "2026-08-02T12:00:00.000Z", {
      visitorId: "same-visitor",
      email: "reader@example.com",
    }),
  ];

  expect(foldAnalytics(visits, [], range).totals.viewerIdentities).toBe(2);
});

test("two Visitor ids stay separate when only one Visit captured their shared email", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [
    visitRow("first-cookie", "2026-08-01T12:00:00.000Z", {
      visitorId: "first-visitor",
      email: "reader@example.com",
    }),
    visitRow("second-cookie", "2026-08-02T12:00:00.000Z", {
      visitorId: "second-visitor",
    }),
  ];

  expect(foldAnalytics(visits, [], range).totals.viewerIdentities).toBe(2);
});

test("totals count Visits, Viewer identities, captured emails, Dwell, and every download", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [
    visitRow("first", "2026-08-01T12:00:00.000Z", { email: "reader@example.com" }),
    visitRow("second", "2026-08-17T23:00:00.000Z", { email: "reader@example.com" }),
    visitRow("outside", "2026-07-31T23:59:59.999Z", { email: "other@example.com" }),
  ];
  const events = [
    eventRow("first", "page_dwell", { page: 1, ms: 1_500 }),
    eventRow("second", "page_dwell", { page: 2, ms: 2_000 }, "2026-08-20T00:00:00.000Z"),
    eventRow("first", "download", { via: "button" }),
    eventRow("first", "download", { via: "button" }),
    eventRow("outside", "page_dwell", { page: 1, ms: 9_999 }),
    eventRow("outside", "download", { via: "button" }),
  ];

  expect(foldAnalytics(visits, events, range).totals).toEqual({
    visits: 2,
    viewerIdentities: 1,
    emails: 1,
    totalMs: 3_500,
    downloads: 2,
  });
});

test("the page aggregate sums Dwell and exposes distinct pages read", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [visitRow("visit", "2026-08-01T12:00:00.000Z")];
  const events = [
    eventRow("visit", "page_dwell", { page: 1, ms: 1_000 }),
    eventRow("visit", "page_dwell", { page: 1, ms: 500 }),
    eventRow("visit", "page_dwell", { page: 3, ms: 500 }),
  ];

  expect(foldAnalytics(visits, events, range).pages).toEqual([
    { page: 1, ms: 1_500 },
    { page: 3, ms: 500 },
  ]);
});

test("a Visit keeps its per-Document views, pages read, Total time, and download count", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [visitRow("visit", "2026-08-01T12:00:00.000Z")];
  const events = [
    eventRow("visit", "document_opened", null),
    eventRow("visit", "page_dwell", { page: 1, ms: 1_000 }),
    eventRow("visit", "page_dwell", { page: 1, ms: 500 }),
    eventRow("visit", "page_dwell", { page: 3, ms: 500 }),
    eventRow("visit", "download", { via: "button" }),
    eventRow("visit", "document_opened", null),
    eventRow("visit", "download", { via: "button" }),
  ];

  expect(foldAnalytics(visits, events, range).visits[0]?.documents[0]).toEqual({
    documentId: "document-1",
    views: 2,
    totalMs: 2_000,
    pagesRead: 2,
    downloads: 2,
    pages: [
      { page: 1, ms: 1_500 },
      { page: 3, ms: 500 },
    ],
  });
});

test("the per-Link fold flags truncation and rolls Documents up across Visits", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [
    visitRow("first", "2026-08-01T12:00:00.000Z"),
    visitRow("second", "2026-08-02T12:00:00.000Z"),
  ];
  const events = [
    eventRow("first", "document_opened", null),
    eventRow("first", "page_dwell", { page: 1, ms: 1_000 }),
    eventRow("second", "document_opened", null),
    eventRow("second", "page_dwell", { page: 2, ms: 500 }),
    eventRow("second", "download", { via: "button" }),
  ];

  expect(foldAnalyticsLink(visits, events, range, true)).toEqual({
    range: { from: "2026-08-01", to: "2026-08-17" },
    truncated: true,
    lastSeenAt: visits[1]?.lastSeenAt,
    totals: {
      visits: 2,
      viewerIdentities: 2,
      emails: 0,
      totalMs: 1_500,
      downloads: 1,
    },
    pages: [
      { page: 1, ms: 1_000 },
      { page: 2, ms: 500 },
    ],
    documents: [
      {
        documentId: "document-1",
        views: 2,
        totalMs: 1_500,
        downloads: 1,
        pages: [
          { page: 1, ms: 1_000 },
          { page: 2, ms: 500 },
        ],
      },
    ],
  });
});

function visitRow(
  id: string,
  startedAt: string,
  overrides: Partial<{ visitorId: string; email: string | null }> = {},
) {
  const date = new Date(startedAt);
  return {
    id,
    linkId: "link-1",
    visitorId: overrides.visitorId ?? `visitor-${id}`,
    email: overrides.email ?? null,
    startedAt: date,
    lastSeenAt: date,
  };
}

function eventRow(
  visitId: string,
  type: "document_opened" | "page_dwell" | "download",
  payload: unknown,
  occurredAt = "2026-08-01T12:05:00.000Z",
) {
  return {
    visitId,
    documentId: "document-1",
    type,
    payload,
    occurredAt: new Date(occurredAt),
  };
}
