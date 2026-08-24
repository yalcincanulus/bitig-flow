import { and, desc, eq, inArray } from "drizzle-orm";

import { extractDocumentReferences } from "#/lib/document-references";
import { db } from "#/server/db/client";
import { document, documentReference, documentUpload, user } from "#/server/db/schema";
import { type DocumentId, type OrganizationId, type UserId } from "#/server/ids";

type NewMarkdownDocument = Readonly<{
  id: DocumentId;
  title: string;
  createdBy: UserId;
}>;

type NewPendingUpload = Readonly<{
  id: DocumentId;
  title: string;
  kind: "pdf" | "image";
  fileName: string | null;
  uploadKey: string;
  declaredByteSize: number;
  createdBy: UserId;
}>;

type ConfirmedUpload = Readonly<{
  storageKey: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  pageCount: number | null;
}>;

export type StagedUpload = Readonly<{
  document: DocumentRow;
  uploadKey: string;
  declaredByteSize: number;
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
type DatabaseExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

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

async function replaceDocumentReferences(
  executor: DatabaseExecutor,
  orgId: OrganizationId,
  sourceDocumentId: DocumentId,
  content: string,
) {
  const referencedIds = extractDocumentReferences(content).filter((id) => id !== sourceDocumentId);

  await executor
    .delete(documentReference)
    .where(eq(documentReference.sourceDocumentId, sourceDocumentId));

  if (referencedIds.length === 0) return;

  const owned = await executor
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.organizationId, orgId), inArray(document.id, referencedIds)));

  if (owned.length === 0) return;

  await executor.insert(documentReference).values(
    owned.map((row) => ({
      sourceDocumentId,
      targetDocumentId: row.id,
    })),
  );
}

async function insertMarkdownDocument(
  executor: DatabaseExecutor,
  orgId: OrganizationId,
  write: MarkdownDocumentWrite,
) {
  const [created] = await executor
    .insert(document)
    .values(markdownInsertValues(orgId, write, write.writtenBy))
    .returning();

  if (!created) throw new Error("Document insert returned no row");
  await replaceDocumentReferences(executor, orgId, write.id, write.content);
  return created;
}

async function updateMarkdownDocument(
  executor: DatabaseExecutor,
  orgId: OrganizationId,
  write: MarkdownDocumentWrite,
) {
  const [updated] = await executor
    .update(document)
    .set({
      title: write.title,
      content: write.content,
      updatedBy: write.writtenBy,
      updatedAt: new Date(),
    })
    .where(and(eq(document.organizationId, orgId), eq(document.id, write.id)))
    .returning();

  if (updated) {
    await replaceDocumentReferences(executor, orgId, write.id, write.content);
  }

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
  executor: DatabaseExecutor,
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

  const updated = await updateMarkdownDocument(executor, orgId, write);
  if (!updated) throw new Error("Document update returned no row");
  return updated;
}

export async function upsertDocument(orgId: OrganizationId, write: MarkdownDocumentWrite) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(document)
        .where(and(eq(document.organizationId, orgId), eq(document.id, write.id)))
        .limit(1);

      if (existing) return applyMarkdownWrite(tx, orgId, existing, write);
      return await insertMarkdownDocument(tx, orgId, write);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const raced = await findDocument(orgId, write.id);
    if (!raced) return undefined;

    return db.transaction(async (tx) => applyMarkdownWrite(tx, orgId, raced, write));
  }
}

// The Document row and its staging state are written together: a pending upload with no
// Upload key would be a row nothing could ever confirm.
export async function createPendingUpload(
  orgId: OrganizationId,
  pending: NewPendingUpload,
): Promise<StagedUpload | undefined> {
  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(document)
      .values({
        id: pending.id,
        organizationId: orgId,
        title: pending.title,
        kind: pending.kind,
        status: "pending",
        fileName: pending.fileName,
        // The final Storage key is written by Confirmation and never before it (ADR-0072).
        storageKey: null,
        createdBy: pending.createdBy,
        updatedBy: pending.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted) return undefined;

    await tx.insert(documentUpload).values({
      documentId: pending.id,
      uploadKey: pending.uploadKey,
      declaredByteSize: pending.declaredByteSize,
      createdAt: now,
    });

    return inserted;
  });

  if (created) {
    return {
      document: created,
      uploadKey: pending.uploadKey,
      declaredByteSize: pending.declaredByteSize,
    };
  }

  // A repeated call reuses the staging state it already issued, so a retry cannot strand a
  // second staged object, and a confirmed Document is never handed a fresh upload URL.
  return findStagedUpload(orgId, pending.id);
}

export async function findStagedUpload(
  orgId: OrganizationId,
  documentId: DocumentId,
): Promise<StagedUpload | undefined> {
  const [found] = await db
    .select({
      document,
      uploadKey: documentUpload.uploadKey,
      declaredByteSize: documentUpload.declaredByteSize,
    })
    .from(document)
    .innerJoin(documentUpload, eq(documentUpload.documentId, document.id))
    .where(and(eq(document.organizationId, orgId), eq(document.id, documentId)))
    .limit(1);

  return found;
}

export async function markDocumentReady(
  orgId: OrganizationId,
  documentId: DocumentId,
  confirmed: ConfirmedUpload,
) {
  // Becoming ready and losing the staging state are one write: a ready Document that still
  // held an Upload key would be handed a fresh upload URL for bytes that are already final.
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(document)
      .set({
        status: "ready",
        storageKey: confirmed.storageKey,
        mimeType: confirmed.mimeType,
        byteSize: confirmed.byteSize,
        checksum: confirmed.checksum,
        pageCount: confirmed.pageCount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(document.organizationId, orgId),
          eq(document.id, documentId),
          eq(document.status, "pending"),
        ),
      )
      .returning();

    if (updated) {
      await tx.delete(documentUpload).where(eq(documentUpload.documentId, documentId));
    }

    return updated;
  });
}

// The staged object has to be read before the row that names it, because deleting the
// Document cascades its staging state away.
export async function deleteDocument(orgId: OrganizationId, documentId: DocumentId) {
  const staged = await findStagedUpload(orgId, documentId);

  const [deleted] = await db
    .delete(document)
    .where(and(eq(document.organizationId, orgId), eq(document.id, documentId)))
    .returning();

  if (!deleted) return undefined;
  return { document: deleted, uploadKey: staged?.uploadKey ?? null };
}
