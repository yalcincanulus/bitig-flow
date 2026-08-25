import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import { initialDeploymentPolicy } from "#/lib/deployment-policy";
import { deploymentRuntimeCapabilities } from "#/server/deployment-capabilities";
import {
  demoDailyAggregate,
  document,
  demoEnvironment,
  demoGlobalUsage,
  demoReport,
  demoSampleResource,
  demoSummary,
  deploymentPolicy,
  maintenanceRun,
  link,
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
import { callServerFunction, createFixtureUser, enterFixtureDemo } from "../fixtures";
import { database } from "../fixtures/services";
import { test } from "./http";
import { mailpitBaseUrl } from "./environment";

const mailpitUrl = mailpitBaseUrl(process.env);

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

async function waitForMailTo(email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (response.ok) {
      const result = (await response.json()) as { messages: Array<{ Subject: string }> };
      if (result.messages.length > 0) return result.messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
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

test("Demo writes count non-Sample adoption without letting Sample edits fabricate it", async () => {
  const demo = await enterFixtureDemo();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20801";
  const vaultId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af10801";
  const linkId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af30801";

  const createDocument = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/documents.ts",
    exportName: "createDocument",
    method: "POST",
    data: { documentId, title: "Reviewer notes" },
  });
  const createVault = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/vaults.ts",
    exportName: "createVault",
    method: "POST",
    data: { vaultId, name: "Reviewer collection", description: "Created in the demo" },
  });
  const createLink = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/links.ts",
    exportName: "createLink",
    method: "POST",
    data: {
      linkId,
      documentId,
      name: "Reviewer link",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: true,
      expiresAt: null,
    },
  });
  expect([createDocument.status, createVault.status, createLink.status]).toEqual([200, 200, 200]);

  const samples = await database
    .select()
    .from(demoSampleResource)
    .where(eq(demoSampleResource.environmentId, demo.environment.id));
  const sampleVaultId = samples.find((sample) => sample.vaultId)?.vaultId;
  const sampleLinkId = samples.find((sample) => sample.linkId)?.linkId;
  const [sampleDocument] = await database
    .select({
      id: document.id,
      title: document.title,
      content: document.content,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .innerJoin(demoSampleResource, eq(demoSampleResource.documentId, document.id))
    .where(
      and(eq(demoSampleResource.environmentId, demo.environment.id), eq(document.kind, "markdown")),
    )
    .limit(1);
  if (!sampleDocument || !sampleVaultId || !sampleLinkId) throw new Error("Sample fixture missing");

  const updateDocument = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/documents.ts",
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: sampleDocument.id,
      title: sampleDocument.title,
      content: sampleDocument.content ?? "",
      updatedAt: sampleDocument.updatedAt,
    },
  });
  const updateVault = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/vaults.ts",
    exportName: "updateVault",
    method: "POST",
    data: { vaultId: sampleVaultId, name: "Edited Sample", description: null },
  });
  const [sampleLink] = await database.select().from(link).where(eq(link.id, sampleLinkId));
  const updateLink = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/links.ts",
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: sampleLinkId,
      name: "Edited Sample",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: sampleLink!.allowDownload,
      expiresAt: sampleLink!.expiresAt,
      isActive: sampleLink!.isActive,
    },
  });
  expect([updateDocument.status, updateVault.status, updateLink.status]).toEqual([200, 200, 200]);

  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      documentLifetimeCount: 1,
      documentActivityCount: 1,
      vaultActivityCount: 1,
      linkActivityCount: 1,
    }),
  ]);
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
    documentActivityCount: 3,
    vaultActivityCount: 2,
    linkActivityCount: 1,
    visitCount: 4,
    eventCount: 10,
    downloadCount: 2,
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
      documentActivityCount: 3,
      vaultActivityCount: 2,
      linkActivityCount: 1,
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

