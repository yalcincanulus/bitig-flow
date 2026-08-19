import { notFound } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { viewerResolveImage } from "#/lib/document-bytes";
import { renderHtml } from "#/lib/render-html";
import { db } from "#/server/db/client";
import { document, documentReference, visitEvent } from "#/server/db/schema";
import { documentIdSchema, type DocumentId, type VisitId } from "#/server/ids";
import {
  senderFields,
  type VisitorContentPage,
  type VisitorLink,
} from "#/server/viewer/visitor-gate";

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

export async function loadVisitorContent(
  link: VisitorLink,
  visitId: VisitId,
): Promise<VisitorContentPage> {
  const contentFields = {
    status: "content" as const,
    ...senderFields(link),
    allowDownload: link.allowDownload,
  };

  if (!link.documentId) {
    return {
      ...contentFields,
      kind: "vault",
      title: link.targetTitle,
      emptyVault: link.emptyVault,
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
    })
    .from(document)
    .where(eq(document.id, link.documentId))
    .limit(1);

  if (!found) throw notFound();

  const documentId = documentIdSchema.parse(found.id);
  await appendDocumentOpened(visitId, documentId);

  if (found.kind === "markdown") {
    const html = renderHtml(
      found.content ?? "",
      viewerResolveImage(link.slug, await referencedDocumentIds(documentId)),
    );
    return { ...contentFields, kind: "markdown", documentId, title: found.title, html };
  }

  if (found.kind === "pdf") {
    return {
      ...contentFields,
      kind: "pdf",
      documentId,
      title: found.title,
      pageCount: found.pageCount,
      fileName: found.fileName,
    };
  }

  return {
    ...contentFields,
    kind: "image",
    documentId,
    title: found.title,
    fileName: found.fileName,
  };
}
