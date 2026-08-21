import { and, eq, exists, or } from "drizzle-orm";

import { db } from "#/server/db/client";
import { documentReference, link, vaultItem } from "#/server/db/schema";
import type { DocumentId, LinkId } from "#/server/ids";

/**
 * A Document is reachable from a Link when it is the target, a visible member of the
 * target Vault, or referenced by one of those Documents. One hop, never further.
 * A hidden membership is not a member here, so hiding withdraws bytes as well as listing.
 */
export function linkReachesDocument(documentId: DocumentId) {
  return or(
    eq(link.documentId, documentId),
    exists(
      db
        .select({ documentId: vaultItem.documentId })
        .from(vaultItem)
        .where(
          and(
            eq(vaultItem.vaultId, link.vaultId),
            eq(vaultItem.documentId, documentId),
            eq(vaultItem.isVisible, true),
          ),
        ),
    ),
    exists(
      db
        .select({ targetDocumentId: documentReference.targetDocumentId })
        .from(documentReference)
        .where(
          and(
            eq(documentReference.targetDocumentId, documentId),
            or(
              eq(documentReference.sourceDocumentId, link.documentId),
              exists(
                db
                  .select({ documentId: vaultItem.documentId })
                  .from(vaultItem)
                  .where(
                    and(
                      eq(vaultItem.vaultId, link.vaultId),
                      eq(vaultItem.documentId, documentReference.sourceDocumentId),
                      eq(vaultItem.isVisible, true),
                    ),
                  ),
              ),
            ),
          ),
        ),
    ),
  );
}

export async function isDocumentReachableFromLink(linkId: LinkId, documentId: DocumentId) {
  const [found] = await db
    .select({ id: link.id })
    .from(link)
    .where(and(eq(link.id, linkId), linkReachesDocument(documentId)))
    .limit(1);

  return found !== undefined;
}
