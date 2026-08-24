import { sql } from "drizzle-orm";
import { boolean, check, snakeCase, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

const timestampWithTimezone = () => timestamp({ withTimezone: true, mode: "date" });

const primaryKey = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const platformOperator = snakeCase.table(
  "platform_operator",
  {
    id: text().primaryKey().default("platform-operator"),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
  },
  (table) => [
    check("platform_operator_singleton_check", sql`${table.id} = 'platform-operator'`),
    uniqueIndex("platform_operator_user_id_uidx").on(table.userId),
  ],
);

export const operatorAuditRecord = snakeCase.table(
  "operator_audit_record",
  {
    id: primaryKey(),
    operatorUserId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    kind: text().notNull(),
    occurredAt: timestampWithTimezone().defaultNow().notNull(),
  },
  (table) => [
    check("operator_audit_record_kind_check", sql`${table.kind} IN ('bootstrap', 'recovery')`),
  ],
);

export const deploymentPolicy = snakeCase.table(
  "deployment_policy",
  {
    id: text().primaryKey().default("deployment"),
    signUpEnabled: boolean().default(false).notNull(),
  },
  (table) => [check("deployment_policy_singleton_check", sql`${table.id} = 'deployment'`)],
);
