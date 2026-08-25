import { z } from "zod";

import type { DeploymentPolicyValues } from "#/lib/deployment-policy";

export const demoEnvironmentStateSchema = z.enum([
  "provisioning",
  "active",
  "global_paused",
  "report_paused",
  "terminating",
  "completed",
]);

export type DemoEnvironmentState = z.infer<typeof demoEnvironmentStateSchema>;

const stateTransitions: Readonly<Record<DemoEnvironmentState, ReadonlySet<DemoEnvironmentState>>> =
  {
    provisioning: new Set(["active", "terminating", "completed"]),
    active: new Set(["global_paused", "report_paused", "terminating"]),
    global_paused: new Set(["active", "report_paused", "terminating"]),
    report_paused: new Set(["terminating"]),
    terminating: new Set(["completed"]),
    completed: new Set(),
  };

export function transitionDemoState(
  current: DemoEnvironmentState,
  requested: DemoEnvironmentState,
) {
  if (current === requested) return current;
  if (!stateTransitions[current].has(requested)) {
    throw new Error(`${current} cannot transition to ${requested}`);
  }
  return requested;
}

export type DemoReservationKind =
  | "document"
  | "uploadedDocument"
  | "vault"
  | "link"
  | "pendingUpload"
  | "confirmation"
  | "uploadKey"
  | "uploadBytes"
  | "confirmedBytes"
  | "deliveredBytes"
  | "visit"
  | "event"
  | "download";

type DemoReservation = Readonly<{
  kind: DemoReservationKind;
  amount: number;
}>;

export type DemoUsageCounter =
  | "documentCount"
  | "uploadedDocumentCount"
  | "vaultCount"
  | "linkCount"
  | "pendingUploadCount"
  | "confirmationCount"
  | "uploadKeyLifetimeCount"
  | "documentLifetimeCount"
  | "vaultLifetimeCount"
  | "linkLifetimeCount"
  | "environmentConfirmedBytes"
  | "reservedUploadBytes"
  | "deliveredBytes"
  | "visitLifetimeCount"
  | "eventLifetimeCount"
  | "downloadLifetimeCount";

export type DemoUsage = Readonly<Partial<Record<DemoUsageCounter | "refusalCount", number>>>;

export const demoReservationIncrements = {
  document: ["documentCount", "documentLifetimeCount"],
  uploadedDocument: ["uploadedDocumentCount", "documentCount", "documentLifetimeCount"],
  vault: ["vaultCount", "vaultLifetimeCount"],
  link: ["linkCount", "linkLifetimeCount"],
  pendingUpload: ["pendingUploadCount"],
  confirmation: ["confirmationCount"],
  uploadKey: ["uploadKeyLifetimeCount"],
  uploadBytes: ["reservedUploadBytes"],
  confirmedBytes: ["environmentConfirmedBytes"],
  deliveredBytes: ["deliveredBytes"],
  visit: ["visitLifetimeCount"],
  event: ["eventLifetimeCount"],
  download: ["eventLifetimeCount", "downloadLifetimeCount"],
} as const satisfies Record<DemoReservation["kind"], ReadonlyArray<DemoUsageCounter>>;

type ReservationLimit = Readonly<{
  limit: keyof DeploymentPolicyValues;
  usage: ReadonlyArray<DemoUsageCounter>;
  requestOnly?: boolean;
}>;

const directReservationLimits = {
  document: ["documentCount", "documentLifetimeCount"],
  uploadedDocument: ["uploadedDocumentCount", "documentCount", "documentLifetimeCount"],
  vault: ["vaultCount", "vaultLifetimeCount"],
  link: ["linkCount", "linkLifetimeCount"],
  pendingUpload: ["pendingUploadCount"],
  confirmation: ["confirmationCount"],
  uploadKey: ["uploadKeyLifetimeCount"],
  deliveredBytes: ["deliveredBytes"],
  visit: ["visitLifetimeCount"],
  event: ["eventLifetimeCount"],
  download: ["eventLifetimeCount"],
} as const;

export function demoReservationLimits(kind: DemoReservationKind): ReadonlyArray<ReservationLimit> {
  if (kind === "uploadBytes" || kind === "confirmedBytes") {
    return [
      { limit: "uploadBytes", usage: [], requestOnly: true },
      {
        limit: "environmentConfirmedBytes",
        usage: ["environmentConfirmedBytes", "reservedUploadBytes"],
      },
    ];
  }

  return directReservationLimits[kind].map((field) => ({ limit: field, usage: [field] }));
}

function nextRefusalCount(usage: DemoUsage) {
  return Math.min(100, (usage.refusalCount ?? 0) + 1);
}

export function applyDemoReservation(
  usage: DemoUsage,
  reservation: DemoReservation,
  policy: DeploymentPolicyValues,
) {
  if (!Number.isSafeInteger(reservation.amount) || reservation.amount < 1) {
    throw new Error("Reservation amount must be a positive safe integer");
  }

  const increments = demoReservationIncrements[reservation.kind];
  for (const check of demoReservationLimits(reservation.kind)) {
    const increment = check.requestOnly
      ? reservation.amount
      : increments.filter((field) => check.usage.includes(field)).length * reservation.amount;
    const next = check.usage.reduce((total, field) => total + (usage[field] ?? 0), 0) + increment;
    const maximum = policy[check.limit];
    if (typeof maximum !== "number" || next > maximum) {
      return {
        accepted: false as const,
        limit: check.limit,
        usage: { ...usage, refusalCount: nextRefusalCount(usage) },
      };
    }
  }

  const updated: Partial<Record<DemoUsageCounter | "refusalCount", number>> = { ...usage };
  for (const field of increments) {
    updated[field] = (updated[field] ?? 0) + reservation.amount;
  }
  return { accepted: true as const, usage: updated };
}

