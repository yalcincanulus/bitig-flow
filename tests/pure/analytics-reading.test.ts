import { expect, test } from "vitest";

import { foldLinkReading, viewCompletion, type ReadingDocument } from "#/lib/analytics-reading";

const pdf: ReadingDocument = { kind: "pdf", pageCount: 4 };
const markdown: ReadingDocument = { kind: "markdown", pageCount: null };

function view(documentId: string, pages: ReadonlyArray<number>, totalMs = 1_000, downloads = 0) {
  return {
    documentId,
    views: 1,
    totalMs,
    pagesRead: pages.length,
    downloads,
    pages: pages.map((page) => ({ page, ms: 500 })),
  };
}

function visit(lastSeenAt: string, documents: ReturnType<typeof view>[]) {
  return {
    visitId: lastSeenAt,
    linkId: "link",
    startedAt: new Date(lastSeenAt),
    lastSeenAt: new Date(lastSeenAt),
    viewerIdentity: { email: null, visitorId: "visitor" },
    documents,
  };
}

test("completion is the share of a PDF's pages that received Dwell, capped at the whole", () => {
  expect(viewCompletion(1, pdf)).toBe(0.25);
  expect(viewCompletion(4, pdf)).toBe(1);
  expect(viewCompletion(9, pdf)).toBe(1);
});

test("only a PDF with a known page count has a completion", () => {
  expect(viewCompletion(1, markdown)).toBeNull();
  expect(viewCompletion(1, { kind: "image", pageCount: null })).toBeNull();
  expect(viewCompletion(1, { kind: "pdf", pageCount: null })).toBeNull();
  expect(viewCompletion(1, undefined)).toBeNull();
});

test("a PDF opened and never read counts as zero completion, not as missing", () => {
  const reading = foldLinkReading(
    [
      {
        email: null,
        visitorId: "visitor",
        visitCount: 1,
        visits: [visit("2026-09-01T10:00:00.000Z", [view("pdf", [])])],
      },
    ],
    new Map([["pdf", pdf]]),
  );

  expect(reading.completion).toBe(0);
  expect(reading.documents.get("pdf")?.completion).toBe(0);
});

test("the reading fold averages completion per View, per document, and per identity", () => {
  const reading = foldLinkReading(
    [
      {
        email: "a@example.com",
        visitorId: "visitor-a",
        visitCount: 2,
        visits: [
          visit("2026-09-02T10:00:00.000Z", [view("pdf", [1, 2, 3, 4], 4_000, 1)]),
          visit("2026-09-01T10:00:00.000Z", [view("pdf", [1, 2]), view("md", [1])]),
        ],
      },
      {
        email: null,
        visitorId: "visitor-b",
        visitCount: 1,
        visits: [visit("2026-09-03T10:00:00.000Z", [view("pdf", [1])])],
      },
    ],
    new Map([
      ["pdf", pdf],
      ["md", markdown],
    ]),
  );

  expect(reading.completion).toBeCloseTo((1 + 0.5 + 0.25) / 3);
  expect(reading.documents.get("pdf")).toEqual({
    views: 3,
    completion: (1 + 0.5 + 0.25) / 3,
    readersByPage: new Map([
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 1],
    ]),
  });
  expect(reading.documents.get("md")?.completion).toBeNull();
  expect(reading.identities.get("a@example.com")).toEqual({
    totalMs: 6_000,
    downloads: 1,
    completion: 0.75,
    lastSeenAt: new Date("2026-09-02T10:00:00.000Z"),
  });
  expect(reading.identities.get("visitor-b")?.completion).toBe(0.25);
});
