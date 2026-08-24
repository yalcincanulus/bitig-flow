import { createHash, randomUUID } from "node:crypto";

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
  isDeclaredByteSizeAllowed,
  isUploadOverSizeCap,
  sanitizeFileName,
  sniffUploadMimeType,
  storageKeyForDocument,
  storageKeyPrefix,
  uploadKeyForOrganization,
} from "#/lib/upload";
import { orgMiddleware, permission } from "#/server/auth-middleware";
import { documentIdSchema, userIdSchema } from "#/server/ids";
import { countPdfPages } from "#/server/pdf-page-count";
import {
  createDocument as createDocumentInRepository,
  createPendingUpload as createPendingUploadInRepository,
  deleteDocument as deleteDocumentInRepository,
  findDocument,
  findStagedUpload,
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
  // The declared size is a claim, not evidence — it is what the server is asked to stage
  // for, and Confirmation still measures the bytes that actually arrived.
  byteSize: z.number(),
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

// The declared byte size is refused before any URL is signed, so this is a rejection of the
// request rather than of the bytes.
export type UploadRejectedError = Readonly<{
  name: "UploadRejectedError";
  code: "UPLOAD_REJECTED";
  reason: "size";
  retryable: false;
}>;

// A ready Document's bytes never change (ADR-0020), so it is never staged for again.
export type UploadImmutableError = Readonly<{
  name: "UploadImmutableError";
  code: "UPLOAD_IMMUTABLE";
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

function uploadRejectedError(reason: "size"): UploadRejectedError {
  return { name: "UploadRejectedError", code: "UPLOAD_REJECTED", reason, retryable: false };
}

function uploadImmutableError(): UploadImmutableError {
  return { name: "UploadImmutableError", code: "UPLOAD_IMMUTABLE", retryable: false };
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
  uploadKey: string,
  orgId: Parameters<typeof deleteDocumentInRepository>[0],
  documentId: z.infer<typeof documentIdSchema>,
  check: "type" | "size",
): Promise<never> {
  await deleteDocumentInRepository(orgId, documentId);
  await deleteObjectAfterRow(uploadKey);
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
    if (!isDeclaredByteSizeAllowed(data.byteSize)) {
      setResponseStatus(422);
      throw uploadRejectedError("size");
    }

    const fileName = sanitizeFileName(data.fileName);
    const staged = await createPendingUploadInRepository(context.orgId, {
      id: data.documentId,
      title: authoredTitle(fileName).slice(0, documentTitleMaxLength),
      kind: documentKindFromMimeType(data.contentType),
      fileName: fileName || null,
      uploadKey: uploadKeyForOrganization(context.orgId, randomUUID(), storageKeyPrefix()),
      declaredByteSize: data.byteSize,
      createdBy: userIdSchema.parse(context.userId),
    });

    // No staging state means the id was taken by a row this call did not create. If this
    // Organization owns it, it is already confirmed and never gets another upload URL
    // (ADR-0020, ADR-0072); if it does not, the id belongs to nobody it can see (ADR-0012).
    if (!staged) {
      if (!(await findDocument(context.orgId, data.documentId))) throw notFound();
      setResponseStatus(409);
      throw uploadImmutableError();
    }

    const uploadUrl = await presignPutObject(staged.uploadKey);
    return { document: staged.document, uploadUrl };
  });

export const confirmUpload = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["create"] })])
  .validator(confirmUploadSchema)
  .handler(async ({ context, data }) => {
    const staged = await findStagedUpload(context.orgId, data.documentId);
    if (!staged) {
      // Staging state is dropped by Confirmation, so its absence means either a Document
      // that is already ready — a no-op — or nothing this Organization owns.
      const found = await findDocument(context.orgId, data.documentId);
      if (found?.status === "ready" && found.kind !== "markdown") return found;
      throw notFound();
    }

    const { uploadKey, declaredByteSize } = staged;
    const stored = await getStoredObject(uploadKey);
    if (!stored) {
      setResponseStatus(409);
      throw uploadIncompleteError();
    }
    if (
      stored.oversized ||
      stored.bytes.byteLength === 0 ||
      isUploadOverSizeCap(stored.bytes.byteLength) ||
      stored.bytes.byteLength > declaredByteSize
    ) {
      return await refuseUpload(uploadKey, context.orgId, data.documentId, "size");
    }

    const sniffed = sniffUploadMimeType(stored.bytes);
    if (!sniffed || sniffed !== data.contentType) {
      return await refuseUpload(uploadKey, context.orgId, data.documentId, "type");
    }

    const checksum = createHash("sha256").update(stored.bytes).digest("hex");
    const pageCount =
      sniffed === "application/pdf" ? ((await countPdfPages(stored.bytes)) ?? null) : null;

    // The verified bytes are written to the final Storage key, which no URL was ever signed
    // for, and only then does the row become ready.
    const storageKey = storageKeyForDocument(context.orgId, data.documentId, storageKeyPrefix());
    await putStoredObject(storageKey, stored.bytes, sniffed);

    const confirmed = await markDocumentReadyInRepository(context.orgId, data.documentId, {
      storageKey,
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

    await deleteObjectAfterRow(uploadKey);
    return confirmed;
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["delete"] })])
  .validator(deleteDocumentSchema)
  .handler(async ({ context, data }) => {
    const deleted = await deleteDocumentInRepository(context.orgId, data.documentId);
    if (!deleted) throw notFound();
    for (const key of [deleted.document.storageKey, deleted.uploadKey]) {
      if (key) await deleteObjectAfterRow(key);
    }
    return deleted.document;
  });
