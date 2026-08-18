import type { DocumentId, UserId, VaultId } from "#/server/ids";
import {
  createDocument,
  deleteDocument,
  findDocument,
  upsertDocument,
} from "#/server/repositories/documents";
import { listLinks } from "#/server/repositories/links";
import { addVaultItem, listVaultItems, removeVaultItem } from "#/server/repositories/vault-items";
import { createVault, deleteVault, listVaults, updateVault } from "#/server/repositories/vaults";

declare const documentId: DocumentId;
declare const userId: UserId;
declare const vaultId: VaultId;

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void findDocument("untrusted-organization-id", documentId);

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void createDocument("untrusted-organization-id", {
  id: documentId,
  title: "Untitled",
  createdBy: userId,
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void upsertDocument("untrusted-organization-id", {
  id: documentId,
  title: "Untitled",
  content: "",
  updatedAt: new Date(),
  writtenBy: userId,
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void deleteDocument("untrusted-organization-id", documentId);

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void listVaults("untrusted-organization-id");

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void createVault("untrusted-organization-id", {
  id: vaultId,
  name: "Vault",
  description: null,
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void updateVault("untrusted-organization-id", vaultId, {
  name: "Vault",
  description: null,
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void deleteVault("untrusted-organization-id", vaultId);

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void listVaultItems("untrusted-organization-id");

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void addVaultItem("untrusted-organization-id", {
  vaultId,
  documentId,
  addedAt: new Date(),
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void removeVaultItem("untrusted-organization-id", { vaultId, documentId });

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void listLinks("untrusted-organization-id");
