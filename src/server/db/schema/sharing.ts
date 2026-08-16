import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

import { organization, user } from "./auth";
import { document, vault } from "./content";

const timestampWithTimezone = () => timestamp({ withTimezone: true, mode: "date" });

const uuidV7PrimaryKey = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const link = snakeCase.table(
  "link",
  {
    id: uuidV7PrimaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid().references(() => document.id, { onDelete: "cascade" }),
    vaultId: uuid().references(() => vault.id, { onDelete: "cascade" }),
    slug: varchar({ length: 12 }).notNull(),
    name: text(),
    passwordHash: text(),
    requiresEmail: boolean().default(false).notNull(),
    requiresVerification: boolean().default(false).notNull(),
    gateVersion: integer().default(1).notNull(),
    allowDownload: boolean().default(false).notNull(),
    expiresAt: timestampWithTimezone(),
    isActive: boolean().default(true).notNull(),
    createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestampWithTimezone().notNull(),
    updatedAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    check(
      "link_exactly_one_target_check",
      sql`(${table.documentId} IS NULL) <> (${table.vaultId} IS NULL)`,
    ),
    check(
      "link_verification_requires_email_check",
      sql`NOT ${table.requiresVerification} OR ${table.requiresEmail}`,
    ),
    uniqueIndex("link_slug_uidx").on(table.slug),
    index("link_organization_id_idx").on(table.organizationId),
    index("link_document_id_idx").on(table.documentId),
    index("link_vault_id_idx").on(table.vaultId),
  ],
);

export const linkSelectSchema = createSelectSchema(link);