export const demoEndReasonSchema = z.enum([
  "expired",
  "ended_by_demo_user",
  "operator_terminated",
  "reported",
  "provisioning_failed",
  "fleet_deleted",
]);

export type DemoEndReason = z.infer<typeof demoEndReasonSchema>;

const demoSummaryInputSchema = z
  .object({
    startedAt: z.date(),
    endedAt: z.date(),
    endReason: demoEndReasonSchema,
    documentCreatedCount: z.number().int().nonnegative(),
    vaultCreatedCount: z.number().int().nonnegative(),
    linkCreatedCount: z.number().int().nonnegative(),
    documentActivityCount: z.number().int().nonnegative().default(0),
    vaultActivityCount: z.number().int().nonnegative().default(0),
    linkActivityCount: z.number().int().nonnegative().default(0),
    visitCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    downloadCount: z.number().int().nonnegative(),
    deliveredBytes: z.number().int().nonnegative(),
    refusalCount: z.number().int().min(0).max(100),
    analyticsIncomplete: z.boolean(),
  })
  .strict();

export function createDemoSummary(input: z.input<typeof demoSummaryInputSchema>) {
  const summary = demoSummaryInputSchema.parse(input);
  return {
    ...summary,
    durationSeconds: Math.max(
      0,
      Math.floor((summary.endedAt.getTime() - summary.startedAt.getTime()) / 1_000),
    ),
  };
}

export type DemoSummary = ReturnType<typeof createDemoSummary>;

export type DemoDailyAggregate = Readonly<{
  day: string;
  environmentCount: number;
  expiredCount: number;
  endedByDemoUserCount: number;
  operatorTerminatedCount: number;
  reportedCount: number;
  provisioningFailedCount: number;
  fleetDeletedCount: number;
  documentCreatedCount: number;
  vaultCreatedCount: number;
  linkCreatedCount: number;
  documentActivityCount: number;
  vaultActivityCount: number;
  linkActivityCount: number;
  visitCount: number;
  eventCount: number;
  downloadCount: number;
  deliveredBytes: number;
  refusalCount: number;
}>;

export function foldDemoSummary(
  aggregate: DemoDailyAggregate | undefined,
  summary: DemoSummary,
): DemoDailyAggregate {
  const current: DemoDailyAggregate =
    aggregate ??
    ({
      day: summary.endedAt.toISOString().slice(0, 10),
      environmentCount: 0,
      expiredCount: 0,
      endedByDemoUserCount: 0,
      operatorTerminatedCount: 0,
      reportedCount: 0,
      provisioningFailedCount: 0,
      fleetDeletedCount: 0,
      documentCreatedCount: 0,
      vaultCreatedCount: 0,
      linkCreatedCount: 0,
      documentActivityCount: 0,
      vaultActivityCount: 0,
      linkActivityCount: 0,
      visitCount: 0,
      eventCount: 0,
      downloadCount: 0,
      deliveredBytes: 0,
      refusalCount: 0,
    } satisfies DemoDailyAggregate);
  const reasonField = {
    expired: "expiredCount",
    ended_by_demo_user: "endedByDemoUserCount",
    operator_terminated: "operatorTerminatedCount",
    reported: "reportedCount",
    provisioning_failed: "provisioningFailedCount",
    fleet_deleted: "fleetDeletedCount",
  }[summary.endReason] as keyof DemoDailyAggregate;

  return {
    ...current,
    environmentCount: current.environmentCount + 1,
    [reasonField]: (current[reasonField] as number) + 1,
    documentCreatedCount: current.documentCreatedCount + summary.documentCreatedCount,
    vaultCreatedCount: current.vaultCreatedCount + summary.vaultCreatedCount,
    linkCreatedCount: current.linkCreatedCount + summary.linkCreatedCount,
    documentActivityCount: current.documentActivityCount + summary.documentActivityCount,
    vaultActivityCount: current.vaultActivityCount + summary.vaultActivityCount,
    linkActivityCount: current.linkActivityCount + summary.linkActivityCount,
    visitCount: current.visitCount + summary.visitCount,
    eventCount: current.eventCount + summary.eventCount,
    downloadCount: current.downloadCount + summary.downloadCount,
    deliveredBytes: current.deliveredBytes + summary.deliveredBytes,
    refusalCount: current.refusalCount + summary.refusalCount,
  };
}

export const demoReportCategorySchema = z.enum([
  "spam_or_phishing",
  "malware_or_suspicious_download",
  "harmful_or_illegal_content",
]);

export const demoReportInputSchema = z
  .object({
    category: demoReportCategorySchema,
  })
  .strict();

type MaintenanceObservation = Readonly<{
  status: "running" | "succeeded" | "failed";
  heartbeatAt?: Date;
  finishedAt?: Date;
}>;

export function maintenanceFreshness(
  observation: MaintenanceObservation | undefined,
  now: Date,
  maximumAgeMs: number,
) {
  return (
    observation?.status === "succeeded" &&
    observation.finishedAt !== undefined &&
    observation.finishedAt.getTime() >= now.getTime() - maximumAgeMs
  );
}
