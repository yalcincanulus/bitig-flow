import { and, desc, eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document } from "#/server/db/schema";
import type { DocumentId, OrganizationId, UserId } from "#/server/ids";

type NewMarkdownDocument = Readonly<{
  id: DocumentId;
  title: string;
  createdBy: UserId;
}>;

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

export async function createDocument(orgId: OrganizationId, newDocument: NewMarkdownDocument) {
  const now = new Date();
  const [created] = await db
    .insert(document)
    .values({
      id: newDocument.id,
      organizationId: orgId,
      title: newDocument.title,
      kind: "markdown",
      status: "ready",
      content: "",
      createdBy: newDocument.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Document insert returned no row");
  return created;
}

export async function deleteDocument(orgId: OrganizationId, documentId: DocumentId) {
  const [deleted] = await db
    .delete(document)
    .where(and(eq(document.organizationId, orgId), eq(document.id, documentId)))
    .returning();

  return deleted;
}
