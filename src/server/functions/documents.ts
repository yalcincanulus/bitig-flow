import { createHash } from "node:crypto";

import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";

import { dashboardResolveImage } from "#/lib/document-bytes";
import {
  documentTitleMaxLength,
  markdownContentMaxBytes,
  utf8ByteLength,
} from "#/lib/markdown-limits";
import { renderHtml } from "#/lib/render-html";
import {
  allowedUploadMimeTypes,
  documentKindFromMimeType,
  isUploadOverSizeCap,
  sanitizeFileName,
  sniffUploadMimeType,
  storageKeyForDocument,
  storageKeyPrefix,
} from "#/lib/upload";
import { orgMiddleware, permission } from "#/server/auth-middleware";
import { documentIdSchema, userIdSchema } from "#/server/ids";
import { countPdfPages } from "#/server/pdf-page-count";
import {
  createDocument as createDocumentInRepository,
  createPendingUpload as createPendingUploadInRepository,
  deleteDocument as deleteDocumentInRepository,
  findDocument,
  isDocumentWriteConflict,
  listDocuments as listDocumentsFromRepository,
  markDocumentReady as markDocumentReadyInRepository,
  upsertDocument as upsertDocumentInRepository,
} from "#/server/repositories/documents";
import {
  deleteStoredObject,
  getStoredObject,
  presignPutObject,
  putStoredObject,
} from "#/server/storage";

const timestampSchema = z
  .union([z.date(), z.iso.datetime()])
  .transform((timestamp) => (typeof timestamp === "string" ? new Date(timestamp) : timestamp));

const createDocumentSchema = z.object({
  documentId: documentIdSchema,
  title: z.string().max(documentTitleMaxLength),
});

const updateDocumentSchema = z.object({
  documentId: documentIdSchema,
  title: z.string().max(documentTitleMaxLength),
  content: z.string().refine((value) => utf8ByteLength(value) <= markdownContentMaxBytes),
  updatedAt: timestampSchema,
});

const deleteDocumentSchema = z.object({ documentId: documentIdSchema });

const createUploadSchema = z.object({
  documentId: documentIdSchema,
  fileName: z.string(),
  contentType: z.enum(allowedUploadMimeTypes),
});

const confirmUploadSchema = z.object({
  documentId: documentIdSchema,
  contentType: z.enum(allowedUploadMimeTypes),
});

export type DocumentConflictError = Readonly<{
  name: "DocumentConflictError";
  code: "DOCUMENT_CONFLICT";
  updatedByName: string;
  title: string;
  content: string;
  updatedAt: Date;
}>;

export function isDocumentConflictError(error: unknown): error is DocumentConflictError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "DOCUMENT_CONFLICT"
  );
}

function documentConflictError(
  conflict: Omit<DocumentConflictError, "name" | "code">,
): DocumentConflictError {
  return {
    name: "DocumentConflictError",
    code: "DOCUMENT_CONFLICT",
    ...conflict,
  };
}

export type UploadIncompleteError = Readonly<{
  name: "UploadIncompleteError";
  code: "UPLOAD_INCOMPLETE";
  retryable: true;
}>;

export type UploadConfirmationError = Readonly<{
  name: "UploadConfirmationError";
  code: "UPLOAD_CONFIRMATION";
  check: "type" | "size";
  retryable: false;
}>;

export function isUploadIncompleteError(error: unknown): error is UploadIncompleteError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "UPLOAD_INCOMPLETE"
  );
}

export function isUploadConfirmationError(error: unknown): error is UploadConfirmationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "UPLOAD_CONFIRMATION"
  );
}

function uploadIncompleteError(): UploadIncompleteError {
  return { name: "UploadIncompleteError", code: "UPLOAD_INCOMPLETE", retryable: true };
}

function uploadConfirmationError(check: "type" | "size"): UploadConfirmationError {
  return { name: "UploadConfirmationError", code: "UPLOAD_CONFIRMATION", check, retryable: false };
}

function authoredTitle(title: string) {
  return title.trim() || "Untitled";
}

async function deleteObjectAfterRow(storageKey: string) {
  try {
    await deleteStoredObject(storageKey);
  } catch {
    // A leaked object is better than a ready Document pointing at nothing.
  }
}

async function refuseUpload(
  storageKey: string,
  orgId: Parameters<typeof deleteDocumentInRepository>[0],
  documentId: z.infer<typeof documentIdSchema>,
  check: "type" | "size",
): Promise<never> {
  await deleteDocumentInRepository(orgId, documentId);
  await deleteObjectAfterRow(storageKey);
  setResponseStatus(422);
  throw uploadConfirmationError(check);
}

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => listDocumentsFromRepository(context.orgId));

