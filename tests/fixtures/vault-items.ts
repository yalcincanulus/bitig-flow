import { vaultItem } from "#/server/db/schema";

import { database } from "./services";

type VaultItemFixtureOptions = Pick<typeof vaultItem.$inferInsert, "vaultId" | "documentId"> &
  Partial<Pick<typeof vaultItem.$inferInsert, "isVisible">>;

export async function createFixtureVaultItem(options: VaultItemFixtureOptions) {
  // Repositories are under test, so this independent fixture deliberately writes the table directly.
  const [created] = await database
    .insert(vaultItem)
    .values({
      vaultId: options.vaultId,
      documentId: options.documentId,
      isVisible: options.isVisible ?? true,
      addedAt: new Date(),
    })
    .returning();

  if (!created) throw new Error("Vault membership fixture insert returned no row");
  return created;
}
