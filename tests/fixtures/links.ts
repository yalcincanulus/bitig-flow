import { randomUUID } from "node:crypto";

import { link } from "#/server/db/schema";

import { database } from "./services";

type LinkTarget = { documentId: string; vaultId?: never } | { vaultId: string; documentId?: never };

type LinkFixtureOptions = Pick<typeof link.$inferInsert, "organizationId" | "createdBy"> &
  LinkTarget & {
    name?: string;
    slug?: string;
  };

export async function createFixtureLink(options: LinkFixtureOptions) {
  const now = new Date();

  // Repositories are under test, so this independent fixture deliberately writes the table directly.
  const [created] = await database
    .insert(link)
    .values({
      organizationId: options.organizationId,
      createdBy: options.createdBy,
      documentId: options.documentId ?? null,
      vaultId: options.vaultId ?? null,
      slug: options.slug ?? randomUUID().replaceAll("-", "").slice(0, 12),
      name: options.name ?? `Fixture Link ${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Link fixture insert returned no row");
  return created;
}
