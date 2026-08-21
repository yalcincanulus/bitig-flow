import { notFound } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";

import { viewerResolveImage } from "#/lib/document-bytes";
import { renderHtml } from "#/lib/render-html";
import { db } from "#/server/db/client";
import { document, documentReference, visitEvent, vaultItem } from "#/server/db/schema";
import { documentIdSchema, type DocumentId, type VaultId, type VisitId } from "#/server/ids";
import {
  senderFields,
  type VisitorContentPage,
  type VisitorLink,
  type VisitorVaultMember,
} from "#/server/viewer/visitor-gate";

async function listVaultMembers(vaultId: VaultId): Promise<ReadonlyArray<VisitorVaultMember>> {
  const rows = await db
    .select({
      id: document.id,
      title: document.title,
      kind: document.kind,
      status: document.status,
    })
    .from(vaultItem)
    .innerJoin(document, eq(document.id, vaultItem.documentId))
    .where(eq(vaultItem.vaultId, vaultId))
    .orderBy(desc(vaultItem.addedAt), vaultItem.documentId);

  return rows.map((row) => ({
    documentId: documentIdSchema.parse(row.id),
    title: row.title,
    kind: row.kind,
    status: row.status,
  }));
}

async function referencedDocumentIds(sourceDocumentId: DocumentId) {
  const rows = await db
    .select({ targetDocumentId: documentReference.targetDocumentId })
    .from(documentReference)
    .where(eq(documentReference.sourceDocumentId, sourceDocumentId));

  return new Set(rows.map((row) => row.targetDocumentId));
}

async function appendDocumentOpened(visitId: VisitId, documentId: DocumentId) {
  await db.insert(visitEvent).values({
    visitId,
    documentId,
    type: "document_opened",
    occurredAt: new Date(),
  });
}

export async function isVaultMember(vaultId: VaultId, documentId: DocumentId) {
  const [found] = await db
    .select({ documentId: vaultItem.documentId })
    .from(vaultItem)
    .where(and(eq(vaultItem.vaultId, vaultId), eq(vaultItem.documentId, documentId)))
    .limit(1);

  return found !== undefined;
}

export async function loadVisitorContent(
  link: VisitorLink,
  visitId: VisitId,
  memberDocumentId?: DocumentId,
): Promise<VisitorContentPage> {
  const contentFields = {
    status: "content" as const,
    ...senderFields(link),
    allowDownload: link.allowDownload,
    slug: link.slug,
    vaultTitle: memberDocumentId ? link.targetTitle : null,
  };

  const documentId = memberDocumentId ?? link.documentId;
  if (!documentId) {
    return {
      ...contentFields,
      kind: "vault_index",
      title: link.targetTitle,
      members: link.vaultId ? await listVaultMembers(link.vaultId) : [],
    };
  }

  const [found] = await db
    .select({
      id: document.id,
      kind: document.kind,
      title: document.title,
      content: document.content,
      pageCount: document.pageCount,
      fileName: document.fileName,
      documentStatus: document.status,
    })
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  if (!found) throw notFound();

  const openedDocumentId = documentIdSchema.parse(found.id);
  await appendDocumentOpened(visitId, openedDocumentId);

  if (found.kind === "markdown") {
    const html = renderHtml(
      found.content ?? "",
      viewerResolveImage(link.slug, await referencedDocumentIds(openedDocumentId)),
    );
    return {
      ...contentFields,
      kind: "markdown",
      documentId: openedDocumentId,
      title: found.title,
      html,
    };
  }

  if (found.kind === "pdf") {
    return {
      ...contentFields,
      kind: "pdf",
      documentId: openedDocumentId,
      title: found.title,
      pageCount: found.pageCount,
      fileName: found.fileName,
      bytesPending: found.documentStatus === "pending",
    };
  }

  return {
    ...contentFields,
    kind: "image",
    documentId: openedDocumentId,
    title: found.title,
    fileName: found.fileName,
    bytesPending: found.documentStatus === "pending",
  };
}
