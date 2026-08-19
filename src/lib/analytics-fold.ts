const dayMs = 24 * 60 * 60 * 1_000;

export type AnalyticsRangeInput = {
  from?: string;
  to?: string;
};

export type ResolvedAnalyticsRange = {
  from: string;
  to: string;
  startInclusive: Date;
  endExclusive: Date;
};

export type AnalyticsVisitRow = {
  id: string;
  linkId: string;
  visitorId: string;
  email: string | null;
  startedAt: Date;
  lastSeenAt: Date;
};

export type AnalyticsEventRow = {
  visitId: string;
  documentId: string | null;
  type: "document_opened" | "page_dwell" | "download";
  payload: unknown;
  occurredAt: Date;
};

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function pageDwell(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return null;
  const { page, ms } = payload as { page?: unknown; ms?: unknown };
  if (!Number.isInteger(page) || (page as number) <= 0) return null;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  return { page: page as number, ms };
}

function pageRows(pages: ReadonlyMap<number, number>) {
  return [...pages].sort(([first], [second]) => first - second).map(([page, ms]) => ({ page, ms }));
}

function addDwell(pages: Map<number, number>, dwell: { page: number; ms: number }) {
  pages.set(dwell.page, (pages.get(dwell.page) ?? 0) + dwell.ms);
}

export function resolveAnalyticsRange(
  range: AnalyticsRangeInput,
  now = new Date(),
): ResolvedAnalyticsRange {
  const to = range.to ?? dateString(now);
  const toStart = utcDate(to);
  const from = range.from ?? dateString(new Date(toStart.getTime() - 29 * dayMs));
  const startInclusive = utcDate(from);

  if (startInclusive > toStart) {
    throw new RangeError("The start date must not be after the end date");
  }

  return {
    from,
    to,
    startInclusive,
    endExclusive: new Date(toStart.getTime() + dayMs),
  };
}

export function foldAnalytics(
  visits: ReadonlyArray<AnalyticsVisitRow>,
  events: ReadonlyArray<AnalyticsEventRow>,
  range: ResolvedAnalyticsRange,
) {
  const scopedVisits = visits.filter(
    (visit) => visit.startedAt >= range.startInclusive && visit.startedAt < range.endExclusive,
  );
  const viewerIdentities = new Set(scopedVisits.map((visit) => visit.email ?? visit.visitorId));
  const emails = new Set(
    scopedVisits.flatMap((visit) => (visit.email === null ? [] : [visit.email])),
  );
  const scopedVisitIds = new Set(scopedVisits.map((visit) => visit.id));
  const pages = new Map<number, number>();
  const documentsByVisit = new Map<
    string,
    Map<
      string,
      {
        views: number;
        totalMs: number;
        downloads: number;
        pages: Map<number, number>;
      }
    >
  >(scopedVisits.map((visit) => [visit.id, new Map()]));
  let totalMs = 0;
  let downloads = 0;

  for (const event of events) {
    if (!scopedVisitIds.has(event.visitId)) continue;
    if (event.type === "download") downloads += 1;
    const dwell = event.type === "page_dwell" ? pageDwell(event.payload) : null;
    if (dwell !== null) {
      totalMs += dwell.ms;
      addDwell(pages, dwell);
    }

    if (event.documentId === null) continue;
    const visitDocuments = documentsByVisit.get(event.visitId);
    if (visitDocuments === undefined) continue;
    let document = visitDocuments.get(event.documentId);
    if (document === undefined) {
      document = { views: 0, totalMs: 0, downloads: 0, pages: new Map() };
      visitDocuments.set(event.documentId, document);
    }

    if (event.type === "document_opened") document.views += 1;
    if (event.type === "download") document.downloads += 1;
    if (dwell !== null) {
      document.totalMs += dwell.ms;
      addDwell(document.pages, dwell);
    }
  }

  const lastSeenAt = scopedVisits.reduce<Date | null>(
    (latest, visit) => (latest === null || visit.lastSeenAt > latest ? visit.lastSeenAt : latest),
    null,
  );

  const visitRows = [...scopedVisits]
    .sort(
      (first, second) =>
        second.startedAt.getTime() - first.startedAt.getTime() || first.id.localeCompare(second.id),
    )
    .map((visit) => ({
      visitId: visit.id,
      linkId: visit.linkId,
      startedAt: visit.startedAt,
      lastSeenAt: visit.lastSeenAt,
      viewerIdentity: { email: visit.email, visitorId: visit.visitorId },
      documents: [...(documentsByVisit.get(visit.id) ?? [])]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([documentId, document]) => ({
          documentId,
          views: document.views,
          totalMs: document.totalMs,
          pagesRead: document.pages.size,
          downloads: document.downloads,
          pages: pageRows(document.pages),
        })),
    }));

  return {
    range: { from: range.from, to: range.to },
    totals: {
      visits: scopedVisits.length,
      viewerIdentities: viewerIdentities.size,
      emails: emails.size,
      totalMs,
      downloads,
    },
    lastSeenAt,
    pages: pageRows(pages),
    visits: visitRows,
  };
}
