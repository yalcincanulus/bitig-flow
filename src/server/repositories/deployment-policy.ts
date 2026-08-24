import { eq, inArray, sql } from "drizzle-orm";

import {
  deploymentPolicySchema,
  effectiveDeploymentAvailability,
  policyImpact,
  storedDeploymentPolicySchema,
  type DeploymentPolicyValues,
  type RuntimeCapabilities,
} from "#/lib/deployment-policy";
import { db } from "#/server/db/client";
import { demoEnvironment, demoGlobalUsage, deploymentPolicy } from "#/server/db/schema";
import { mailCapabilityAvailable } from "#/server/email-config";
import { effectiveSignUpAvailability } from "#/server/sign-up-availability";

export async function ensureDeploymentOperationsSingletons() {
  await db.transaction(async (transaction) => {
    await transaction
      .insert(deploymentPolicy)
      .values({ id: "deployment" })
      .onConflictDoNothing({ target: deploymentPolicy.id });
    await transaction
      .insert(demoGlobalUsage)
      .values({ id: "demo-global" })
      .onConflictDoNothing({ target: demoGlobalUsage.id });
  });
}

async function readDeploymentPolicyRecord() {
  const [row] = await db
    .select()
    .from(deploymentPolicy)
    .where(eq(deploymentPolicy.id, "deployment"))
    .limit(1);
  return row;
}

export async function readDeploymentPolicy() {
  const row = await readDeploymentPolicyRecord();
  return row ? storedDeploymentPolicySchema.parse(row) : undefined;
}

export async function updateDeploymentPolicy(
  operatorUserId: string,
  requested: DeploymentPolicyValues,
) {
  const policy = deploymentPolicySchema.parse(requested);
  const now = new Date();
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${deploymentPolicy} WHERE id = 'deployment' FOR UPDATE`,
    );
    const [saved] = await transaction
      .insert(deploymentPolicy)
      .values({ id: "deployment", ...policy, updatedBy: operatorUserId, updatedAt: now })
      .onConflictDoUpdate({
        target: deploymentPolicy.id,
        set: { ...policy, updatedBy: operatorUserId, updatedAt: now },
      })
      .returning();
    return saved!;
  });
}

export async function deploymentPolicyImpact(policy: DeploymentPolicyValues) {
  const environments = await db
    .select({
      environmentConfirmedBytes:
        sql<number>`${demoEnvironment.confirmedBytes} + ${demoEnvironment.reservedUploadBytes}`.mapWith(
          Number,
        ),
      documentCount: demoEnvironment.documentCount,
      uploadedDocumentCount: demoEnvironment.uploadedDocumentCount,
      vaultCount: demoEnvironment.vaultCount,
      linkCount: demoEnvironment.linkCount,
      pendingUploadCount: demoEnvironment.pendingUploadCount,
      confirmationCount: demoEnvironment.confirmationCount,
      uploadKeyLifetimeCount: demoEnvironment.uploadKeyLifetimeCount,
      deliveredBytes: demoEnvironment.deliveredBytes,
      visitLifetimeCount: demoEnvironment.visitLifetimeCount,
      eventLifetimeCount: demoEnvironment.eventLifetimeCount,
      documentLifetimeCount: demoEnvironment.documentLifetimeCount,
      vaultLifetimeCount: demoEnvironment.vaultLifetimeCount,
      linkLifetimeCount: demoEnvironment.linkLifetimeCount,
    })
    .from(demoEnvironment)
    .where(
      inArray(demoEnvironment.state, ["provisioning", "active", "global_paused", "report_paused"]),
    );
  return policyImpact(policy, environments);
}

export async function deploymentPolicyView(capability: RuntimeCapabilities) {
  const record = await readDeploymentPolicyRecord();
  const policy = record ? storedDeploymentPolicySchema.parse(record) : undefined;
  return {
    policy,
    lastUpdated: record ? { at: record.updatedAt, by: record.updatedBy } : undefined,
    capability,
    effectiveAvailability: effectiveDeploymentAvailability(policy, capability),
    impact: policy ? await deploymentPolicyImpact(policy) : { writeLimitedEnvironmentCount: 0 },
  };
}

export async function deploymentPolicyAllowsSignUp() {
  return (await readDeploymentPolicy())?.signUpEnabled === true;
}

export async function signUpAvailable() {
  const mailAvailable = mailCapabilityAvailable();
  return effectiveSignUpAvailability({
    policyAllowsSignUp: await deploymentPolicyAllowsSignUp(),
    mailAvailable,
    // Recovery is configured through Better Auth whenever mail can carry its reset link.
    recoveryReady: mailAvailable,
  });
}
