import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { v7 as uuidv7 } from "uuid";

import { storageKeyForDocument } from "#/lib/upload";
import { document } from "#/server/db/schema";

import { database } from "./services";
import { putFixtureObject } from "./storage";

const samplesDirectory = fileURLToPath(new URL("./samples", import.meta.url));

export function readUploadSample(name: string) {
  return new Uint8Array(readFileSync(join(samplesDirectory, name)));
}

type DocumentFixtureOptions = Pick<typeof document.$inferInsert, "organizationId" | "createdBy"> & {
  title?: string;
  content?: string;
};

type PendingDocumentFixtureOptions = Pick<
  typeof document.$inferInsert,
  "organizationId" | "createdBy"
> & {
  kind?: "pdf" | "image";
  fileName?: string;
  bytes?: Uint8Array;
  contentType?: string;
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

export async function createFixturePendingDocument(options: PendingDocumentFixtureOptions) {
  const now = new Date();
  const id = uuidv7();
  const storageKey = storageKeyForDocument(options.organizationId, id);
  const kind = options.kind ?? "pdf";
  const fileName = options.fileName ?? "fixture.pdf";

  const [created] = await database
    .insert(document)
    .values({
      id,
      organizationId: options.organizationId,
      createdBy: options.createdBy,
      title: fileName,
      kind,
      status: "pending",
      fileName,
      storageKey,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Pending Document fixture insert returned no row");

  if (options.bytes) {
    await putFixtureObject(
      storageKey,
      options.bytes,
      options.contentType ?? (kind === "pdf" ? "application/pdf" : "image/png"),
    );
  }

  return created;
}
