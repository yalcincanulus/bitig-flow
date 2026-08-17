import { and, desc, eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { vault } from "#/server/db/schema";
import type { OrganizationId, VaultId } from "#/server/ids";

type NewVault = Readonly<{
  id: VaultId;
  name: string;
  description: string | null;
}>;

type VaultChanges = Readonly<{
  name: string;
  description: string | null;
}>;

export function listVaults(orgId: OrganizationId) {
  return db
    .select()
    .from(vault)
    .where(eq(vault.organizationId, orgId))
    .orderBy(desc(vault.createdAt));
}

export async function createVault(orgId: OrganizationId, newVault: NewVault) {
  const now = new Date();
  const [created] = await db
    .insert(vault)
    .values({
      ...newVault,
      organizationId: orgId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Vault insert returned no row");
  return created;
}

export async function updateVault(orgId: OrganizationId, vaultId: VaultId, changes: VaultChanges) {
  const [updated] = await db
    .update(vault)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(vault.organizationId, orgId), eq(vault.id, vaultId)))
    .returning();

  return updated;
}

export async function deleteVault(orgId: OrganizationId, vaultId: VaultId) {
  const [deleted] = await db
    .delete(vault)
    .where(and(eq(vault.organizationId, orgId), eq(vault.id, vaultId)))
    .returning();

  return deleted;
}
