import { randomUUID } from "node:crypto";

import { document } from "#/server/db/schema";

import { database } from "./services";

type DocumentFixtureOptions = Pick<typeof document.$inferInsert, "organizationId" | "createdBy"> & {
  title?: string;
  content?: string;
};

export async function createFixtureDocument(options: DocumentFixtureOptions) {
  const now = new Date();

  // Repositories are under test, so this independent fixture deliberately writes the table directly.
  const [created] = await database
    .insert(document)
    .values({
      organizationId: options.organizationId,
      createdBy: options.createdBy,
      title: options.title ?? `Fixture Document ${randomUUID()}`,
      kind: "markdown",
      status: "ready",
      content: options.content ?? "Fixture document content.",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Document fixture insert returned no row");
  return created;
}
