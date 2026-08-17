import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { documentSelectSchema } from "#/server/db/schema";
import { listDocuments } from "#/server/functions/documents";

const timestampSchema = z
  .union([z.date(), z.iso.datetime()])
  .transform((timestamp) => (typeof timestamp === "string" ? new Date(timestamp) : timestamp));

const documentSchema = documentSelectSchema.extend({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

function createCollections(queryClient: QueryClient, organizationId: string) {
  const documents = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "documents"],
      queryFn: () => listDocuments(),
      getKey: (document) => document.id,
      schema: documentSchema,
    }),
  );

  return { documents };
}

type OrganizationCollections = ReturnType<typeof createCollections>;

const collectionsByQueryClient = new WeakMap<QueryClient, Map<string, OrganizationCollections>>();

export function getCollections(queryClient: QueryClient, organizationId: string) {
  let collectionsByOrganization = collectionsByQueryClient.get(queryClient);
  if (!collectionsByOrganization) {
    collectionsByOrganization = new Map();
    collectionsByQueryClient.set(queryClient, collectionsByOrganization);
  }

  let collections = collectionsByOrganization.get(organizationId);
  if (!collections) {
    collections = createCollections(queryClient, organizationId);
    collectionsByOrganization.set(organizationId, collections);
  }

  return collections;
}
