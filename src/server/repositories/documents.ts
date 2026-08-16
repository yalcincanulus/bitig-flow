import { and, desc, eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document } from "#/server/db/schema";
import type { DocumentId, OrganizationId } from "#/server/ids";

export function listDocuments(orgId: OrganizationId) {
  return db
    .select()
    .from(document)
    .where(eq(document.organizationId, orgId))
    .orderBy(desc(document.createdAt));
}

export async function findDocument(orgId: OrganizationId, documentId: DocumentId) {
  const [found] = await db
    .select()
    .from(document)
    .where(and(eq(document.organizationId, orgId), eq(document.id, documentId)))
    .limit(1);

  return found;
}
