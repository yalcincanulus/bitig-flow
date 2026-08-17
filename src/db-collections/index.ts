import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
  documentSelectSchema,
  linkSelectSchema,
  vaultItemSelectSchema,
  vaultSelectSchema,
} from "#/server/db/schema";
import { listDocuments } from "#/server/functions/documents";
import { listLinks } from "#/server/functions/links";
import { listVaultItems } from "#/server/functions/vault-items";
import { listVaults } from "#/server/functions/vaults";

const timestampSchema = z
  .union([z.date(), z.iso.datetime()])
  .transform((timestamp) => (typeof timestamp === "string" ? new Date(timestamp) : timestamp));

const documentSchema = documentSelectSchema.extend({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const vaultSchema = vaultSelectSchema.extend({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const vaultItemSchema = vaultItemSelectSchema.extend({
  addedAt: timestampSchema,
});

// The Link repository withholds the gate password hash, so the synced shape does not carry it.
const linkSchema = linkSelectSchema.omit({ passwordHash: true }).extend({
  expiresAt: timestampSchema.nullable(),
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

  const vaults = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "vaults"],
      queryFn: () => listVaults(),
      getKey: (vault) => vault.id,
      schema: vaultSchema,
    }),
  );

  const vaultItems = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "vault-items"],
      queryFn: () => listVaultItems(),
      // Vault membership is a row keyed by its composite primary key, never an array on the Vault.
      getKey: (vaultItem) => `${vaultItem.vaultId}:${vaultItem.documentId}`,
      schema: vaultItemSchema,
    }),
  );

  const links = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "links"],
      queryFn: () => listLinks(),
      getKey: (link) => link.id,
      schema: linkSchema,
    }),
  );

  return { documents, vaults, vaultItems, links };
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
