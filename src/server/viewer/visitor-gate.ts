import { eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document, link, organization, user, vault } from "#/server/db/schema";

export type VisitorGate = Readonly<{
  senderName: string | null;
  organizationName: string;
  requiresPassword: boolean;
}>;

export async function findVisitorGate(slug: string): Promise<VisitorGate | null> {
  const now = new Date();
  const [row] = await db
    .select({
      senderName: user.name,
      organizationName: organization.name,
      passwordHash: link.passwordHash,
      expiresAt: link.expiresAt,
      isActive: link.isActive,
      targetDocumentId: document.id,
      targetVaultId: vault.id,
    })
    .from(link)
    .innerJoin(organization, eq(organization.id, link.organizationId))
    .leftJoin(user, eq(user.id, link.createdBy))
    .leftJoin(document, eq(document.id, link.documentId))
    .leftJoin(vault, eq(vault.id, link.vaultId))
    .where(eq(link.slug, slug))
    .limit(1);

  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt !== null && row.expiresAt <= now) return null;
  if (row.targetDocumentId === null && row.targetVaultId === null) return null;

  return {
    senderName: row.senderName,
    organizationName: row.organizationName,
    requiresPassword: row.passwordHash !== null,
  };
}
