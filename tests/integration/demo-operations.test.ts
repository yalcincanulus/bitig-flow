import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { initialDeploymentPolicy } from "#/lib/deployment-policy";
import { deploymentRuntimeCapabilities } from "#/server/deployment-capabilities";
import {
  demoDailyAggregate,
  demoEnvironment,
  demoGlobalUsage,
  demoReport,
  demoSummary,
  deploymentPolicy,
  maintenanceRun,
  organization,
  platformOperator,
  user,
} from "#/server/db/schema";
import {
  confirmDemoUploadBytes,
  releaseDemoBudget,
  releaseGlobalDemoEnvironment,
  reserveDemoBudget,
  reserveGlobalDemoEnvironment,
  transitionPersistedDemoState,
} from "#/server/repositories/demo-environments";
import { ensureDeploymentOperationsSingletons } from "#/server/repositories/deployment-policy";
import { recordDemoReport } from "#/server/repositories/demo-reports";
import { foldExpiredDemoSummaries, persistDemoSummary } from "#/server/repositories/demo-summaries";
import {
  completeMaintenanceRun,
  latestSuccessfulMaintenanceObservation,
  readMaintenanceStatus,
  startMaintenanceRun,
} from "#/server/repositories/maintenance-runs";
import { createFixtureUser } from "../fixtures";
import { database } from "../fixtures/services";
import { test } from "./http";

async function createOperator() {
  const fixture = await createFixtureUser();
  await database.insert(platformOperator).values({ userId: fixture.user.id });
  await database.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, fixture.user.id));
  return fixture;
}

async function createEnvironment() {
  const fixture = await createFixtureUser();
  const organizationId = randomUUID();
  await database.insert(organization).values({
    id: organizationId,
    name: "bitig-flow Demo",
    slug: randomUUID(),
    createdAt: new Date(),
  });
  const [environment] = await database
    .insert(demoEnvironment)
    .values({
      userId: fixture.user.id,
      organizationId,
      anonymousReference: randomUUID().slice(0, 12),
      state: "active",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    })
    .returning();
  return environment!;
}

test("operational records and fail-closed singletons are durable", async () => {
  await ensureDeploymentOperationsSingletons();
  const policies = await database.select().from(deploymentPolicy);
  const globalUsage = await database.select().from(demoGlobalUsage);

  expect(policies).toEqual([
    expect.objectContaining({
      id: "deployment",
      acceptNewDemos: false,
      signUpEnabled: false,
      documentCount: initialDeploymentPolicy.documentCount,
    }),
  ]);
  expect(globalUsage).toEqual([
    expect.objectContaining({
      id: "demo-global",
      activeEnvironmentCount: 0,
      confirmedBytes: 0,
    }),
  ]);
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoSummary)).resolves.toEqual([]);
  await expect(database.select().from(demoDailyAggregate)).resolves.toEqual([]);
  await expect(database.select().from(demoReport)).resolves.toEqual([]);
  await expect(database.select().from(maintenanceRun)).resolves.toEqual([]);

  await expect(
    database
      .update(deploymentPolicy)
      .set({ documentCount: initialDeploymentPolicy.documentCount + 1 })
      .where(eq(deploymentPolicy.id, "deployment")),
  ).rejects.toMatchObject({
    cause: { constraint: "deployment_policy_hard_ceiling_check" },
  });
});

test("only the Platform Operator can read or change Deployment Policy over HTTP", async () => {
  await ensureDeploymentOperationsSingletons();
  const anonymous = await fetch(new URL("/api/operations/policy", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(anonymous.status).toBe(307);

  const durableUser = await createFixtureUser();
  const forbidden = await durableUser.http(
    new URL("/api/operations/policy", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(forbidden.status).toBe(403);
  const forbiddenRecords = await durableUser.http(
    new URL("/api/operations/demo-records", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(forbiddenRecords.status).toBe(403);

  const operator = await createOperator();
  const read = await operator.http(new URL("/api/operations/policy", process.env.BETTER_AUTH_URL));
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({
    policy: { acceptNewDemos: false, signUpEnabled: false },
    effectiveAvailability: { demos: false, signUp: false },
  });
  const records = await operator.http(
    new URL("/api/operations/demo-records", process.env.BETTER_AUTH_URL),
  );
  expect(records.status).toBe(200);
  expect(await records.json()).toMatchObject({
    globalUsage: { id: "demo-global" },
    environments: [],
    summaries: [],
    dailyAggregates: [],
    reports: [],
    maintenanceRuns: [],
  });

  const invalid = await operator.http(
    new URL("/api/operations/policy", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...initialDeploymentPolicy, documentCount: 21 }),
    },
  );
  expect(invalid.status).toBe(422);

  const saved = await operator.http(
    new URL("/api/operations/policy", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...initialDeploymentPolicy, documentCount: 8 }),
    },
  );
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ policy: { documentCount: 8 } });
  await expect(database.select().from(deploymentPolicy)).resolves.toEqual([
    expect.objectContaining({ documentCount: 8, updatedBy: operator.user.id }),
  ]);
});

