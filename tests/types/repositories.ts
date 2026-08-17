import type { DocumentId } from "#/server/ids";
import { findDocument } from "#/server/repositories/documents";
import { listLinks } from "#/server/repositories/links";
import { listVaultItems } from "#/server/repositories/vault-items";
import { createVault, deleteVault, listVaults, updateVault } from "#/server/repositories/vaults";

import type { VaultId } from "#/server/ids";

declare const documentId: DocumentId;
declare const vaultId: VaultId;

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void findDocument("untrusted-organization-id", documentId);

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
void listLinks("untrusted-organization-id");
