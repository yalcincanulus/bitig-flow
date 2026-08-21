import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { BasicIndex, createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
  documentSelectSchema,
  linkSelectSchema,
  vaultItemSelectSchema,
  vaultSelectSchema,
} from "#/server/db/schema";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  updateDocument,
} from "#/server/functions/documents";
import { takeSharePassword } from "#/lib/pending-share-password";
import {
  createLink,
  deleteLink,
  listLinks,
  rotateLinkSlug,
  updateLink,
} from "#/server/functions/links";
import { addVaultItem, listVaultItems, removeVaultItem } from "#/server/functions/vault-items";
import { createVault, deleteVault, listVaults, updateVault } from "#/server/functions/vaults";

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
  passwordSet: z.boolean(),
  expiresAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

function vaultItemKey({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return `${vaultId}:${documentId}` as const;
}

// Dashboard collections stay warm for the QueryClient's life (ADR-0034). Query must not GC them
// after live queries unmount, or cleanupQueryIfIdle warns that a preload refcount has no listeners.
const collectionQueryGcTime = Number.POSITIVE_INFINITY;

function createCollections(queryClient: QueryClient, organizationId: string) {
  const vaultItems = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "vault-items"],
      gcTime: collectionQueryGcTime,
      queryFn: () => listVaultItems(),
      // Vault membership is a row keyed by its composite primary key, never an array on the Vault.
      getKey: vaultItemKey,
      schema: vaultItemSchema,
      onInsert: async ({ transaction, collection }) => {
        const created = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            addVaultItem({
              data: {
                vaultId: modified.vaultId,
                documentId: modified.documentId,
                addedAt: modified.addedAt,
              },
            }),
          ),
        );
        collection.utils.writeInsert(created);
        return { refetch: false };
      },
      onDelete: async ({ transaction, collection }) => {
        const deleted = await Promise.all(
          transaction.mutations.map(({ original }) =>
            removeVaultItem({
              data: {
                vaultId: original.vaultId,
                documentId: original.documentId,
              },
            }),
          ),
        );
        collection.utils.writeDelete(deleted.map(vaultItemKey));
        return { refetch: false };
      },
    }),
  );

  const links = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "links"],
      gcTime: collectionQueryGcTime,
      queryFn: () => listLinks(),
      getKey: (link) => link.id,
      schema: linkSchema,
      onInsert: async ({ transaction, collection }) => {
        const created = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            createLink({
              data: {
                linkId: modified.id,
                documentId: modified.documentId ?? undefined,
                vaultId: modified.vaultId ?? undefined,
                name: modified.name,
                password: takeSharePassword(modified.id) ?? undefined,
                requiresEmail: modified.requiresEmail,
                requiresVerification: modified.requiresVerification,
                allowDownload: modified.allowDownload,
                expiresAt: modified.expiresAt,
              },
            }),
          ),
        );
        collection.utils.writeInsert(created);
        return { refetch: false };
      },
      onUpdate: async ({ transaction, collection }) => {
        const updated = await Promise.all(
          transaction.mutations.map(({ modified, original }) => {
            if (modified.slug !== original.slug) {
              return rotateLinkSlug({ data: { linkId: modified.id } });
            }

            const password = takeSharePassword(modified.id);
            return updateLink({
              data: {
                linkId: modified.id,
                name: modified.name,
                password,
                requiresEmail: modified.requiresEmail,
                requiresVerification: modified.requiresVerification,
                allowDownload: modified.allowDownload,
                expiresAt: modified.expiresAt,
                isActive: modified.isActive,
              },
            });
          }),
        );
        collection.utils.writeUpdate(updated);
        return { refetch: false };
      },
      onDelete: async ({ transaction, collection }) => {
        const deleted = await Promise.all(
          transaction.mutations.map(({ original }) =>
            deleteLink({ data: { linkId: original.id } }),
          ),
        );
        collection.utils.writeDelete(deleted.map(({ id }) => id));
        return { refetch: false };
      },
    }),
  );

  const documents = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "documents"],
      gcTime: collectionQueryGcTime,
      queryFn: () => listDocuments(),
      getKey: (document) => document.id,
      schema: documentSchema,
      onInsert: async ({ transaction, collection }) => {
        const created = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            createDocument({
              data: {
                documentId: modified.id,
                title: modified.title,
              },
            }),
          ),
        );
        collection.utils.writeInsert(created);
        return { refetch: false };
      },
      onUpdate: async ({ transaction, collection }) => {
        const updated = await Promise.all(
          transaction.mutations.map(({ modified, original }) =>
            updateDocument({
              data: {
                documentId: modified.id,
                title: modified.title,
                content: modified.content ?? "",
                updatedAt: original.updatedAt,
              },
            }),
          ),
        );
        collection.utils.writeUpdate(updated);
        return { refetch: false };
      },
      onDelete: async ({ transaction, collection }) => {
        const deleted = await Promise.all(
          transaction.mutations.map(({ original }) =>
            deleteDocument({ data: { documentId: original.id } }),
          ),
        );
        const deletedDocumentIds = new Set(deleted.map(({ id }) => id));
        const membershipKeys = vaultItems.toArray
          .filter(({ documentId }) => deletedDocumentIds.has(documentId))
          .map(vaultItemKey);
        const linkIds = links.toArray
          .filter(({ documentId }) => documentId && deletedDocumentIds.has(documentId))
          .map(({ id }) => id);

        collection.utils.writeDelete([...deletedDocumentIds]);
        if (membershipKeys.length > 0) vaultItems.utils.writeDelete(membershipKeys);
        if (linkIds.length > 0) links.utils.writeDelete(linkIds);
        return { refetch: false };
      },
    }),
  );

  const vaults = createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["organizations", organizationId, "vaults"],
      gcTime: collectionQueryGcTime,
      queryFn: () => listVaults(),
      getKey: (vault) => vault.id,
      schema: vaultSchema,
      onInsert: async ({ transaction, collection }) => {
        const created = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            createVault({
              data: {
                vaultId: modified.id,
                name: modified.name,
                description: modified.description ?? undefined,
              },
            }),
          ),
        );
        collection.utils.writeInsert(created);
        return { refetch: false };
      },
      onUpdate: async ({ transaction, collection }) => {
        const updated = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            updateVault({
              data: {
                vaultId: modified.id,
                name: modified.name,
                description: modified.description,
              },
            }),
          ),
        );
        collection.utils.writeUpdate(updated);
        return { refetch: false };
      },
      onDelete: async ({ transaction, collection }) => {
        const deleted = await Promise.all(
          transaction.mutations.map(({ original }) =>
            deleteVault({ data: { vaultId: original.id } }),
          ),
        );
        const deletedVaultIds = new Set(deleted.map(({ id }) => id));
        const membershipKeys = vaultItems.toArray
          .filter(({ vaultId }) => deletedVaultIds.has(vaultId))
          .map(vaultItemKey);
        const linkIds = links.toArray
          .filter(({ vaultId }) => vaultId && deletedVaultIds.has(vaultId))
          .map(({ id }) => id);

        collection.utils.writeDelete([...deletedVaultIds]);
        if (membershipKeys.length > 0) vaultItems.utils.writeDelete(membershipKeys);
        if (linkIds.length > 0) links.utils.writeDelete(linkIds);
        return { refetch: false };
      },
    }),
  );

  // Joins and filters load by Document or Vault id; without these indexes TanStack DB falls back
  // to a full scan and warns on every live query that needs the field.
  vaultItems.createIndex((row) => row.documentId, { indexType: BasicIndex });
  vaultItems.createIndex((row) => row.vaultId, { indexType: BasicIndex });
  links.createIndex((row) => row.documentId, { indexType: BasicIndex });
  links.createIndex((row) => row.vaultId, { indexType: BasicIndex });

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
