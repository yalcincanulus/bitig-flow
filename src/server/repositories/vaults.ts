import { desc, eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { vault } from "#/server/db/schema";
import type { OrganizationId } from "#/server/ids";

export function listVaults(orgId: OrganizationId) {
  return db
    .select()
    .from(vault)
    .where(eq(vault.organizationId, orgId))
    .orderBy(desc(vault.createdAt));
}
