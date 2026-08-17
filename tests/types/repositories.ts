import type { DocumentId } from "#/server/ids";
import { findDocument } from "#/server/repositories/documents";
import { listLinks } from "#/server/repositories/links";
import { listVaultItems } from "#/server/repositories/vault-items";
import { listVaults } from "#/server/repositories/vaults";

declare const documentId: DocumentId;

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void findDocument("untrusted-organization-id", documentId);

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void listVaults("untrusted-organization-id");

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void listVaultItems("untrusted-organization-id");

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void listLinks("untrusted-organization-id");
