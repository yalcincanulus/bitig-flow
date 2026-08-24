import { randomUUID } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import {
  documentKindFromMimeType,
  storageKeyForDocument,
  storageKeyPrefix,
  uploadKeyForOrganization,
  uploadMaxBytes,
  type AllowedUploadMimeType,
} from "#/lib/upload";
import { document, documentUpload } from "#/server/db/schema";

import { database } from "./services";
import { putFixtureObject } from "./storage";
import { readUploadSample } from "./upload-samples";

export { readUploadSample };

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
  declaredByteSize?: number;
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
  const uploadKey = uploadKeyForOrganization(
    options.organizationId,
    randomUUID(),
    storageKeyPrefix(),
  );
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
      // A pending Document has no final Storage key: its bytes are staged, not confirmed.
      storageKey: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Pending Document fixture insert returned no row");

  await database.insert(documentUpload).values({
    documentId: id,
    uploadKey,
    declaredByteSize: options.declaredByteSize ?? options.bytes?.byteLength ?? uploadMaxBytes,
    createdAt: now,
  });

  if (options.bytes) {
    await putFixtureObject(
      uploadKey,
      options.bytes,
      options.contentType ?? (kind === "pdf" ? "application/pdf" : "image/png"),
    );
  }

  return { ...created, uploadKey };
}

type UploadedDocumentFixtureOptions = Pick<
  typeof document.$inferInsert,
  "organizationId" | "createdBy"
> & {
  contentType: AllowedUploadMimeType;
  fileName?: string;
  bytes?: Uint8Array;
  storedContentType?: string;
};

export async function createFixtureUploadedDocument(options: UploadedDocumentFixtureOptions) {
  const now = new Date();
  const id = uuidv7();
  const storageKey = storageKeyForDocument(options.organizationId, id, storageKeyPrefix());
  const fileName = options.fileName ?? "fixture.bin";
  const kind = documentKindFromMimeType(options.contentType);

  const [created] = await database
    .insert(document)
    .values({
      id,
      organizationId: options.organizationId,
      createdBy: options.createdBy,
      title: fileName,
      kind,
      status: "ready",
      fileName,
      storageKey,
      mimeType: options.contentType,
      byteSize: options.bytes?.byteLength ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Uploaded Document fixture insert returned no row");

  if (options.bytes) {
    await putFixtureObject(
      storageKey,
      options.bytes,
      options.storedContentType ?? options.contentType,
    );
  }

  return created;
}
