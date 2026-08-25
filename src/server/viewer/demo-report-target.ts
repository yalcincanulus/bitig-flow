import { and, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "#/server/db/client";
import { demoEnvironment, link } from "#/server/db/schema";

export async function findDemoReportTarget(slug: string, now = new Date()) {
  const [target] = await db
    .select({ environmentId: demoEnvironment.id, linkId: link.id })
    .from(link)
    .innerJoin(demoEnvironment, eq(demoEnvironment.organizationId, link.organizationId))
    .where(
      and(
        eq(link.slug, slug),
        eq(link.isActive, true),
        or(isNull(link.expiresAt), gt(link.expiresAt, now)),
        gt(demoEnvironment.expiresAt, now),
      ),
    )
    .limit(1);
  return target;
}
