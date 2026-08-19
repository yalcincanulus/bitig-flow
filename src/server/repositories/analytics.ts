import { eq, inArray } from "drizzle-orm";

import {
  foldAnalyticsOverview,
  resolveAnalyticsRange,
  type AnalyticsRangeInput,
} from "#/lib/analytics-fold";
import { db } from "#/server/db/client";
import { link, visit, visitEvent, visitEventTypeSchema } from "#/server/db/schema";
import { linkIdSchema, type OrganizationId } from "#/server/ids";

export async function readAnalyticsOverview(orgId: OrganizationId, input: AnalyticsRangeInput) {
  const range = resolveAnalyticsRange(input);
  const linkRows = await db
    .select({ id: link.id })
    .from(link)
    .where(eq(link.organizationId, orgId));

  const linkIds = linkRows.map(({ id }) => linkIdSchema.parse(id));
  if (linkIds.length === 0) return foldAnalyticsOverview(linkIds, [], [], range);
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

  return foldAnalyticsOverview(linkIds, visitRows, eventRows, range);
}
