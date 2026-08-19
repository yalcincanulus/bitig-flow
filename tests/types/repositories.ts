import type { DocumentId, LinkId, UserId, VaultId } from "#/server/ids";
import { readAnalyticsOverview } from "#/server/repositories/analytics";
import {
  createDocument,
  deleteDocument,
  findDocument,
  upsertDocument,
} from "#/server/repositories/documents";
import { isDocumentReachableFromLink } from "#/server/viewer/reachability";
import { createLink, deleteLink, rotateLinkSlug, updateLink } from "#/server/repositories/links";
import { addVaultItem, listVaultItems, removeVaultItem } from "#/server/repositories/vault-items";
import { createVault, deleteVault, listVaults, updateVault } from "#/server/repositories/vaults";

declare const documentId: DocumentId;
declare const linkId: LinkId;
declare const userId: UserId;
declare const vaultId: VaultId;

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void readAnalyticsOverview("untrusted-organization-id", {});

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

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void createLink("untrusted-organization-id", {
  id: linkId,
  documentId,
  name: null,
  passwordHash: null,
  requiresEmail: false,
  requiresVerification: false,
  allowDownload: false,
  expiresAt: null,
  createdBy: userId,
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void updateLink("untrusted-organization-id", linkId, {
  name: null,
  requiresEmail: false,
  requiresVerification: false,
  allowDownload: false,
  expiresAt: null,
  isActive: true,
});

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void rotateLinkSlug("untrusted-organization-id", linkId);

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void deleteLink("untrusted-organization-id", linkId);

// @ts-expect-error A bare request string is not a LinkId.
void isDocumentReachableFromLink("untrusted-link-id", documentId);

void isDocumentReachableFromLink(linkId, documentId);
