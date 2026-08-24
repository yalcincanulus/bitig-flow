import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

import { organization, user } from "./auth";

const timestampWithTimezone = () => timestamp({ withTimezone: true, mode: "date" });

const uuidV7PrimaryKey = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const documentKind = pgEnum("document_kind", ["markdown", "pdf", "image"]);

export const documentStatus = pgEnum("document_status", ["pending", "ready"]);

export const document = snakeCase.table(
  "document",
  {
    id: uuidV7PrimaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text().notNull(),
    kind: documentKind().notNull(),
    status: documentStatus().notNull(),
    content: text(),
    storageKey: text(),
    fileName: text(),
    mimeType: text(),
    byteSize: integer(),
    checksum: text(),
    pageCount: integer(),
    createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
    updatedBy: uuid().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestampWithTimezone().notNull(),
    updatedAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    check(
      "document_content_storage_check",
      sql`(
        (${table.kind} = 'markdown' AND ${table.content} IS NOT NULL AND ${table.storageKey} IS NULL)
        OR
        (${table.kind} <> 'markdown' AND (${table.status} <> 'ready' OR ${table.storageKey} IS NOT NULL))
      )`,
    ),
    check("document_byte_size_check", sql`${table.byteSize} > 0`),
    check("document_page_count_check", sql`${table.pageCount} > 0`),
    index("document_organization_id_created_at_idx").on(
      table.organizationId,
      table.createdAt.desc(),
    ),
  ],
);

// The staging half of an upload (ADR-0072). It holds the random Upload key the bytes are
// PUT to and the byte size the client declared before that URL was issued. Confirmation
// deletes the row, so a ready Document never carries one and no Upload key is ever served.
// `created_at` records when the URL was issued and is read by nothing: the Sweep bounds an
// Upload key's life through the pending Document row written in the same transaction.
export const documentUpload = snakeCase.table(
  "document_upload",
  {
    documentId: uuid()
      .primaryKey()
      .references(() => document.id, { onDelete: "cascade" }),
    uploadKey: text().notNull().unique(),
    declaredByteSize: integer().notNull(),
    createdAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    check("document_upload_declared_byte_size_check", sql`${table.declaredByteSize} > 0`),
  ],
);

export const vault = snakeCase.table(
  "vault",
  {
    id: uuidV7PrimaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    createdAt: timestampWithTimezone().notNull(),
    updatedAt: timestampWithTimezone().notNull(),
  },
  (table) => [index("vault_organization_id_idx").on(table.organizationId)],
);

export const vaultItem = snakeCase.table(
  "vault_item",
  {
    vaultId: uuid()
      .notNull()
      .references(() => vault.id, { onDelete: "cascade" }),
    documentId: uuid()
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    // Visibility belongs to the membership, not the Document: the same Document may be
    // shown by one Vault and hidden by another.
    isVisible: boolean().notNull().default(true),
    addedAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.vaultId, table.documentId] }),
    index("vault_item_document_id_idx").on(table.documentId),
  ],
);

export const documentReference = snakeCase.table(
  "document_reference",
  {
    sourceDocumentId: uuid()
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    targetDocumentId: uuid()
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.sourceDocumentId, table.targetDocumentId] }),
    check(
      "document_reference_not_self_check",
      sql`${table.sourceDocumentId} <> ${table.targetDocumentId}`,
    ),
    index("document_reference_target_document_id_idx").on(table.targetDocumentId),
  ],
);

export const documentSelectSchema = createSelectSchema(document);
export const vaultSelectSchema = createSelectSchema(vault);
export const vaultItemSelectSchema = createSelectSchema(vaultItem);
