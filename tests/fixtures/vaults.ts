import { randomUUID } from "node:crypto";

import { vault } from "#/server/db/schema";

import { database } from "./services";

type VaultFixtureOptions = Pick<typeof vault.$inferInsert, "organizationId"> & {
  name?: string;
  description?: string;
};

export async function createFixtureVault(options: VaultFixtureOptions) {
  const now = new Date();

  // Repositories are under test, so this independent fixture deliberately writes the table directly.
  const [created] = await database
    .insert(vault)
    .values({
      organizationId: options.organizationId,
      name: options.name ?? `Fixture Vault ${randomUUID()}`,
      description: options.description ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Vault fixture insert returned no row");
  return created;
}
