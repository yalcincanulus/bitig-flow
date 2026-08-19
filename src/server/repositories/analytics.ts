import { eq, inArray } from "drizzle-orm";

import {
  foldAnalytics,
  resolveAnalyticsRange,
  type AnalyticsRangeInput,
  type ResolvedAnalyticsRange,
} from "#/lib/analytics-fold";
import { db } from "#/server/db/client";
import { link, visit, visitEvent, visitEventTypeSchema } from "#/server/db/schema";
import type { OrganizationId } from "#/server/ids";

type LinkAnalytics = Readonly<{
  linkId: string;
  visits: number;
  viewerIdentities: number;
  emails: number;
  totalMs: number;
  downloads: number;
}>;

function emptyOverview(range: ResolvedAnalyticsRange) {
  return {
    range: { from: range.from, to: range.to },
    allTimeVisits: 0,
    links: [] as LinkAnalytics[],
  };
}

export async function readAnalyticsOverview(orgId: OrganizationId, input: AnalyticsRangeInput) {
  const range = resolveAnalyticsRange(input);
  const linkRows = await db
    .select({ id: link.id })
    .from(link)
    .where(eq(link.organizationId, orgId));

  if (linkRows.length === 0) return emptyOverview(range);

  const linkIds = linkRows.map(({ id }) => id);
  const visitRows = await db
    .select({
      id: visit.id,
      linkId: visit.linkId,
      visitorId: visit.visitorId,
      email: visit.email,
      startedAt: visit.startedAt,
      lastSeenAt: visit.lastSeenAt,
    })
    .from(visit)
    .where(inArray(visit.linkId, linkIds));

  const visitIds = visitRows.map(({ id }) => id);
  const selectedEventRows =
    visitIds.length === 0
      ? []
      : await db
          .select({
            visitId: visitEvent.visitId,
            documentId: visitEvent.documentId,
            type: visitEvent.type,
            payload: visitEvent.payload,
            occurredAt: visitEvent.occurredAt,
          })
          .from(visitEvent)
          .where(inArray(visitEvent.visitId, visitIds));
  const eventRows = selectedEventRows.map((row) => ({
    ...row,
    type: visitEventTypeSchema.parse(row.type),
  }));

  const visitsByLink = new Map<string, typeof visitRows>();
  for (const row of visitRows) {
    const rows = visitsByLink.get(row.linkId);
    if (rows) rows.push(row);
    else visitsByLink.set(row.linkId, [row]);
  }

  const eventsByVisit = new Map<string, typeof eventRows>();
  for (const row of eventRows) {
    const rows = eventsByVisit.get(row.visitId);
    if (rows) rows.push(row);
    else eventsByVisit.set(row.visitId, [row]);
  }

  const links = linkIds.map((linkId) => {
    const linkVisits = visitsByLink.get(linkId) ?? [];
    const linkEvents = linkVisits.flatMap(({ id }) => eventsByVisit.get(id) ?? []);
    const { totals } = foldAnalytics(linkVisits, linkEvents, range);

    return { linkId, ...totals };
  });

  return {
    range: { from: range.from, to: range.to },
    allTimeVisits: visitRows.length,
    links,
  };
}
