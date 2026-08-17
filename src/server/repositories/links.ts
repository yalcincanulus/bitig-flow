import { desc, eq, getTableColumns } from "drizzle-orm";

import { db } from "#/server/db/client";
import { link } from "#/server/db/schema";
import type { OrganizationId } from "#/server/ids";

// A gate password is never recoverable (ADR-0005), so its hash never leaves the server boundary.
const { passwordHash: _passwordHash, ...linkColumns } = getTableColumns(link);

export function listLinks(orgId: OrganizationId) {
  return db
    .select(linkColumns)
    .from(link)
    .where(eq(link.organizationId, orgId))
    .orderBy(desc(link.createdAt));
}
