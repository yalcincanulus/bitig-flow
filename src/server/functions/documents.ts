import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  documentTitleMaxLength,
  markdownContentMaxBytes,
  utf8ByteLength,
} from "#/lib/markdown-limits";
import { orgMiddleware, permission } from "#/server/auth-middleware";
import { documentIdSchema, userIdSchema } from "#/server/ids";
import {
  createDocument as createDocumentInRepository,
  deleteDocument as deleteDocumentInRepository,
  findDocument,
  isDocumentWriteConflict,
  listDocuments as listDocumentsFromRepository,
  upsertDocument as upsertDocumentInRepository,
} from "#/server/repositories/documents";

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

function authoredTitle(title: string) {
  return title.trim() || "Untitled";
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

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["delete"] })])
  .validator(deleteDocumentSchema)
  .handler(async ({ context, data }) => {
    const deleted = await deleteDocumentInRepository(context.orgId, data.documentId);
    if (!deleted) throw notFound();
    return deleted;
  });
