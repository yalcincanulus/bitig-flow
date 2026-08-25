import { hardDeploymentPolicy, type DeploymentPolicyValues } from "#/lib/deployment-policy";
import { demoEndReasonSchema, type DemoEndReason } from "#/lib/demo-operations";
import { z } from "zod";

export const fleetDeletionConfirmation = "DELETE ALL DEMO ENVIRONMENTS";

export const fleetDeletionRequestSchema = z
  .object({ confirmation: z.literal(fleetDeletionConfirmation) })
  .strict();

export type OperationsActivityRecord = Readonly<{
  startedAt: Date | string;
  endedAt?: Date | string;
  ready: boolean;
  endReason?: DemoEndReason;
  documentCreatedCount: number;
  vaultCreatedCount: number;
  linkCreatedCount: number;
  documentActivityCount: number;
  vaultActivityCount: number;
  linkActivityCount: number;
  visitCount: number;
  downloadCount: number;
  deliveredBytes: number;
  refusalCount: number;
  analyticsIncomplete: boolean;
}>;

type OperationsWindowHours = 24 | 168 | 720;

function instant(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function summarizeActivityRecords(records: ReadonlyArray<OperationsActivityRecord>) {
  return {
    environmentCount: records.length,
    readyEnvironmentCount: records.filter((record) => record.ready).length,
    engagedEnvironmentCount: records.filter((record) => record.documentActivityCount > 0).length,
    organizedEnvironmentCount: records.filter((record) => record.vaultActivityCount > 0).length,
    publishedEnvironmentCount: records.filter((record) => record.linkActivityCount > 0).length,
    viewedEnvironmentCount: records.filter((record) => record.visitCount > 0).length,
    downloadedEnvironmentCount: records.filter((record) => record.downloadCount > 0).length,
    endedEnvironmentCount: records.filter((record) => record.endedAt !== undefined).length,
    visitCount: records.reduce((total, record) => total + record.visitCount, 0),
    downloadCount: records.reduce((total, record) => total + record.downloadCount, 0),
    deliveredBytes: records.reduce((total, record) => total + record.deliveredBytes, 0),
    limitedEnvironmentCount: records.filter((record) => record.refusalCount > 0).length,
    analyticsIncomplete: records.some((record) => record.analyticsIncomplete),
  };
}

function cohortMetrics(
  records: ReadonlyArray<OperationsActivityRecord>,
  hours: OperationsWindowHours,
  now: Date,
) {
  const start = new Date(now.getTime() - hours * 60 * 60 * 1_000);
  const cohort = records.filter((record) => {
    const startedAt = instant(record.startedAt);
    return startedAt >= start && startedAt <= now;
  });
  const endReasonCounts = Object.fromEntries(
    demoEndReasonSchema.options.map((reason) => [
      reason,
      cohort.filter((record) => record.endReason === reason).length,
    ]),
  ) as Record<DemoEndReason, number>;

  return {
    hours,
    from: start.toISOString(),
    to: now.toISOString(),
    ...summarizeActivityRecords(cohort),
    endReasonCounts,
  };
}

function utcDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildOperationsActivityOverview(
  records: ReadonlyArray<OperationsActivityRecord>,
  now = new Date(),
) {
  const trendStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
  );
  const trend = Array.from({ length: 30 }, (_, offset) => {
    const day = new Date(trendStart.getTime() + offset * 24 * 60 * 60 * 1_000);
    const dayRecords = records.filter(
      (record) => utcDay(instant(record.startedAt)) === utcDay(day),
    );
    const summary = summarizeActivityRecords(dayRecords);
    return {
      day: utcDay(day),
      environmentCount: summary.environmentCount,
      engagedEnvironmentCount: summary.engagedEnvironmentCount,
      publishedEnvironmentCount: summary.publishedEnvironmentCount,
      visitCount: summary.visitCount,
      downloadCount: summary.downloadCount,
    };
  });

  return {
    windows: ([24, 168, 720] as const).map((hours) => cohortMetrics(records, hours, now)),
    trend,
  };
}

export function policyChangeConfirmation(
  current: DeploymentPolicyValues,
  requested: DeploymentPolicyValues,
) {
  const reducedFields = (
    Object.keys(hardDeploymentPolicy) as Array<keyof typeof hardDeploymentPolicy>
  ).filter((field) => requested[field] < current[field]);
  const pausesAllDemoAccess = !current.pauseAllDemoAccess && requested.pauseAllDemoAccess;
  const closesDemoAdmission = current.acceptNewDemos && !requested.acceptNewDemos;
  const closesSignUp = current.signUpEnabled && !requested.signUpEnabled;

  return {
    required:
      reducedFields.length > 0 || pausesAllDemoAccess || closesDemoAdmission || closesSignUp,
    reducedFields,
    pausesAllDemoAccess,
    closesDemoAdmission,
    closesSignUp,
  };
}
