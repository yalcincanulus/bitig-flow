import { setResponseStatus } from "@tanstack/react-start/server";

import type { DemoReservationKind } from "#/lib/demo-operations";
import { maintenanceFreshness } from "#/lib/demo-operations";
import {
  releaseDemoBudget,
  reserveDemoBudgets,
  reserveDemoBudget,
  rollbackDemoBudgets,
  markDemoAnalyticsIncomplete,
  type DemoBudgetReservation,
} from "#/server/repositories/demo-environments";
import { latestMaintenanceObservation } from "#/server/repositories/maintenance-runs";

export type DemoQuotaError = Readonly<{
  name: "DemoQuotaError";
  code: "DEMO_QUOTA_EXCEEDED";
  limit: string;
  usage?: number;
  limitValue?: number;
  message: "Demo quota reached";
}>;

export type DemoFeatureDisabledError = Readonly<{
  name: "DemoFeatureDisabledError";
  code: "DEMO_FEATURE_DISABLED";
  message: "Disabled in demo";
}>;

export type DemoUploadUnavailableError = Readonly<{
  name: "DemoUploadUnavailableError";
  code: "DEMO_UPLOAD_UNAVAILABLE";
  message: "Demo uploads are temporarily unavailable";
}>;

export async function requireFreshDemoSweep(environmentId: string | undefined) {
  if (!environmentId) return;
  const observation = await latestMaintenanceObservation("sweep");
  if (maintenanceFreshness(observation, new Date(), 48 * 60 * 60 * 1_000)) return;
  setResponseStatus(503);
  throw {
    name: "DemoUploadUnavailableError",
    code: "DEMO_UPLOAD_UNAVAILABLE",
    message: "Demo uploads are temporarily unavailable",
  } satisfies DemoUploadUnavailableError;
}

export function refuseDemoFeature(environmentId: string | undefined): void {
  if (!environmentId) return;
  setResponseStatus(403);
  throw {
    name: "DemoFeatureDisabledError",
    code: "DEMO_FEATURE_DISABLED",
    message: "Disabled in demo",
  } satisfies DemoFeatureDisabledError;
}

export function isDemoQuotaError(error: unknown): error is DemoQuotaError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "DEMO_QUOTA_EXCEEDED"
  );
}

function quotaDetails(reservation: object) {
  return {
    ...("usage" in reservation && typeof reservation.usage === "number"
      ? { usage: reservation.usage }
      : {}),
    ...("limitValue" in reservation && typeof reservation.limitValue === "number"
      ? { limitValue: reservation.limitValue }
      : {}),
  };
}

export async function reserveDemoBudgetOrThrow(
  environmentId: string | undefined,
  kind: DemoReservationKind,
  amount = 1,
) {
  if (!environmentId) return false;

  const reservation = await reserveDemoBudget(environmentId, kind, amount);
  if (reservation.accepted) return true;

  setResponseStatus(429);
  throw {
    name: "DemoQuotaError",
    code: "DEMO_QUOTA_EXCEEDED",
    limit: reservation.limit,
    ...quotaDetails(reservation),
    message: "Demo quota reached",
  } satisfies DemoQuotaError;
}

export async function reserveDemoBudgetsOrThrow(
  environmentId: string | undefined,
  reservations: ReadonlyArray<DemoBudgetReservation>,
) {
  if (!environmentId) return false;
  const reservation = await reserveDemoBudgets(environmentId, reservations);
  if (reservation.accepted) return true;

  setResponseStatus(429);
  throw {
    name: "DemoQuotaError",
    code: "DEMO_QUOTA_EXCEEDED",
    limit: reservation.limit,
    ...quotaDetails(reservation),
    message: "Demo quota reached",
  } satisfies DemoQuotaError;
}

export async function rollbackFailedDemoBudgets(
  environmentId: string | undefined,
  reservations: ReadonlyArray<DemoBudgetReservation>,
) {
  if (!environmentId) return;
  await rollbackDemoBudgets(environmentId, reservations);
}

export async function consumeDemoAnalyticsBudget(
  environmentId: string | undefined,
  kind: "visit" | "event",
  amount = 1,
) {
  if (!environmentId) return true;
  const reservation = await reserveDemoBudget(environmentId, kind, amount);
  if (reservation.accepted) return true;
  await markDemoAnalyticsIncomplete(environmentId);
  return false;
}

export async function releaseFailedDemoBudget(
  environmentId: string | undefined,
  kind: Parameters<typeof releaseDemoBudget>[1],
  amount = 1,
) {
  if (!environmentId) return;
  await releaseDemoBudget(environmentId, kind, amount);
}
