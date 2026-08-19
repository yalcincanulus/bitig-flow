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

test("a Visit keeps a row per Document opened rather than flattening a reopen", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [visitRow("visit", "2026-08-01T12:00:00.000Z")];
  const events = [
    eventRow("visit", "document_opened", null, "2026-08-01T12:01:00.000Z"),
    eventRow("visit", "page_dwell", { page: 1, ms: 1_000 }, "2026-08-01T12:02:00.000Z"),
    eventRow("visit", "page_dwell", { page: 1, ms: 500 }, "2026-08-01T12:03:00.000Z"),
    eventRow("visit", "page_dwell", { page: 3, ms: 500 }, "2026-08-01T12:04:00.000Z"),
    eventRow("visit", "download", { via: "button" }, "2026-08-01T12:05:00.000Z"),
    eventRow("visit", "document_opened", null, "2026-08-01T12:06:00.000Z"),
    eventRow("visit", "download", { via: "button" }, "2026-08-01T12:07:00.000Z"),
  ];

  expect(foldAnalytics(visits, events, range).visits[0]?.documents).toEqual([
    {
      documentId: "document-1",
      views: 1,
      totalMs: 2_000,
      pagesRead: 2,
      downloads: 1,
      pages: [
        { page: 1, ms: 1_500 },
        { page: 3, ms: 500 },
      ],
    },
    {
      documentId: "document-1",
      views: 1,
      totalMs: 0,
      pagesRead: 0,
      downloads: 1,
      pages: [],
    },
  ]);
});

test("a Visit that opened nothing still appears", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [visitRow("empty", "2026-08-01T12:00:00.000Z")];

  expect(foldAnalytics(visits, [], range).visits).toEqual([
    {
      visitId: "empty",
      linkId: "link-1",
      startedAt: visits[0]?.startedAt,
      lastSeenAt: visits[0]?.lastSeenAt,
      viewerIdentity: { email: null, visitorId: "visitor-empty" },
      documents: [],
    },
  ]);
});

test("a download without a View does not invent a timeline row", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [visitRow("visit", "2026-08-01T12:00:00.000Z")];
  const events = [eventRow("visit", "download", { via: "button" })];

  expect(foldAnalytics(visits, events, range).visits[0]?.documents).toEqual([]);
  expect(foldAnalyticsLink(visits, events, range, false).documents).toEqual([
    {
      documentId: "document-1",
      views: 0,
      totalMs: 0,
      downloads: 1,
      pages: [],
    },
  ]);
});

test("the per-Link fold groups Visits by Viewer identity, newest identity first", () => {
  const range = resolveAnalyticsRange({ from: "2026-08-01", to: "2026-08-17" });
  const visits = [
    visitRow("later-anon", "2026-08-03T12:00:00.000Z", { visitorId: "cookie-later" }),
    visitRow("second-email", "2026-08-02T12:00:00.000Z", {
      visitorId: "cookie-b",
      email: "reader@example.com",
    }),
    visitRow("first-email", "2026-08-01T12:00:00.000Z", {
      visitorId: "cookie-a",
      email: "reader@example.com",
    }),
    visitRow("earlier-anon", "2026-08-01T08:00:00.000Z", { visitorId: "cookie-later" }),
  ];

  const folded = foldAnalyticsLink(visits, [], range, false);

  expect(folded.identities.map((identity) => identity.visitCount)).toEqual([2, 2]);
  expect(
    folded.identities.map((identity) => ({
      email: identity.email,
      visitorId: identity.visitorId,
      visitIds: identity.visits.map((visit) => visit.visitId),
    })),
  ).toEqual([
    { email: null, visitorId: "cookie-later", visitIds: ["later-anon", "earlier-anon"] },
    {
      email: "reader@example.com",
      visitorId: "cookie-b",
      visitIds: ["second-email", "first-email"],
    },
  ]);
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
    identities: [
      {
        email: null,
        visitorId: "visitor-second",
        visitCount: 1,
        visits: [
          {
            visitId: "second",
            linkId: "link-1",
            startedAt: visits[1]?.startedAt,
            lastSeenAt: visits[1]?.lastSeenAt,
            viewerIdentity: { email: null, visitorId: "visitor-second" },
            documents: [
              {
                documentId: "document-1",
                views: 1,
                totalMs: 500,
                pagesRead: 1,
                downloads: 1,
                pages: [{ page: 2, ms: 500 }],
              },
            ],
          },
        ],
      },
      {
        email: null,
        visitorId: "visitor-first",
        visitCount: 1,
        visits: [
          {
            visitId: "first",
            linkId: "link-1",
            startedAt: visits[0]?.startedAt,
            lastSeenAt: visits[0]?.lastSeenAt,
            viewerIdentity: { email: null, visitorId: "visitor-first" },
            documents: [
              {
                documentId: "document-1",
                views: 1,
                totalMs: 1_000,
                pagesRead: 1,
                downloads: 0,
                pages: [{ page: 1, ms: 1_000 }],
              },
            ],
          },
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
  documentId = "document-1",
) {
  return {
    visitId,
    documentId,
    type,
    payload,
    occurredAt: new Date(occurredAt),
  };
}
