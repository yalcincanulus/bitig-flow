import { sql } from "drizzle-orm";
import {
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
    addedAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.vaultId, table.documentId] }),
    index("vault_item_document_id_idx").on(table.documentId),
  ],
);

export const documentSelectSchema = createSelectSchema(document);
export const vaultSelectSchema = createSelectSchema(vault);
export const vaultItemSelectSchema = createSelectSchema(vaultItem);
