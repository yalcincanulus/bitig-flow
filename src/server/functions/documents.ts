import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { orgMiddleware, permission } from "#/server/auth-middleware";
import { documentIdSchema, userIdSchema } from "#/server/ids";
import {
  createDocument as createDocumentInRepository,
  deleteDocument as deleteDocumentInRepository,
  findDocument,
  listDocuments as listDocumentsFromRepository,
} from "#/server/repositories/documents";

const createDocumentSchema = z.object({
  documentId: documentIdSchema,
  title: z.string(),
});

const deleteDocumentSchema = z.object({ documentId: documentIdSchema });

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
      title: data.title.trim() || "Untitled",
      createdBy: userIdSchema.parse(context.userId),
    }),
  );

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([permission({ document: ["delete"] })])
  .validator(deleteDocumentSchema)
  .handler(async ({ context, data }) => {
    const deleted = await deleteDocumentInRepository(context.orgId, data.documentId);
    if (!deleted) throw notFound();
    return deleted;
  });