export const getDocument = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(z.object({ documentId: documentIdSchema }))
  .handler(async ({ context, data }) => {
    const found = await findDocument(context.orgId, data.documentId);
    if (!found) throw notFound();
    return found;
  });

export const renderMarkdown = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(z.object({ documentId: documentIdSchema }))
  .handler(async ({ context, data }) => {
    const found = await findDocument(context.orgId, data.documentId);
    if (!found || found.kind !== "markdown") throw notFound();
    const readyImageIds = new Set(
      (await listDocumentsFromRepository(context.orgId))
        .filter((row) => row.kind === "image" && row.status === "ready")
        .map((row) => row.id),
    );
    return renderHtml(found.content ?? "", dashboardResolveImage(readyImageIds));
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["create"] })])
  .validator(createDocumentSchema)
  .handler(({ context, data }) =>
    createDocumentInRepository(context.orgId, {
      id: data.documentId,
      title: authoredTitle(data.title),
      createdBy: userIdSchema.parse(context.userId),
    }),
  );

export const updateDocument = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["update"] })])
  .validator(updateDocumentSchema)
  .handler(async ({ context, data }) => {
    const writtenBy = userIdSchema.parse(context.userId);
    const result = await upsertDocumentInRepository(context.orgId, {
      id: data.documentId,
      title: authoredTitle(data.title),
      content: data.content,
      updatedAt: data.updatedAt,
      writtenBy,
    });

    if (!result) throw notFound();
    if (isDocumentWriteConflict(result)) {
      setResponseStatus(409);
      throw documentConflictError({
        updatedByName: result.updatedByName,
        title: result.title,
        content: result.content,
        updatedAt: result.updatedAt,
      });
    }

    return result;
  });

export const createUpload = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["create"] })])
  .validator(createUploadSchema)
  .handler(async ({ context, data }) => {
    const fileName = sanitizeFileName(data.fileName);
    const storageKey = storageKeyForDocument(context.orgId, data.documentId, storageKeyPrefix());
    const document = await createPendingUploadInRepository(context.orgId, {
      id: data.documentId,
      title: authoredTitle(fileName).slice(0, documentTitleMaxLength),
      kind: documentKindFromMimeType(data.contentType),
      fileName: fileName || null,
      storageKey,
      createdBy: userIdSchema.parse(context.userId),
    });
    const uploadUrl = await presignPutObject(document.storageKey ?? storageKey);
    return { document, uploadUrl };
  });

export const confirmUpload = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["create"] })])
  .validator(confirmUploadSchema)
  .handler(async ({ context, data }) => {
    const found = await findDocument(context.orgId, data.documentId);
    if (!found) throw notFound();
    if (found.status === "ready") return found;
    if (found.kind === "markdown" || !found.storageKey) throw notFound();

    const stored = await getStoredObject(found.storageKey);
    if (!stored) {
      setResponseStatus(409);
      throw uploadIncompleteError();
    }
    if (
      stored.oversized ||
      stored.bytes.byteLength === 0 ||
      isUploadOverSizeCap(stored.bytes.byteLength)
    ) {
      return await refuseUpload(found.storageKey, context.orgId, data.documentId, "size");
    }

    const sniffed = sniffUploadMimeType(stored.bytes);
    if (!sniffed || sniffed !== data.contentType) {
      return await refuseUpload(found.storageKey, context.orgId, data.documentId, "type");
    }

    const checksum = createHash("sha256").update(stored.bytes).digest("hex");
    const pageCount =
      sniffed === "application/pdf" ? ((await countPdfPages(stored.bytes)) ?? null) : null;
    await putStoredObject(found.storageKey, stored.bytes, sniffed);

    const confirmed = await markDocumentReadyInRepository(context.orgId, data.documentId, {
      mimeType: sniffed,
      byteSize: stored.bytes.byteLength,
      checksum,
      pageCount,
    });
    if (!confirmed) {
      const raced = await findDocument(context.orgId, data.documentId);
      if (raced?.status === "ready") return raced;
      throw notFound();
    }
    return confirmed;
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["delete"] })])
  .validator(deleteDocumentSchema)
  .handler(async ({ context, data }) => {
    const deleted = await deleteDocumentInRepository(context.orgId, data.documentId);
    if (!deleted) throw notFound();
    if (deleted.storageKey) {
      await deleteObjectAfterRow(deleted.storageKey);
    }
    return deleted;
  });
