import { and, desc, eq, getTableColumns } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document, vault, vaultItem } from "#/server/db/schema";
import type { DocumentId, OrganizationId, VaultId } from "#/server/ids";

type MembershipPair = Readonly<{
  vaultId: VaultId;
  documentId: DocumentId;
}>;

type NewVaultItem = MembershipPair & {
  addedAt: Date;
};

// Vault membership carries no Organization of its own, so it is scoped through its Vault.
export function listVaultItems(orgId: OrganizationId) {
  return (
    db
      .select(getTableColumns(vaultItem))
      .from(vaultItem)
      .innerJoin(vault, eq(vault.id, vaultItem.vaultId))
      .where(eq(vault.organizationId, orgId))
      // The composite primary key breaks ties, so a refetch cannot reorder rows added together.
      .orderBy(desc(vaultItem.addedAt), vaultItem.vaultId, vaultItem.documentId)
  );
}

async function ownedMembershipPair(orgId: OrganizationId, membership: MembershipPair) {
  const [owned] = await db
    .select({ vaultId: vault.id, documentId: document.id })
    .from(vault)
    .innerJoin(
      document,
      and(eq(document.id, membership.documentId), eq(document.organizationId, orgId)),
    )
    .where(and(eq(vault.id, membership.vaultId), eq(vault.organizationId, orgId)))
    .limit(1);

  return owned;
}

export async function addVaultItem(orgId: OrganizationId, membership: NewVaultItem) {
  const owned = await ownedMembershipPair(orgId, membership);
  if (!owned) return undefined;

  const [inserted] = await db
    .insert(vaultItem)
    .values({ ...owned, addedAt: membership.addedAt })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(vaultItem)
    .where(
      and(
        eq(vaultItem.vaultId, membership.vaultId),
        eq(vaultItem.documentId, membership.documentId),
      ),
    )
    .limit(1);

  return existing;
}

export async function removeVaultItem(orgId: OrganizationId, membership: MembershipPair) {
  const owned = await ownedMembershipPair(orgId, membership);
  if (!owned) return undefined;

  const [removed] = await db
    .delete(vaultItem)
    .where(and(eq(vaultItem.vaultId, owned.vaultId), eq(vaultItem.documentId, owned.documentId)))
    .returning();

  return removed;
}
