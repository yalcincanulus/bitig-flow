import { desc } from "drizzle-orm";

import { db } from "#/server/db/client";
import {
  demoDailyAggregate,
  demoEnvironment,
  demoGlobalUsage,
  demoReport,
  demoSummary,
  maintenanceRun,
} from "#/server/db/schema";

export async function readDemoOperationsRecords() {
  const [globalUsage, environments, summaries, dailyAggregates, reports, maintenanceRuns] =
    await Promise.all([
      db.select().from(demoGlobalUsage).limit(1),
      db
        .select({
          id: demoEnvironment.id,
          anonymousReference: demoEnvironment.anonymousReference,
          state: demoEnvironment.state,
          stateVersion: demoEnvironment.stateVersion,
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
          reportCount: demoEnvironment.reportCount,
          refusalCount: demoEnvironment.refusalCount,
        })
        .from(demoEnvironment)
        .orderBy(desc(demoEnvironment.createdAt))
        .limit(100),
      db.select().from(demoSummary).orderBy(desc(demoSummary.endedAt)).limit(100),
      db.select().from(demoDailyAggregate).orderBy(desc(demoDailyAggregate.day)).limit(90),
      db
        .select({
          id: demoReport.id,
          environmentId: demoReport.environmentId,
          linkId: demoReport.linkId,
          category: demoReport.category,
          details: demoReport.details,
          rateLimitWindowStartedAt: demoReport.rateLimitWindowStartedAt,
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
