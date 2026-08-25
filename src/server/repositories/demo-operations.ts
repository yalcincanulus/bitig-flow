import { asc, count, desc, gte } from "drizzle-orm";

import { initialDeploymentPolicy } from "#/lib/deployment-policy";
import { demoEndReasonSchema } from "#/lib/demo-operations";
import { buildOperationsActivityOverview } from "#/lib/operations";
import { db } from "#/server/db/client";
import {
  demoDailyAggregate,
  demoEnvironment,
  demoGlobalUsage,
  demoReport,
  demoSummary,
  deploymentPolicy,
  maintenanceRun,
} from "#/server/db/schema";
import { terminateDemoEnvironment } from "#/server/repositories/demo-lifecycle";

const fleetDeletionBatchSize = 5;

const operationsEnvironmentSelection = {
  id: demoEnvironment.id,
  anonymousReference: demoEnvironment.anonymousReference,
  state: demoEnvironment.state,
  stateVersion: demoEnvironment.stateVersion,
  endReason: demoEnvironment.endReason,
  createdAt: demoEnvironment.createdAt,
  expiresAt: demoEnvironment.expiresAt,
  documentCount: demoEnvironment.documentCount,
  uploadedDocumentCount: demoEnvironment.uploadedDocumentCount,
  vaultCount: demoEnvironment.vaultCount,
  linkCount: demoEnvironment.linkCount,
  pendingUploadCount: demoEnvironment.pendingUploadCount,
  confirmationCount: demoEnvironment.confirmationCount,
  confirmedBytes: demoEnvironment.confirmedBytes,
  reservedUploadBytes: demoEnvironment.reservedUploadBytes,
  deliveredBytes: demoEnvironment.deliveredBytes,
  visitLifetimeCount: demoEnvironment.visitLifetimeCount,
  eventLifetimeCount: demoEnvironment.eventLifetimeCount,
  downloadLifetimeCount: demoEnvironment.downloadLifetimeCount,
  documentActivityCount: demoEnvironment.documentActivityCount,
  vaultActivityCount: demoEnvironment.vaultActivityCount,
  linkActivityCount: demoEnvironment.linkActivityCount,
  reportCount: demoEnvironment.reportCount,
  refusalCount: demoEnvironment.refusalCount,
  analyticsIncomplete: demoEnvironment.analyticsIncomplete,
} as const;

export function readOperationsEnvironments() {
  return db
    .select(operationsEnvironmentSelection)
    .from(demoEnvironment)
    .orderBy(desc(demoEnvironment.createdAt))
    .limit(100);
}

export async function readOperationsActivityOverview(now = new Date()) {
  const cohortStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
  const [environments, summaries] = await Promise.all([
    db
      .select({
        startedAt: demoEnvironment.createdAt,
        state: demoEnvironment.state,
        endReason: demoEnvironment.endReason,
        documentCreatedCount: demoEnvironment.documentLifetimeCount,
        vaultCreatedCount: demoEnvironment.vaultLifetimeCount,
        linkCreatedCount: demoEnvironment.linkLifetimeCount,
        documentActivityCount: demoEnvironment.documentActivityCount,
        vaultActivityCount: demoEnvironment.vaultActivityCount,
        linkActivityCount: demoEnvironment.linkActivityCount,
        visitCount: demoEnvironment.visitLifetimeCount,
        downloadCount: demoEnvironment.downloadLifetimeCount,
        deliveredBytes: demoEnvironment.deliveredBytes,
        refusalCount: demoEnvironment.refusalCount,
        analyticsIncomplete: demoEnvironment.analyticsIncomplete,
      })
      .from(demoEnvironment)
      .where(gte(demoEnvironment.createdAt, cohortStart)),
    db
      .select({
        startedAt: demoSummary.startedAt,
        endedAt: demoSummary.endedAt,
        endReason: demoSummary.endReason,
        documentCreatedCount: demoSummary.documentCreatedCount,
        vaultCreatedCount: demoSummary.vaultCreatedCount,
        linkCreatedCount: demoSummary.linkCreatedCount,
        documentActivityCount: demoSummary.documentActivityCount,
        vaultActivityCount: demoSummary.vaultActivityCount,
        linkActivityCount: demoSummary.linkActivityCount,
        visitCount: demoSummary.visitCount,
        downloadCount: demoSummary.downloadCount,
        deliveredBytes: demoSummary.deliveredBytes,
        refusalCount: demoSummary.refusalCount,
        analyticsIncomplete: demoSummary.analyticsIncomplete,
      })
      .from(demoSummary)
      .where(gte(demoSummary.startedAt, cohortStart)),
  ]);

  return buildOperationsActivityOverview(
    [
      ...environments.map(({ state, endReason, ...environment }) => ({
        ...environment,
        ready: state !== "provisioning" && endReason !== "provisioning_failed",
        ...(endReason ? { endReason: demoEndReasonSchema.parse(endReason) } : {}),
      })),
      ...summaries.map((summary) => ({
        ...summary,
        endReason: demoEndReasonSchema.parse(summary.endReason),
        ready: summary.endReason !== "provisioning_failed",
      })),
    ],
    now,
  );
}

export async function readOperationsPortfolio(now = new Date()) {
  const [activity, usage] = await Promise.all([
    readOperationsActivityOverview(now),
    db.select().from(demoGlobalUsage).limit(1),
  ]);
  return { activity, globalUsage: usage[0] };
}

export async function deleteDemoEnvironmentBatch(operatorUserId: string, now = new Date()) {
  await db
    .insert(deploymentPolicy)
    .values({
      id: "deployment",
      ...initialDeploymentPolicy,
      acceptNewDemos: false,
      updatedBy: operatorUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: deploymentPolicy.id,
      set: { acceptNewDemos: false, updatedBy: operatorUserId, updatedAt: now },
    });

  const candidates = await db
    .select({ id: demoEnvironment.id })
    .from(demoEnvironment)
    .orderBy(asc(demoEnvironment.createdAt))
    .limit(fleetDeletionBatchSize);

  let processedCount = 0;
  for (const candidate of candidates) {
    const result = await terminateDemoEnvironment(candidate.id, "fleet_deleted", now);
    if (result.status === "completed") processedCount += 1;
  }

  const [remaining] = await db.select({ value: count() }).from(demoEnvironment);
  const remainingCount = remaining?.value ?? 0;
  return { processedCount, remainingCount, completed: remainingCount === 0 };
}

export async function readDemoOperationsRecords() {
  const [globalUsage, environments, summaries, dailyAggregates, reports, maintenanceRuns] =
    await Promise.all([
      db.select().from(demoGlobalUsage).limit(1),
      readOperationsEnvironments(),
      db.select().from(demoSummary).orderBy(desc(demoSummary.endedAt)).limit(100),
      db.select().from(demoDailyAggregate).orderBy(desc(demoDailyAggregate.day)).limit(90),
      db
        .select({
          id: demoReport.id,
          environmentId: demoReport.environmentId,
          category: demoReport.category,
          createdAt: demoReport.createdAt,
          expiresAt: demoReport.expiresAt,
        })
        .from(demoReport)
        .orderBy(desc(demoReport.createdAt))
        .limit(100),
      db.select().from(maintenanceRun).orderBy(desc(maintenanceRun.startedAt)).limit(100),
    ]);

  return {
    globalUsage: globalUsage[0],
    environments,
    summaries,
    dailyAggregates,
    reports,
    maintenanceRuns,
  };
}
