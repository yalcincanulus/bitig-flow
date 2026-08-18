import { and, eq, exists, or } from "drizzle-orm";

import { db } from "#/server/db/client";
import { documentReference, link, vaultItem } from "#/server/db/schema";
import { documentIdSchema, linkIdSchema } from "#/server/ids";

/**
 * A Document is reachable from a Link when it is the target, a member of the
 * target Vault, or referenced by one of those Documents. One hop, never further.
 */
export async function isDocumentReachableFromLink(linkId: string, documentId: string) {
  const parsedLinkId = linkIdSchema.safeParse(linkId);
  const parsedDocumentId = documentIdSchema.safeParse(documentId);
  if (!parsedLinkId.success || !parsedDocumentId.success) return false;

  const reachableDocumentId = parsedDocumentId.data;
  const [found] = await db
    .select({ id: link.id })
    .from(link)
    .where(
      and(
        eq(link.id, parsedLinkId.data),
        or(
          eq(link.documentId, reachableDocumentId),
          exists(
            db
              .select({ documentId: vaultItem.documentId })
              .from(vaultItem)
              .where(
                and(
                  eq(vaultItem.vaultId, link.vaultId),
                  eq(vaultItem.documentId, reachableDocumentId),
                ),
              ),
          ),
          exists(
            db
              .select({ targetDocumentId: documentReference.targetDocumentId })
              .from(documentReference)
              .where(
                and(
                  eq(documentReference.targetDocumentId, reachableDocumentId),
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
                          ),
                        ),
                    ),
                  ),
                ),
              ),
          ),
        ),
      ),
    )
    .limit(1);

  return found !== undefined;
}