test("fleet deletion closes admission and resumes in bounded batches", async () => {
  await ensureDeploymentOperationsSingletons();
  const operator = await createOperator();
  await database
    .update(deploymentPolicy)
    .set({ acceptNewDemos: true })
    .where(eq(deploymentPolicy.id, "deployment"));
  await Promise.all(Array.from({ length: 7 }, () => createEnvironment()));

  const refused = await operator.http(
    new URL("/api/operations/demo-environments", process.env.BETTER_AUTH_URL),
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "delete everything" }),
    },
  );
  expect(refused.status).toBe(422);
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(7);
  await expect(database.select().from(deploymentPolicy)).resolves.toEqual([
    expect.objectContaining({ acceptNewDemos: true }),
  ]);

  const first = await operator.http(
    new URL("/api/operations/demo-environments", process.env.BETTER_AUTH_URL),
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE ALL DEMO ENVIRONMENTS" }),
    },
  );
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ processedCount: 5, remainingCount: 2, completed: false });
  await expect(database.select().from(deploymentPolicy)).resolves.toEqual([
    expect.objectContaining({ acceptNewDemos: false, updatedBy: operator.user.id }),
  ]);

  const resumed = await operator.http(
    new URL("/api/operations/demo-environments", process.env.BETTER_AUTH_URL),
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE ALL DEMO ENVIRONMENTS" }),
    },
  );
  expect(resumed.status).toBe(200);
  expect(await resumed.json()).toEqual({ processedCount: 2, remainingCount: 0, completed: true });
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoSummary)).resolves.toEqual(
    Array.from({ length: 7 }, () => expect.objectContaining({ endReason: "fleet_deleted" })),
  );
});

test("test mail is Operator-only and always targets the Operator address", async () => {
  const durableUser = await createFixtureUser();
  const forbidden = await durableUser.http(
    new URL("/api/operations/mail/test", process.env.BETTER_AUTH_URL),
    { method: "POST" },
  );
  expect(forbidden.status).toBe(403);

  const operator = await createOperator();
  const attemptedRecipient = `not-operator-${randomUUID()}@example.com`;
  const response = await operator.http(
    new URL("/api/operations/mail/test", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: attemptedRecipient }),
    },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ sentTo: operator.user.email });
  expect(await waitForMailTo(operator.user.email)).toEqual([
    expect.objectContaining({ Subject: "bitig-flow Operations test email" }),
  ]);
  expect(await waitForMailTo(attemptedRecipient)).toEqual([]);
});

test("Operations routes expose aggregate controls without Organization or report content", async () => {
  await ensureDeploymentOperationsSingletons();
  const operator = await createOperator();
  const environment = await createEnvironment();
  const reportDetails = `private-report-detail-${randomUUID()}`;
  await recordDemoReport({
    environmentId: environment.id,
    category: "spam_or_phishing",
    details: reportDetails,
    networkHash: "operations-route-hash",
  });

  const overview = await operator.http(new URL("/operations", process.env.BETTER_AUTH_URL));
  expect(overview.status).toBe(200);
  const overviewHtml = await overview.text();
  expect(overviewHtml).toContain(">Overview</h1>");
  expect(overviewHtml).toContain("Public analytics are best-effort");
  expect(overviewHtml).toContain("30-day aggregate trend");

  await database
    .update(deploymentPolicy)
    .set({ pauseAllDemoAccess: true })
    .where(eq(deploymentPolicy.id, "deployment"));

  const environments = await operator.http(
    new URL("/operations/environments", process.env.BETTER_AUTH_URL),
  );
  expect(environments.status).toBe(200);
  const environmentsHtml = await environments.text();
  expect(environmentsHtml).toContain(">Demo Environments</h1>");
  expect(environmentsHtml).toContain(environment.anonymousReference);
  expect(environmentsHtml).toContain("global paused");
  expect(environmentsHtml).not.toContain(environment.organizationId);
  expect(environmentsHtml).not.toContain(environment.userId);
  expect(environmentsHtml).not.toContain(reportDetails);

  const policy = await operator.http(new URL("/operations/policy", process.env.BETTER_AUTH_URL));
  expect(policy.status).toBe(200);
  const policyHtml = await policy.text();
  expect(policyHtml).toContain(">Deployment Policy</h1>");
  expect(policyHtml).toContain("Accept new demos");
  expect(policyHtml).toContain("Delete all Demo Environments");

  const records = await operator.http(
    new URL("/api/operations/demo-records", process.env.BETTER_AUTH_URL),
  );
  expect(records.status).toBe(200);
  const recordsJson = await records.text();
  expect(recordsJson).not.toContain(environment.organizationId);
  expect(recordsJson).not.toContain(environment.userId);
  expect(recordsJson).not.toContain(reportDetails);
});
