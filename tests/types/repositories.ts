import type { DocumentId } from "#/server/ids";
import { findDocument } from "#/server/repositories/documents";

declare const documentId: DocumentId;

// @ts-expect-error A bare request string is not an OrganizationId minted by orgMiddleware.
void findDocument("untrusted-organization-id", documentId);
