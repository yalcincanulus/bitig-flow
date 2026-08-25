import { and, asc, eq, inArray, lte, or } from "drizzle-orm";

import { db, pool } from "#/server/db/client";
import { demoEnvironment, demoProvisioningAttempt } from "#/server/db/schema";
import { releaseGlobalDemoEnvironment } from "#/server/repositories/demo-environments";
import {
  discardDemoProvisioningAttempt,
  markDemoProvisioningReady,
  releaseTrackedDemoProvisioningAdmission,
  removeStaleUntrackedDemoIdentities,
  removeUntrackedDemoIdentity,
  terminateDemoEnvironment,
} from "#/server/repositories/demo-lifecycle";
import {
  completeMaintenanceRun,
  failMaintenanceRun,
  heartbeatMaintenanceRun,
  startMaintenanceRun,
} from "#/server/repositories/maintenance-runs";

const reaperLockName = "bitig-flow-demo-reaper";
const reaperBatchSize = 25;
const provisioningRecoveryMs = 5 * 60 * 1_000;

async function reaperCandidates(now: Date) {
  return db
    .select({
      id: demoEnvironment.id,
      state: demoEnvironment.state,
      endReason: demoEnvironment.endReason,
    })
    .from(demoEnvironment)
    .where(
      or(
        eq(demoEnvironment.state, "terminating"),
        and(
          eq(demoEnvironment.state, "provisioning"),
          lte(demoEnvironment.createdAt, new Date(now.getTime() - provisioningRecoveryMs)),
        ),
        and(
          inArray(demoEnvironment.state, ["active", "global_paused", "report_paused"]),
          lte(demoEnvironment.expiresAt, now),
        ),
      ),
    )
    .orderBy(asc(demoEnvironment.expiresAt))
    .limit(reaperBatchSize);
}

async function reapStaleProvisioningAttempts(now: Date) {
  const staleBefore = new Date(now.getTime() - provisioningRecoveryMs);
  const attempts = await db
    .select()
    .from(demoProvisioningAttempt)
    .where(
      and(
        eq(demoProvisioningAttempt.state, "provisioning"),
        lte(demoProvisioningAttempt.createdAt, staleBefore),
      ),
    )
    .limit(reaperBatchSize);
  let failedCount = 0;
  let completedEnvironmentCount = 0;
  let deferredStorageCount = 0;
  for (const attempt of attempts) {
    const [environment] = attempt.environmentId
      ? await db
          .select()
          .from(demoEnvironment)
          .where(eq(demoEnvironment.id, attempt.environmentId))
          .limit(1)
      : [];
    if (environment?.state === "active") {
      await markDemoProvisioningReady(attempt.id);
      continue;
    }

    failedCount += 1;
    await releaseTrackedDemoProvisioningAdmission(attempt.id);
    if (environment) {
      const result = await terminateDemoEnvironment(environment.id, "provisioning_failed", now);
      if (result.status === "completed") {
        completedEnvironmentCount += 1;
        if (result.storageDeferred) deferredStorageCount += 1;
      }
    } else {
      if (attempt.organizationId || attempt.userId) {
        await removeUntrackedDemoIdentity(
          attempt.userId ?? undefined,
          attempt.organizationId ?? undefined,
        );
      }
      if (attempt.globalReserved) await releaseGlobalDemoEnvironment(attempt.id);
    }
    await discardDemoProvisioningAttempt(attempt.id);
  }
  await removeStaleUntrackedDemoIdentities(staleBefore);
  return { failedCount, completedEnvironmentCount, deferredStorageCount };
}

export async function runDemoReaper(now = new Date()) {
  const lockClient = await pool.connect();
  let acquired = false;
  try {
    const lock = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [reaperLockName],
    );
    acquired = lock.rows[0]?.acquired === true;
    if (!acquired) return { acquired: false as const };

    const run = await startMaintenanceRun("reaper", now);
    try {
      const staleAttempts = await reapStaleProvisioningAttempts(now);
      const candidates = await reaperCandidates(now);
      let completedEnvironmentCount = staleAttempts.completedEnvironmentCount;
      let deferredStorageCount = staleAttempts.deferredStorageCount;
      for (const candidate of candidates) {
        const reason =
          candidate.endReason ??
          (candidate.state === "provisioning" ? "provisioning_failed" : "expired");
        const result = await terminateDemoEnvironment(candidate.id, reason, now);
        if (result.status === "completed") {
          completedEnvironmentCount += 1;
          if (result.storageDeferred) deferredStorageCount += 1;
        }
        await heartbeatMaintenanceRun(run.id);
      }
      const outcome = {
        expiredEnvironmentCount: candidates.filter(
          (candidate) => candidate.endReason === null && candidate.state !== "provisioning",
        ).length,
        failedProvisioningCount:
          staleAttempts.failedCount +
          candidates.filter(
            (candidate) => candidate.endReason === null && candidate.state === "provisioning",
          ).length,
        resumedEnvironmentCount: candidates.filter((candidate) => candidate.endReason !== null)
          .length,
        completedEnvironmentCount,
        deferredStorageCount,
      };
      await completeMaintenanceRun(run.id, outcome);
      return { acquired: true as const, ...outcome };
    } catch (error) {
      await failMaintenanceRun(run.id, error);
      throw error;
    }
  } finally {
    let destroyConnection = false;
    try {
      if (acquired) {
        await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [reaperLockName]);
      }
    } catch {
      destroyConnection = true;
    }
    lockClient.release(destroyConnection);
  }
}
