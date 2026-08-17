import { desc, eq, getTableColumns } from "drizzle-orm";

import { db } from "#/server/db/client";
import { vault, vaultItem } from "#/server/db/schema";
import type { OrganizationId } from "#/server/ids";

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
