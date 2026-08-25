import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { initialDeploymentPolicy } from "#/lib/deployment-policy";

import { organization, user } from "./auth";
import { document, vault } from "./content";
import { link } from "./sharing";

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
    acceptNewDemos: boolean().default(false).notNull(),
    pauseAllDemoAccess: boolean().default(false).notNull(),
    signUpEnabled: boolean().default(false).notNull(),
    environmentLifetimeHours: integer()
      .default(initialDeploymentPolicy.environmentLifetimeHours)
      .notNull(),
    environmentConfirmedBytes: bigint({ mode: "number" })
      .default(initialDeploymentPolicy.environmentConfirmedBytes)
      .notNull(),
    uploadBytes: bigint({ mode: "number" }).default(initialDeploymentPolicy.uploadBytes).notNull(),
    documentCount: integer().default(initialDeploymentPolicy.documentCount).notNull(),
    uploadedDocumentCount: integer()
      .default(initialDeploymentPolicy.uploadedDocumentCount)
      .notNull(),
    vaultCount: integer().default(initialDeploymentPolicy.vaultCount).notNull(),
    linkCount: integer().default(initialDeploymentPolicy.linkCount).notNull(),
    pendingUploadCount: integer().default(initialDeploymentPolicy.pendingUploadCount).notNull(),
    confirmationCount: integer().default(initialDeploymentPolicy.confirmationCount).notNull(),
    uploadKeyLifetimeCount: integer()
      .default(initialDeploymentPolicy.uploadKeyLifetimeCount)
      .notNull(),
    deliveredBytes: bigint({ mode: "number" })
      .default(initialDeploymentPolicy.deliveredBytes)
      .notNull(),
    visitLifetimeCount: integer().default(initialDeploymentPolicy.visitLifetimeCount).notNull(),
    eventLifetimeCount: integer().default(initialDeploymentPolicy.eventLifetimeCount).notNull(),
    documentLifetimeCount: integer()
      .default(initialDeploymentPolicy.documentLifetimeCount)
      .notNull(),
    vaultLifetimeCount: integer().default(initialDeploymentPolicy.vaultLifetimeCount).notNull(),
    linkLifetimeCount: integer().default(initialDeploymentPolicy.linkLifetimeCount).notNull(),
    activeEnvironmentCount: integer()
      .default(initialDeploymentPolicy.activeEnvironmentCount)
      .notNull(),
    globalConfirmedBytes: bigint({ mode: "number" })
      .default(initialDeploymentPolicy.globalConfirmedBytes)
      .notNull(),
    globalPendingUploadCount: integer()
      .default(initialDeploymentPolicy.globalPendingUploadCount)
      .notNull(),
    globalConfirmationCount: integer()
      .default(initialDeploymentPolicy.globalConfirmationCount)
      .notNull(),
    updatedBy: uuid().references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestampWithTimezone().defaultNow().notNull(),
  },
  (table) => [
    check("deployment_policy_singleton_check", sql`${table.id} = 'deployment'`),
    check(
      "deployment_policy_positive_limits_check",
      sql`${table.environmentLifetimeHours} > 0
        AND ${table.environmentConfirmedBytes} > 0
        AND ${table.uploadBytes} > 0
        AND ${table.documentCount} > 0
        AND ${table.uploadedDocumentCount} > 0
        AND ${table.vaultCount} > 0
        AND ${table.linkCount} > 0
        AND ${table.pendingUploadCount} > 0
        AND ${table.confirmationCount} > 0
        AND ${table.uploadKeyLifetimeCount} > 0
        AND ${table.deliveredBytes} > 0
        AND ${table.visitLifetimeCount} > 0
        AND ${table.eventLifetimeCount} > 0
        AND ${table.documentLifetimeCount} > 0
        AND ${table.vaultLifetimeCount} > 0
        AND ${table.linkLifetimeCount} > 0
        AND ${table.activeEnvironmentCount} > 0
        AND ${table.globalConfirmedBytes} > 0
        AND ${table.globalPendingUploadCount} > 0
        AND ${table.globalConfirmationCount} > 0`,
    ),
    check(
      "deployment_policy_hard_ceiling_check",
      sql`${table.environmentLifetimeHours} <= ${initialDeploymentPolicy.environmentLifetimeHours}
        AND ${table.environmentConfirmedBytes} <= ${initialDeploymentPolicy.environmentConfirmedBytes}
        AND ${table.uploadBytes} <= ${initialDeploymentPolicy.uploadBytes}
        AND ${table.documentCount} <= ${initialDeploymentPolicy.documentCount}
        AND ${table.uploadedDocumentCount} <= ${initialDeploymentPolicy.uploadedDocumentCount}
        AND ${table.vaultCount} <= ${initialDeploymentPolicy.vaultCount}
        AND ${table.linkCount} <= ${initialDeploymentPolicy.linkCount}
        AND ${table.pendingUploadCount} <= ${initialDeploymentPolicy.pendingUploadCount}
        AND ${table.confirmationCount} <= ${initialDeploymentPolicy.confirmationCount}
        AND ${table.uploadKeyLifetimeCount} <= ${initialDeploymentPolicy.uploadKeyLifetimeCount}
        AND ${table.deliveredBytes} <= ${initialDeploymentPolicy.deliveredBytes}
        AND ${table.visitLifetimeCount} <= ${initialDeploymentPolicy.visitLifetimeCount}
        AND ${table.eventLifetimeCount} <= ${initialDeploymentPolicy.eventLifetimeCount}
        AND ${table.documentLifetimeCount} <= ${initialDeploymentPolicy.documentLifetimeCount}
        AND ${table.vaultLifetimeCount} <= ${initialDeploymentPolicy.vaultLifetimeCount}
        AND ${table.linkLifetimeCount} <= ${initialDeploymentPolicy.linkLifetimeCount}
        AND ${table.activeEnvironmentCount} <= ${initialDeploymentPolicy.activeEnvironmentCount}
        AND ${table.globalConfirmedBytes} <= ${initialDeploymentPolicy.globalConfirmedBytes}
        AND ${table.globalPendingUploadCount} <= ${initialDeploymentPolicy.globalPendingUploadCount}
        AND ${table.globalConfirmationCount} <= ${initialDeploymentPolicy.globalConfirmationCount}
        AND ${table.uploadedDocumentCount} <= ${table.documentCount}
        AND ${table.uploadBytes} <= ${table.environmentConfirmedBytes}
        AND ${table.documentCount} <= ${table.documentLifetimeCount}
        AND ${table.vaultCount} <= ${table.vaultLifetimeCount}
        AND ${table.linkCount} <= ${table.linkLifetimeCount}`,
    ),
  ],
);

