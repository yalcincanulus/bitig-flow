import { and, desc, eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document, user } from "#/server/db/schema";
import type { DocumentId, OrganizationId, UserId } from "#/server/ids";

type NewMarkdownDocument = Readonly<{
  id: DocumentId;
  title: string;
  createdBy: UserId;
}>;

export type MarkdownDocumentWrite = Readonly<{
  id: DocumentId;
  title: string;
  content: string;
  updatedAt: Date;
  writtenBy: UserId;
}>;

export type DocumentWriteConflict = Readonly<{
  kind: "conflict";
  updatedByName: string;
  title: string;
  content: string;
  updatedAt: Date;
}>;

type DocumentRow = typeof document.$inferSelect;

export function isDocumentWriteConflict(
  result: DocumentRow | DocumentWriteConflict,
): result is DocumentWriteConflict {
  return "updatedByName" in result;
}

function isUniqueViolation(error: unknown) {
  let current = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

async function nameForUser(userId: string | null) {
  if (!userId) return "another member";

  const [found] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return found?.name ?? "another member";
}

function markdownInsertValues(
  orgId: OrganizationId,
  write: MarkdownDocumentWrite,
  createdBy: UserId,
) {
  const now = new Date();
  return {
    id: write.id,
    organizationId: orgId,
    title: write.title,
    kind: "markdown" as const,
    status: "ready" as const,
    content: write.content,
    createdBy,
    updatedBy: write.writtenBy,
    createdAt: now,
    updatedAt: now,
  };
}

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
      updatedBy: newDocument.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const existing = await findDocument(orgId, newDocument.id);
  if (existing) return existing;
  throw new Error("Document insert returned no row");
}

async function insertMarkdownDocument(orgId: OrganizationId, write: MarkdownDocumentWrite) {
  const [created] = await db
    .insert(document)
    .values(markdownInsertValues(orgId, write, write.writtenBy))
    .returning();

  if (!created) throw new Error("Document insert returned no row");
  return created;
}

async function updateMarkdownDocument(orgId: OrganizationId, write: MarkdownDocumentWrite) {
  const [updated] = await db
    .update(document)
    .set({
      title: write.title,
      content: write.content,
      updatedBy: write.writtenBy,
      updatedAt: new Date(),
    })
    .where(and(eq(document.organizationId, orgId), eq(document.id, write.id)))
    .returning();

  return updated;
}

async function conflictFor(existing: DocumentRow): Promise<DocumentWriteConflict> {
  return {
    kind: "conflict",
    updatedByName: await nameForUser(existing.updatedBy ?? existing.createdBy),
    title: existing.title,
    content: existing.content ?? "",
    updatedAt: existing.updatedAt,
  };
}

async function applyMarkdownWrite(
  orgId: OrganizationId,
  existing: DocumentRow,
  write: MarkdownDocumentWrite,
): Promise<DocumentRow | DocumentWriteConflict | undefined> {
  if (existing.kind !== "markdown") return undefined;

  if (existing.title === write.title && existing.content === write.content) {
    return existing;
  }

  if (existing.updatedAt.getTime() !== write.updatedAt.getTime()) {
    return conflictFor(existing);
  }

  const updated = await updateMarkdownDocument(orgId, write);
  if (!updated) throw new Error("Document update returned no row");
  return updated;
}

export async function upsertDocument(orgId: OrganizationId, write: MarkdownDocumentWrite) {
  const existing = await findDocument(orgId, write.id);
  if (existing) return applyMarkdownWrite(orgId, existing, write);

  try {
    return await insertMarkdownDocument(orgId, write);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const raced = await findDocument(orgId, write.id);
    if (!raced) return undefined;
    return applyMarkdownWrite(orgId, raced, write);
  }
}

export async function deleteDocument(orgId: OrganizationId, documentId: DocumentId) {
  const [deleted] = await db
    .delete(document)
    .where(and(eq(document.organizationId, orgId), eq(document.id, documentId)))
    .returning();

  return deleted;
}
