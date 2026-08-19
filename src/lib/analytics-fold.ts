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

export const ANALYTICS_VISIT_CAP = 500;

export type AnalyticsOverviewLink<LinkKey extends string = string> = Readonly<{
  linkId: LinkKey;
  visits: number;
  viewerIdentities: number;
  emails: number;
  totalMs: number;
  downloads: number;
}>;

export type AnalyticsLinkDocument = Readonly<{
  documentId: string;
  views: number;
  totalMs: number;
  downloads: number;
  pages: ReadonlyArray<{ page: number; ms: number }>;
}>;

type TimelineDocumentView = {
  documentId: string;
  views: number;
  totalMs: number;
  downloads: number;
  pages: Map<number, number>;
};

function createDocumentView(documentId: string): TimelineDocumentView {
  return { documentId, views: 1, totalMs: 0, downloads: 0, pages: new Map() };
}

function viewForEvent(
  visitViews: TimelineDocumentView[],
  lastViewByVisit: Map<string, Map<string, TimelineDocumentView>>,
  event: AnalyticsEventRow,
) {
  if (event.documentId === null) return null;

  let lastByDocument = lastViewByVisit.get(event.visitId);
  if (lastByDocument === undefined) {
    lastByDocument = new Map();
    lastViewByVisit.set(event.visitId, lastByDocument);
  }

  if (event.type === "document_opened") {
    const viewed = createDocumentView(event.documentId);
    visitViews.push(viewed);
    lastByDocument.set(event.documentId, viewed);
    return viewed;
  }

  return lastByDocument.get(event.documentId) ?? null;
}

function accumulateLinkDocument(
  documents: Map<
    string,
    { views: number; totalMs: number; downloads: number; pages: Map<number, number> }
  >,
  event: AnalyticsEventRow,
  dwell: { page: number; ms: number } | null,
) {
  if (event.documentId === null) return;

  let document = documents.get(event.documentId);
  if (document === undefined) {
    document = { views: 0, totalMs: 0, downloads: 0, pages: new Map() };
    documents.set(event.documentId, document);
  }

  if (event.type === "document_opened") document.views += 1;
  if (event.type === "download") document.downloads += 1;
  if (dwell !== null) {
    document.totalMs += dwell.ms;
    addDwell(document.pages, dwell);
  }
}

function foldViewerIdentities(visits: ReturnType<typeof foldAnalytics>["visits"]) {
  return [
    ...groupRows(visits, (visit) => visit.viewerIdentity.email ?? visit.viewerIdentity.visitorId),
  ].map(([, grouped]) => {
    const latest = grouped[0]!;
    return {
      email: latest.viewerIdentity.email,
      visitorId: latest.viewerIdentity.visitorId,
      visitCount: grouped.length,
      visits: grouped,
    };
  });
}

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

function groupRows<Row, Key>(rows: ReadonlyArray<Row>, keyOf: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
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
  const viewsByVisit = new Map<string, TimelineDocumentView[]>(
    scopedVisits.map((visit) => [visit.id, []]),
  );
  const lastViewByVisit = new Map<string, Map<string, TimelineDocumentView>>();
  const linkDocuments = new Map<
    string,
    { views: number; totalMs: number; downloads: number; pages: Map<number, number> }
  >();
  let totalMs = 0;
  let downloads = 0;
  const orderedEvents = [...events].sort(
    (first, second) =>
      first.occurredAt.getTime() - second.occurredAt.getTime() ||
      first.visitId.localeCompare(second.visitId) ||
      first.type.localeCompare(second.type),
  );

  for (const event of orderedEvents) {
    if (!scopedVisitIds.has(event.visitId)) continue;
    if (event.type === "download") downloads += 1;
    const dwell = event.type === "page_dwell" ? pageDwell(event.payload) : null;
    if (dwell !== null) {
      totalMs += dwell.ms;
      addDwell(pages, dwell);
    }

    if (event.documentId === null) continue;
    accumulateLinkDocument(linkDocuments, event, dwell);
    const visitViews = viewsByVisit.get(event.visitId);
    if (visitViews === undefined) continue;
    const view = viewForEvent(visitViews, lastViewByVisit, event);
    if (view === null) continue;

    if (event.type === "download") view.downloads += 1;
    if (dwell !== null) {
      view.totalMs += dwell.ms;
      addDwell(view.pages, dwell);
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
      documents: (viewsByVisit.get(visit.id) ?? []).map((document) => ({
        documentId: document.documentId,
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
    documents: foldLinkDocuments(linkDocuments),
    visits: visitRows,
  };
}

export function foldAnalyticsOverview<LinkKey extends string>(
  linkIds: ReadonlyArray<LinkKey>,
  visits: ReadonlyArray<AnalyticsVisitRow>,
  events: ReadonlyArray<AnalyticsEventRow>,
  range: ResolvedAnalyticsRange,
) {
  const visitsByLink = groupRows(visits, (row) => row.linkId);
  const eventsByVisit = groupRows(events, (row) => row.visitId);
  const links: Array<AnalyticsOverviewLink<LinkKey>> = linkIds.map((linkId) => {
    const linkVisits = visitsByLink.get(linkId) ?? [];
    const linkEvents = linkVisits.flatMap(({ id }) => eventsByVisit.get(id) ?? []);
    const { totals } = foldAnalytics(linkVisits, linkEvents, range);

    return { linkId, ...totals };
  });

  return {
    range: { from: range.from, to: range.to },
    allTimeVisits: visits.length,
    links,
  };
}

function foldLinkDocuments(
  documents: Map<
    string,
    { views: number; totalMs: number; downloads: number; pages: Map<number, number> }
  >,
): Array<AnalyticsLinkDocument> {
  return [...documents]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([documentId, document]) => ({
      documentId,
      views: document.views,
      totalMs: document.totalMs,
      downloads: document.downloads,
      pages: pageRows(document.pages),
    }));
}

export function dwellPagesWithZeros(
  pageCount: number | null,
  pages: ReadonlyArray<{ page: number; ms: number }>,
) {
  const dwell = new Map(pages.map((row) => [row.page, row.ms]));
  const lastPage = Math.max(pageCount ?? 0, ...dwell.keys(), 0);

  return Array.from({ length: lastPage }, (_, index) => {
    const page = index + 1;
    return { page, ms: dwell.get(page) ?? 0 };
  });
}

export function foldAnalyticsLink(
  visits: ReadonlyArray<AnalyticsVisitRow>,
  events: ReadonlyArray<AnalyticsEventRow>,
  range: ResolvedAnalyticsRange,
  truncated: boolean,
) {
  const folded = foldAnalytics(visits, events, range);

  return {
    range: folded.range,
    truncated,
    lastSeenAt: folded.lastSeenAt,
    totals: folded.totals,
    pages: folded.pages,
    documents: folded.documents,
    identities: foldViewerIdentities(folded.visits),
  };
}

export type AnalyticsLinkPayload = ReturnType<typeof foldAnalyticsLink>;