export const demoGlobalUsage = snakeCase.table(
  "demo_global_usage",
  {
    id: text().primaryKey().default("demo-global"),
    activeEnvironmentCount: integer().default(0).notNull(),
    confirmedBytes: bigint({ mode: "number" }).default(0).notNull(),
    pendingUploadCount: integer().default(0).notNull(),
    confirmationCount: integer().default(0).notNull(),
    updatedAt: timestampWithTimezone().defaultNow().notNull(),
  },
  (table) => [
    check("demo_global_usage_singleton_check", sql`${table.id} = 'demo-global'`),
    check(
      "demo_global_usage_nonnegative_check",
      sql`${table.activeEnvironmentCount} >= 0
        AND ${table.confirmedBytes} >= 0
        AND ${table.pendingUploadCount} >= 0
        AND ${table.confirmationCount} >= 0`,
    ),
  ],
);

export const demoEnvironment = snakeCase.table(
  "demo_environment",
  {
    id: primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    anonymousReference: varchar({ length: 12 }).notNull(),
    entryKeyHash: text(),
    state: text().default("provisioning").notNull(),
    stateVersion: integer().default(0).notNull(),
    endReason: text(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    expiresAt: timestampWithTimezone().notNull(),
    documentCount: integer().default(0).notNull(),
    uploadedDocumentCount: integer().default(0).notNull(),
    vaultCount: integer().default(0).notNull(),
    linkCount: integer().default(0).notNull(),
    pendingUploadCount: integer().default(0).notNull(),
    confirmationCount: integer().default(0).notNull(),
    uploadKeyLifetimeCount: integer().default(0).notNull(),
    documentLifetimeCount: integer().default(0).notNull(),
    vaultLifetimeCount: integer().default(0).notNull(),
    linkLifetimeCount: integer().default(0).notNull(),
    confirmedBytes: bigint({ mode: "number" }).default(0).notNull(),
    reservedUploadBytes: bigint({ mode: "number" }).default(0).notNull(),
    deliveredBytes: bigint({ mode: "number" }).default(0).notNull(),
    visitLifetimeCount: integer().default(0).notNull(),
    eventLifetimeCount: integer().default(0).notNull(),
    reportCount: integer().default(0).notNull(),
    refusalCount: integer().default(0).notNull(),
    refusalCounts: jsonb()
      .$type<Readonly<Record<string, number>>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    refusalFirstAt: timestampWithTimezone(),
    refusalLastAt: timestampWithTimezone(),
    analyticsIncomplete: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex("demo_environment_user_id_uidx").on(table.userId),
    uniqueIndex("demo_environment_organization_id_uidx").on(table.organizationId),
    uniqueIndex("demo_environment_anonymous_reference_uidx").on(table.anonymousReference),
    uniqueIndex("demo_environment_entry_key_hash_uidx").on(table.entryKeyHash),
    index("demo_environment_state_expires_at_idx").on(table.state, table.expiresAt),
    check(
      "demo_environment_state_check",
      sql`${table.state} IN ('provisioning', 'active', 'global_paused', 'report_paused', 'terminating', 'completed')`,
    ),
    check(
      "demo_environment_end_reason_check",
      sql`${table.endReason} IS NULL OR ${table.endReason} IN ('expired', 'ended_by_demo_user', 'operator_terminated', 'reported', 'provisioning_failed', 'fleet_deleted')`,
    ),
    check("demo_environment_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "demo_environment_nonnegative_usage_check",
      sql`${table.stateVersion} >= 0
        AND ${table.documentCount} >= 0
        AND ${table.uploadedDocumentCount} >= 0
        AND ${table.vaultCount} >= 0
        AND ${table.linkCount} >= 0
        AND ${table.pendingUploadCount} >= 0
        AND ${table.confirmationCount} >= 0
        AND ${table.uploadKeyLifetimeCount} >= 0
        AND ${table.documentLifetimeCount} >= 0
        AND ${table.vaultLifetimeCount} >= 0
        AND ${table.linkLifetimeCount} >= 0
        AND ${table.confirmedBytes} >= 0
        AND ${table.reservedUploadBytes} >= 0
        AND ${table.deliveredBytes} >= 0
        AND ${table.visitLifetimeCount} >= 0
        AND ${table.eventLifetimeCount} >= 0
        AND ${table.reportCount} >= 0
        AND ${table.refusalCount} BETWEEN 0 AND 100`,
    ),
  ],
);

export const demoProvisioningAttempt = snakeCase.table(
  "demo_provisioning_attempt",
  {
    id: primaryKey(),
    entryKeyHash: text().notNull(),
    state: text().default("provisioning").notNull(),
    admissionKey: text(),
    admissionReserved: boolean().default(false).notNull(),
    globalReserved: boolean().default(false).notNull(),
    userId: uuid().references(() => user.id, { onDelete: "set null" }),
    organizationId: uuid().references(() => organization.id, { onDelete: "set null" }),
    environmentId: uuid().references(() => demoEnvironment.id, { onDelete: "cascade" }),
    recoveryExpiresAt: timestampWithTimezone().notNull(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    updatedAt: timestampWithTimezone().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("demo_provisioning_attempt_entry_key_hash_uidx").on(table.entryKeyHash),
    uniqueIndex("demo_provisioning_attempt_environment_id_uidx").on(table.environmentId),
    index("demo_provisioning_attempt_state_created_at_idx").on(table.state, table.createdAt),
    check(
      "demo_provisioning_attempt_state_check",
      sql`${table.state} IN ('provisioning', 'ready')`,
    ),
    check(
      "demo_provisioning_attempt_recovery_expiry_check",
      sql`${table.recoveryExpiresAt} > ${table.createdAt}`,
    ),
    check(
      "demo_provisioning_attempt_admission_state_check",
      sql`${table.admissionReserved} = (${table.admissionKey} IS NOT NULL)`,
    ),
  ],
);

export const demoSampleResource = snakeCase.table(
  "demo_sample_resource",
  {
    id: primaryKey(),
    environmentId: uuid()
      .notNull()
      .references(() => demoEnvironment.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    documentId: uuid().references(() => document.id, { onDelete: "cascade" }),
    vaultId: uuid().references(() => vault.id, { onDelete: "cascade" }),
    linkId: uuid().references(() => link.id, { onDelete: "cascade" }),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("demo_sample_resource_document_id_uidx").on(table.documentId),
    uniqueIndex("demo_sample_resource_vault_id_uidx").on(table.vaultId),
    uniqueIndex("demo_sample_resource_link_id_uidx").on(table.linkId),
    index("demo_sample_resource_environment_id_idx").on(table.environmentId),
    check(
      "demo_sample_resource_typed_target_check",
      sql`(
        (${table.kind} = 'document' AND ${table.documentId} IS NOT NULL AND ${table.vaultId} IS NULL AND ${table.linkId} IS NULL)
        OR
        (${table.kind} = 'vault' AND ${table.documentId} IS NULL AND ${table.vaultId} IS NOT NULL AND ${table.linkId} IS NULL)
        OR
        (${table.kind} = 'link' AND ${table.documentId} IS NULL AND ${table.vaultId} IS NULL AND ${table.linkId} IS NOT NULL)
      )`,
    ),
  ],
);

export const demoSummary = snakeCase.table(
  "demo_summary",
  {
    id: primaryKey(),
    startedAt: timestampWithTimezone().notNull(),
    endedAt: timestampWithTimezone().notNull(),
    retainUntil: timestampWithTimezone().notNull(),
    durationSeconds: integer().notNull(),
    endReason: text().notNull(),
    documentCreatedCount: integer().default(0).notNull(),
    vaultCreatedCount: integer().default(0).notNull(),
    linkCreatedCount: integer().default(0).notNull(),
    visitCount: integer().default(0).notNull(),
    eventCount: integer().default(0).notNull(),
    deliveredBytes: bigint({ mode: "number" }).default(0).notNull(),
    peakDocumentCount: integer().default(0).notNull(),
    peakVaultCount: integer().default(0).notNull(),
    peakLinkCount: integer().default(0).notNull(),
    peakConfirmedBytes: bigint({ mode: "number" }).default(0).notNull(),
    refusalCount: integer().default(0).notNull(),
    analyticsIncomplete: boolean().default(false).notNull(),
  },
  (table) => [
    index("demo_summary_retain_until_idx").on(table.retainUntil),
    check(
      "demo_summary_end_reason_check",
      sql`${table.endReason} IN ('expired', 'ended_by_demo_user', 'operator_terminated', 'reported', 'provisioning_failed', 'fleet_deleted')`,
    ),
    check(
      "demo_summary_bounds_check",
      sql`${table.endedAt} >= ${table.startedAt}
        AND ${table.retainUntil} > ${table.endedAt}
        AND ${table.durationSeconds} >= 0
        AND ${table.documentCreatedCount} >= 0
        AND ${table.vaultCreatedCount} >= 0
        AND ${table.linkCreatedCount} >= 0
        AND ${table.visitCount} >= 0
        AND ${table.eventCount} >= 0
        AND ${table.deliveredBytes} >= 0
        AND ${table.peakDocumentCount} >= 0
        AND ${table.peakVaultCount} >= 0
        AND ${table.peakLinkCount} >= 0
        AND ${table.peakConfirmedBytes} >= 0
        AND ${table.refusalCount} BETWEEN 0 AND 100`,
    ),
  ],
);

export const demoDailyAggregate = snakeCase.table("demo_daily_aggregate", {
  day: date({ mode: "string" }).primaryKey(),
  environmentCount: integer().default(0).notNull(),
  expiredCount: integer().default(0).notNull(),
  endedByDemoUserCount: integer().default(0).notNull(),
  operatorTerminatedCount: integer().default(0).notNull(),
  reportedCount: integer().default(0).notNull(),
  provisioningFailedCount: integer().default(0).notNull(),
  fleetDeletedCount: integer().default(0).notNull(),
  documentCreatedCount: integer().default(0).notNull(),
  vaultCreatedCount: integer().default(0).notNull(),
  linkCreatedCount: integer().default(0).notNull(),
  visitCount: integer().default(0).notNull(),
  eventCount: integer().default(0).notNull(),
  deliveredBytes: bigint({ mode: "number" }).default(0).notNull(),
  refusalCount: integer().default(0).notNull(),
  aggregatedAt: timestampWithTimezone().defaultNow().notNull(),
});

export const demoReport = snakeCase.table(
  "demo_report",
  {
    id: primaryKey(),
    environmentId: uuid()
      .notNull()
      .references(() => demoEnvironment.id, { onDelete: "cascade" }),
    linkId: uuid().references(() => link.id, { onDelete: "set null" }),
    category: text().notNull(),
    details: varchar({ length: 280 }),
    networkHash: text().notNull(),
    rateLimitWindowStartedAt: timestampWithTimezone().notNull(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    expiresAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    uniqueIndex("demo_report_environment_hash_uidx").on(table.environmentId, table.networkHash),
    index("demo_report_created_at_idx").on(table.createdAt),
    index("demo_report_expires_at_idx").on(table.expiresAt),
    check(
      "demo_report_category_check",
      sql`${table.category} IN ('spam_or_phishing', 'malware_or_suspicious_download', 'harmful_or_illegal_content')`,
    ),
    check("demo_report_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const maintenanceRun = snakeCase.table(
  "maintenance_run",
  {
    id: primaryKey(),
    kind: text().notNull(),
    status: text().default("running").notNull(),
    startedAt: timestampWithTimezone().defaultNow().notNull(),
    heartbeatAt: timestampWithTimezone().defaultNow().notNull(),
    finishedAt: timestampWithTimezone(),
    outcome: jsonb().$type<Readonly<Record<string, number>>>(),
    failure: text(),
  },
  (table) => [
    index("maintenance_run_kind_started_at_idx").on(table.kind, table.startedAt.desc()),
    check("maintenance_run_kind_check", sql`${table.kind} IN ('reaper', 'sweep', 'summary_fold')`),
    check(
      "maintenance_run_status_check",
      sql`${table.status} IN ('running', 'succeeded', 'failed')`,
    ),
    check(
      "maintenance_run_completion_check",
      sql`(${table.status} = 'running' AND ${table.finishedAt} IS NULL)
        OR (${table.status} <> 'running' AND ${table.finishedAt} IS NOT NULL)`,
    ),
  ],
);