test("lowering a quota leaves existing use intact and reports write-limited environments", async () => {
  await ensureDeploymentOperationsSingletons();
  const operator = await createOperator();
  const environment = await createEnvironment();
  await database
    .update(demoEnvironment)
    .set({ documentCount: 10 })
    .where(eq(demoEnvironment.id, environment.id));

  const preview = await operator.http(
    new URL("/api/operations/policy", process.env.BETTER_AUTH_URL),
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...initialDeploymentPolicy, documentCount: 8 }),
    },
  );
  expect(preview.status).toBe(200);
  expect(await preview.json()).toEqual({ impact: { writeLimitedEnvironmentCount: 1 } });
  await expect(database.select().from(deploymentPolicy)).resolves.toEqual([
    expect.objectContaining({ documentCount: initialDeploymentPolicy.documentCount }),
  ]);

  const response = await operator.http(
    new URL("/api/operations/policy", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...initialDeploymentPolicy, documentCount: 8 }),
    },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    impact: { writeLimitedEnvironmentCount: 1 },
  });
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, environment.id)),
  ).resolves.toEqual([expect.objectContaining({ documentCount: 10 })]);
});

test("concurrent reservations cannot cross a lowered environment ceiling", async () => {
  await ensureDeploymentOperationsSingletons();
  const environment = await createEnvironment();
  await database
    .update(deploymentPolicy)
    .set({ documentCount: 3, uploadedDocumentCount: 3, documentLifetimeCount: 3 })
    .where(eq(deploymentPolicy.id, "deployment"));

  const results = await Promise.all(
    Array.from({ length: 10 }, () => reserveDemoBudget(environment.id, "document", 1)),
  );

  expect(results.filter((result) => result.accepted)).toHaveLength(3);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      documentCount: 3,
      documentLifetimeCount: 3,
      refusalCount: 7,
    }),
  ]);
});

test("concurrent reservations cannot cross fleet ceilings and can be released", async () => {
  await ensureDeploymentOperationsSingletons();
  const environments = await Promise.all(Array.from({ length: 4 }, () => createEnvironment()));
  await database
    .update(deploymentPolicy)
    .set({
      activeEnvironmentCount: 2,
      globalConfirmedBytes: 30 * 1024 * 1024,
      globalPendingUploadCount: 2,
    })
    .where(eq(deploymentPolicy.id, "deployment"));

  const activeResults = await Promise.all(
    Array.from({ length: 8 }, () => reserveGlobalDemoEnvironment()),
  );
  expect(activeResults.filter((result) => result.accepted)).toHaveLength(2);
  await expect(releaseGlobalDemoEnvironment()).resolves.toEqual({ released: true });

  const uploadResults = await Promise.all(
    environments.map((environment) => reserveDemoBudget(environment.id, "pendingUpload", 1)),
  );
  expect(uploadResults.filter((result) => result.accepted)).toHaveLength(2);

  const byteResults = await Promise.all(
    environments.map((environment) =>
      reserveDemoBudget(environment.id, "uploadBytes", 20 * 1024 * 1024),
    ),
  );
  expect(byteResults.filter((result) => result.accepted)).toHaveLength(1);
  const reservedEnvironment = environments[byteResults.findIndex((result) => result.accepted)]!;
  await expect(
    confirmDemoUploadBytes(reservedEnvironment.id, 20 * 1024 * 1024, 18 * 1024 * 1024),
  ).resolves.toEqual({ confirmed: true });
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({
      activeEnvironmentCount: 1,
      confirmedBytes: 18 * 1024 * 1024,
      pendingUploadCount: 2,
    }),
  ]);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, reservedEnvironment.id)),
  ).resolves.toEqual([
    expect.objectContaining({ confirmedBytes: 18 * 1024 * 1024, reservedUploadBytes: 0 }),
  ]);
});

