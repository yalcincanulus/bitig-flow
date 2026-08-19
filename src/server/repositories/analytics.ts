import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import {
  ANALYTICS_VISIT_CAP,
  foldAnalyticsDocument,
  foldAnalyticsLink,
  foldAnalyticsOverview,
  resolveAnalyticsRange,
  type AnalyticsRangeInput,
} from "#/lib/analytics-fold";
import { db } from "#/server/db/client";
import { document, link, visit, visitEvent, visitEventTypeSchema } from "#/server/db/schema";
import { linkIdSchema, type DocumentId, type LinkId, type OrganizationId } from "#/server/ids";
import { documentReachableFromLink } from "#/server/viewer/reachability";

const visitColumns = {
  id: visit.id,
  linkId: visit.linkId,
  visitorId: visit.visitorId,
  email: visit.email,
  startedAt: visit.startedAt,
  lastSeenAt: visit.lastSeenAt,
} as const;

async function eventsForVisits(visitIds: string[]) {
  if (visitIds.length === 0) return [];

  const selectedEventRows = await db
    .select({
      visitId: visitEvent.visitId,
      documentId: visitEvent.documentId,
      type: visitEvent.type,
      payload: visitEvent.payload,
      occurredAt: visitEvent.occurredAt,
    })
    .from(visitEvent)
    .where(inArray(visitEvent.visitId, visitIds));

  return selectedEventRows.map((row) => ({
    ...row,
    type: visitEventTypeSchema.parse(row.type),
  }));
}

export async function readAnalyticsOverview(orgId: OrganizationId, input: AnalyticsRangeInput) {
  const range = resolveAnalyticsRange(input);
  const linkRows = await db
    .select({ id: link.id })
    .from(link)
    .where(eq(link.organizationId, orgId));

  const linkIds = linkRows.map(({ id }) => linkIdSchema.parse(id));
  if (linkIds.length === 0) return foldAnalyticsOverview(linkIds, [], [], range);
  const visitRows = await db.select(visitColumns).from(visit).where(inArray(visit.linkId, linkIds));
  const eventRows = await eventsForVisits(visitRows.map(({ id }) => id));

  return foldAnalyticsOverview(linkIds, visitRows, eventRows, range);
}

export async function readAnalyticsLink(
  orgId: OrganizationId,
  linkId: LinkId,
  input: AnalyticsRangeInput,
) {
  const range = resolveAnalyticsRange(input);
  const [owned] = await db
    .select({ id: link.id })
    .from(link)
    .where(and(eq(link.organizationId, orgId), eq(link.id, linkId)))
    .limit(1);

  if (!owned) return null;

  const selectedVisits = await db
    .select(visitColumns)
    .from(visit)
    .where(
      and(
        eq(visit.linkId, linkId),
        gte(visit.startedAt, range.startInclusive),
        lt(visit.startedAt, range.endExclusive),
      ),
    )
    .orderBy(desc(visit.startedAt), desc(visit.id))
    .limit(ANALYTICS_VISIT_CAP + 1);

  const truncated = selectedVisits.length > ANALYTICS_VISIT_CAP;
  const visitRows = truncated ? selectedVisits.slice(0, ANALYTICS_VISIT_CAP) : selectedVisits;
  const eventRows = await eventsForVisits(visitRows.map(({ id }) => id));

  return foldAnalyticsLink(visitRows, eventRows, range, truncated);
}

export async function readAnalyticsDocument(
  orgId: OrganizationId,
  documentId: DocumentId,
  input: AnalyticsRangeInput,
) {
  const range = resolveAnalyticsRange(input);
  const [owned] = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.organizationId, orgId), eq(document.id, documentId)))
    .limit(1);

  if (!owned) return null;

  const linkRows = await db
    .select({ id: link.id })
    .from(link)
    .where(and(eq(link.organizationId, orgId), documentReachableFromLink(documentId)));
  const linkIds = linkRows.map(({ id }) => linkIdSchema.parse(id));
  if (linkIds.length === 0) return foldAnalyticsDocument(documentId, linkIds, [], [], range);

  const visitRows = await db.select(visitColumns).from(visit).where(inArray(visit.linkId, linkIds));
  const eventRows = await eventsForVisits(visitRows.map(({ id }) => id));

  return foldAnalyticsDocument(documentId, linkIds, visitRows, eventRows, range);
}
