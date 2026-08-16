import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { orgMiddleware } from "#/server/auth";
import { documentIdSchema } from "#/server/ids";
import {
  findDocument,
  listDocuments as listDocumentsFromRepository,
} from "#/server/repositories/documents";

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