test("persisted state changes are validated and safe to retry", async () => {
  const environment = await createEnvironment();

  await expect(
    transitionPersistedDemoState(environment.id, "report_paused"),
  ).resolves.toMatchObject({ state: "report_paused", stateVersion: 1 });
  await expect(
    transitionPersistedDemoState(environment.id, "report_paused"),
  ).resolves.toMatchObject({ state: "report_paused", stateVersion: 1 });
  await expect(transitionPersistedDemoState(environment.id, "active")).rejects.toThrow(
    /report_paused cannot transition to active/,
  );
});

test("simultaneous reservations can be released without restoring lifetime capacity", async () => {
  await ensureDeploymentOperationsSingletons();
  const environment = await createEnvironment();
  await expect(reserveDemoBudget(environment.id, "document", 2)).resolves.toEqual({
    accepted: true,
  });
  await expect(releaseDemoBudget(environment.id, "document", 1)).resolves.toEqual({
    released: true,
  });

  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, environment.id)),
  ).resolves.toEqual([expect.objectContaining({ documentCount: 1, documentLifetimeCount: 2 })]);
});

test("expired raw Summaries fold into indefinite content-free daily totals", async () => {
  const endedAt = new Date("2026-07-01T12:00:00.000Z");
  await persistDemoSummary({
    startedAt: new Date("2026-07-01T11:30:00.000Z"),
    endedAt,
    endReason: "expired",
    documentCreatedCount: 2,
    vaultCreatedCount: 1,
    linkCreatedCount: 1,
    visitCount: 4,
    eventCount: 10,
    deliveredBytes: 2_048,
    refusalCount: 1,
    analyticsIncomplete: false,
  });

  await foldExpiredDemoSummaries(new Date("2026-08-01T12:00:01.000Z"));

  await expect(database.select().from(demoSummary)).resolves.toEqual([]);
  await expect(database.select().from(demoDailyAggregate)).resolves.toEqual([
    expect.objectContaining({
      day: "2026-07-01",
      environmentCount: 1,
      expiredCount: 1,
      documentCreatedCount: 2,
      deliveredBytes: 2_048,
    }),
  ]);
});

test("three deduplicated fixed-category reports permanently pause an environment", async () => {
  const environment = await createEnvironment();
  const now = new Date("2026-08-20T12:00:00.000Z");

  await expect(
    recordDemoReport({
      environmentId: environment.id,
      category: "spam_or_phishing",
      details: "Requests banking credentials",
      networkHash: "hash-a-0123456789",
      now,
    }),
  ).resolves.toMatchObject({ accepted: true, reportCount: 1 });
  await expect(
    recordDemoReport({
      environmentId: environment.id,
      category: "spam_or_phishing",
      networkHash: "hash-a-0123456789",
      now,
    }),
  ).resolves.toEqual({ accepted: false, reason: "duplicate" });
  for (const networkHash of ["hash-b-0123456789", "hash-c-0123456789"]) {
    await recordDemoReport({
      environmentId: environment.id,
      category: "harmful_or_illegal_content",
      networkHash,
      now,
    });
  }

  await recordDemoReport({
    environmentId: environment.id,
    category: "malware_or_suspicious_download",
    networkHash: "hash-d-0123456789",
    now,
  });

  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({ state: "report_paused", stateVersion: 1, reportCount: 4 }),
  ]);
});

test("maintenance status exposes the current run, heartbeat, outcome, and last result", async () => {
  const startedAt = new Date("2026-08-20T12:00:00.000Z");
  const run = await startMaintenanceRun("reaper", startedAt);
  await completeMaintenanceRun(
    run.id,
    { removedEnvironmentCount: 2 },
    new Date("2026-08-20T12:00:05.000Z"),
  );
  const current = await startMaintenanceRun("reaper", new Date("2026-08-20T12:00:10.000Z"));

  await expect(readMaintenanceStatus("reaper")).resolves.toMatchObject({
    current: { id: current.id, status: "running" },
    last: {
      status: "succeeded",
      startedAt,
      heartbeatAt: new Date("2026-08-20T12:00:05.000Z"),
      finishedAt: new Date("2026-08-20T12:00:05.000Z"),
      outcome: { removedEnvironmentCount: 2 },
      failure: null,
    },
  });
  await expect(latestSuccessfulMaintenanceObservation("reaper")).resolves.toMatchObject({
    status: "succeeded",
    finishedAt: new Date("2026-08-20T12:00:05.000Z"),
  });
  await expect(
    deploymentRuntimeCapabilities(true, new Date("2026-08-20T12:00:10.000Z")),
  ).resolves.toMatchObject({
    database: true,
    redis: true,
    storage: true,
    reaperFresh: true,
  });
});
