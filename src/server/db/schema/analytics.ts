import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { document } from "./content";
import { link } from "./sharing";

const timestampWithTimezone = () => timestamp({ withTimezone: true, mode: "date" });

const uuidV7PrimaryKey = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const visit = snakeCase.table(
  "visit",
  {
    id: uuidV7PrimaryKey(),
    linkId: uuid()
      .notNull()
      .references(() => link.id, { onDelete: "cascade" }),
    visitorId: text().notNull(),
    email: text(),
    emailVerified: boolean().default(false).notNull(),
    gateVersion: integer().notNull(),
    startedAt: timestampWithTimezone().notNull(),
    lastSeenAt: timestampWithTimezone().notNull(),
    expiresAt: timestampWithTimezone().notNull(),
    userAgent: text(),
    ipHash: text(),
  },
  (table) => [
    check(
      "visit_verified_email_check",
      sql`NOT ${table.emailVerified} OR ${table.email} IS NOT NULL`,
    ),
    index("visit_link_id_started_at_idx").on(table.linkId, table.startedAt.desc()),
    index("visit_visitor_id_idx").on(table.visitorId),
  ],
);

export const visitEventTypeSchema = z.enum(["document_opened", "page_dwell", "download"]);

export const visitEvent = snakeCase.table(
  "visit_event",
  {
    id: uuidV7PrimaryKey(),
    visitId: uuid()
      .notNull()
      .references(() => visit.id, { onDelete: "cascade" }),
    documentId: uuid().references(() => document.id, { onDelete: "cascade" }),
    type: text().notNull(),
    payload: jsonb(),
    occurredAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    index("visit_event_visit_id_occurred_at_idx").on(table.visitId, table.occurredAt),
    index("visit_event_document_id_idx").on(table.documentId),
    index("visit_event_document_id_type_idx").on(table.documentId, table.type),
  ],
);

export const visitSelectSchema = createSelectSchema(visit);
export const visitEventSelectSchema = createSelectSchema(visitEvent, {
  type: visitEventTypeSchema,
});
