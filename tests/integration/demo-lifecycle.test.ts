import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { expect } from "vitest";

import {
  demoEnvironment,
  demoGlobalUsage,
  demoProvisioningAttempt,
  demoSampleResource,
  demoSummary,
  deploymentPolicy,
  document,
  link,
  maintenanceRun,
  member,
  organization,
  platformOperator,
  session,
  user,
  vault,
} from "#/server/db/schema";
import { initialDeploymentPolicy } from "#/lib/deployment-policy";
import {
  demoAdmissionKey,
  releaseDemoAdmission,
  reserveDemoAdmission,
} from "#/server/demo-admission";

import { createCookieClient, createFixtureUser, fixtureObjectExists } from "../fixtures";
import { database, redis } from "../fixtures/services";
import { test } from "./http";

async function enableDemoAdmission() {
  const operator = await createFixtureUser();
  const now = new Date();

  await database.insert(platformOperator).values({ userId: operator.user.id });
  await database.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, operator.user.id));
  await database.insert(deploymentPolicy).values({ acceptNewDemos: true });
  await database.insert(demoGlobalUsage).values({ id: "demo-global" });
  await database.insert(maintenanceRun).values([
    {
      kind: "reaper",
      status: "succeeded",
      startedAt: now,
      heartbeatAt: now,
      finishedAt: now,
      outcome: {},
    },
    {
      kind: "sweep",
      status: "succeeded",
      startedAt: now,
      heartbeatAt: now,
      finishedAt: now,
      outcome: {},
    },
  ]);
  return operator;
}

function demoEntryHeaders(ip: string, entryKey = randomUUID()) {
  return {
    origin: process.env.BETTER_AUTH_URL!,
    "x-demo-entry-key": entryKey,
    "x-forwarded-for": ip,
  };
}

test("an old admission reservation cannot decrement a new counter window", async () => {
  const admissionKey = "demo:admission:window-boundary-test";
  const oldReservationId = randomUUID();
  const newReservationId = randomUUID();

  await expect(reserveDemoAdmission(admissionKey, oldReservationId)).resolves.toMatchObject({
    accepted: true,
  });
  await Promise.all([redis.del(admissionKey), redis.del(`${admissionKey}:generation`)]);
  await expect(reserveDemoAdmission(admissionKey, newReservationId)).resolves.toMatchObject({
    accepted: true,
  });

  await releaseDemoAdmission(admissionKey, oldReservationId);

  await expect(redis.get(admissionKey)).resolves.toBe("1");
});

test("Demo entry provisions one ready environment and resumes its Session", async () => {
  await enableDemoAdmission();
  const client = createCookieClient();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);
  const headers = demoEntryHeaders("198.51.100.23");

  const entered = await client.http(entryUrl, { method: "POST", headers });
  expect(entered.status).toBe(201);
  expect(await entered.json()).toMatchObject({
    resumed: false,
    redirectTo: "/dashboard/documents",
  });

  const environments = await database.select().from(demoEnvironment);
  const provisioningAttempts = await database.select().from(demoProvisioningAttempt);
  const anonymousUsers = await database.select().from(user).where(eq(user.isAnonymous, true));
  const organizations = await database.select().from(organization);
  const memberships = await database.select().from(member);
  const documents = await database.select().from(document);
  const vaults = await database.select().from(vault);
  const links = await database.select().from(link);
  const sampleResources = await database.select().from(demoSampleResource);

  expect(environments).toHaveLength(1);
  expect(provisioningAttempts).toEqual([
    expect.objectContaining({
      state: "ready",
      admissionKey: null,
      admissionReserved: false,
      userId: null,
      organizationId: null,
      environmentId: environments[0]!.id,
    }),
  ]);
  expect(environments[0]).toMatchObject({
    state: "active",
    documentCount: 3,
    uploadedDocumentCount: 2,
    vaultCount: 1,
    linkCount: 1,
  });
  expect(environments[0]!.expiresAt.getTime() - environments[0]!.createdAt.getTime()).toBe(
    24 * 60 * 60 * 1_000,
  );
  expect(anonymousUsers).toHaveLength(1);
  expect(anonymousUsers[0]).toMatchObject({ name: "Demo User", isAnonymous: true });
  expect(organizations).toContainEqual(expect.objectContaining({ name: "bitig-flow Demo" }));
  expect(memberships).toContainEqual(
    expect.objectContaining({
      organizationId: environments[0]!.organizationId,
      userId: environments[0]!.userId,
      role: "owner",
    }),
  );
  expect(documents).toHaveLength(3);
  expect(vaults).toHaveLength(1);
  expect(links).toHaveLength(1);
  expect(sampleResources.map((sample) => sample.kind).sort()).toEqual([
    "document",
    "document",
    "document",
    "link",
    "vault",
  ]);
  await expect(
    database.insert(demoSampleResource).values({
      environmentId: environments[0]!.id,
      kind: "document",
    }),
  ).rejects.toMatchObject({
    cause: { constraint: "demo_sample_resource_typed_target_check" },
  });

  const dashboard = await client.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(dashboard.status).toBe(200);
  const dashboardHtml = await dashboard.text();
  expect(dashboardHtml).toContain("Temporary Demo Environment");
  expect(dashboardHtml).not.toContain(">Sign out");

  const resumed = await client.http(entryUrl, { method: "POST", headers });
  expect(resumed.status).toBe(200);
  expect(await resumed.json()).toMatchObject({ resumed: true });
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(1);
  await expect(
    database.select().from(user).where(eq(user.isAnonymous, true)),
  ).resolves.toHaveLength(1);
});

test("concurrent first entry requests with one browser key create one environment", async () => {
  await enableDemoAdmission();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);
  const headers = demoEntryHeaders("198.51.100.40");
  const clients = [createCookieClient(), createCookieClient()];

  const responses = await Promise.all(
    clients.map((client) => client.http(entryUrl, { method: "POST", headers })),
  );

  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(1);
  await expect(
    database.select().from(user).where(eq(user.isAnonymous, true)),
  ).resolves.toHaveLength(1);
  for (const client of clients) {
    const dashboard = await client.http(
      new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
      { redirect: "manual" },
    );
    expect(dashboard.status).toBe(200);
  }
});

test("a response-loss retry recovers its durable environment after the Redis result is lost", async () => {
  await enableDemoAdmission();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);
  const entryKey = randomUUID();
  const headers = demoEntryHeaders("198.51.100.46", entryKey);

  const lostResponse = await fetch(entryUrl, { method: "POST", headers });
  expect(lostResponse.status).toBe(201);
  await redis.del(`demo:entry:${entryKey}`);

  const retryingClient = createCookieClient();
  const recovered = await retryingClient.http(entryUrl, { method: "POST", headers });

  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({ resumed: true });
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(1);
  const dashboard = await retryingClient.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(dashboard.status).toBe(200);
});

test("a Demo entry key cannot recover a Session after its short retry window", async () => {
  await enableDemoAdmission();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);
  const entryKey = randomUUID();
  const headers = demoEntryHeaders("198.51.100.47", entryKey);

  expect((await fetch(entryUrl, { method: "POST", headers })).status).toBe(201);
  await database.update(demoProvisioningAttempt).set({
    createdAt: new Date(Date.now() - 10 * 60 * 1_000),
    recoveryExpiresAt: new Date(Date.now() - 1_000),
  });

  const refused = await createCookieClient().http(entryUrl, { method: "POST", headers });

  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({ reason: "environmentUnavailable" });
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(1);
});

test("Demo entry refuses a cross-origin POST before consuming admission", async () => {
  await enableDemoAdmission();

  const refused = await createCookieClient().http(
    new URL("/api/demo/entry", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "x-demo-entry-key": randomUUID(),
        "x-forwarded-for": "198.51.100.41",
      },
    },
  );

  expect(refused.status).toBe(403);
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoProvisioningAttempt)).resolves.toEqual([]);
});

test("anonymous Better Auth mutations cannot bypass Demo termination", async () => {
  await enableDemoAdmission();
  const client = createCookieClient();
  const headers = demoEntryHeaders("198.51.100.42");
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers,
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);

  const deleted = await client.http(
    new URL("/api/auth/organization/delete", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
      body: JSON.stringify({ organizationId: environment!.organizationId }),
    },
  );
  const signedOut = await client.http(new URL("/api/auth/sign-out", process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });

  expect(deleted.status).toBe(403);
  expect(signedOut.status).toBe(403);
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(1);
  await expect(database.select().from(demoSummary)).resolves.toEqual([]);
});

test("End Demo revokes access and removes the environment through one termination", async () => {
  await enableDemoAdmission();
  const client = createCookieClient();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);
  const headers = demoEntryHeaders("198.51.100.24");
  expect((await client.http(entryUrl, { method: "POST", headers })).status).toBe(201);

  const [environment] = await database.select().from(demoEnvironment);
  const storedDocuments = await database.select({ storageKey: document.storageKey }).from(document);
  const storageKeys = storedDocuments.flatMap((row) =>
    row.storageKey === null ? [] : [row.storageKey],
  );
  expect(environment).toBeDefined();
  expect(storageKeys).toHaveLength(2);

  const ended = await client.http(new URL("/api/demo/end", process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
  expect(ended.status).toBe(200);
  expect(await ended.json()).toEqual({ ended: true });

  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoProvisioningAttempt)).resolves.toEqual([]);
  await expect(database.select().from(user).where(eq(user.isAnonymous, true))).resolves.toEqual([]);
  await expect(database.select().from(session)).resolves.toHaveLength(1);
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({ endReason: "ended_by_demo_user" }),
  ]);
  for (const storageKey of storageKeys) {
    await expect(fixtureObjectExists(storageKey)).resolves.toBe(false);
  }

  const refused = await client.http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(refused.status).toBe(307);
  expect(refused.headers.get("location")).toBe("/sign-in");
});

test("an expired Demo Environment is refused before the Reaper runs", async () => {
  await enableDemoAdmission();
  const client = createCookieClient();
  const headers = demoEntryHeaders("198.51.100.25");
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers,
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);
  await database
    .update(demoEnvironment)
    .set({
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1_000),
    })
    .where(eq(demoEnvironment.id, environment!.id));

  const refused = await client.http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(refused.status).toBe(307);
  expect(refused.headers.get("location")).toBe("/");
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({ endReason: "expired" }),
  ]);
});

test("the Operator can run the Reaper and retry completed cleanup safely", async () => {
  const operator = await enableDemoAdmission();
  const client = createCookieClient();
  const headers = demoEntryHeaders("198.51.100.26");
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers,
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);
  await database
    .update(demoEnvironment)
    .set({
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1_000),
    })
    .where(eq(demoEnvironment.id, environment!.id));

  const reaperUrl = new URL("/api/operations/reaper", process.env.BETTER_AUTH_URL);
  const first = await operator.http(reaperUrl, {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({
    acquired: true,
    expiredEnvironmentCount: 1,
    completedEnvironmentCount: 1,
  });
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoSummary)).resolves.toHaveLength(1);

  const retry = await operator.http(reaperUrl, {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({
    acquired: true,
    expiredEnvironmentCount: 0,
    completedEnvironmentCount: 0,
  });
  await expect(database.select().from(demoSummary)).resolves.toHaveLength(1);
  await expect(
    database.select().from(maintenanceRun).where(eq(maintenanceRun.kind, "reaper")),
  ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
});

test("Operator termination uses the same resumable termination workflow", async () => {
  const operator = await enableDemoAdmission();
  const client = createCookieClient();
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers: demoEntryHeaders("198.51.100.27"),
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);

  const ended = await operator.http(
    new URL(
      `/api/operations/demo-environments/${environment!.id}/end`,
      process.env.BETTER_AUTH_URL,
    ),
    { method: "POST", headers: { origin: process.env.BETTER_AUTH_URL! } },
  );
  expect(ended.status).toBe(200);
  expect(await ended.json()).toMatchObject({ status: "completed" });
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({ endReason: "operator_terminated" }),
  ]);
});

test("Demo admission permits only three environment creations per network day", async () => {
  await enableDemoAdmission();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);

  for (let index = 0; index < 3; index++) {
    const response = await createCookieClient().http(entryUrl, {
      method: "POST",
      headers: demoEntryHeaders("198.51.100.28"),
    });
    expect(response.status).toBe(201);
  }
  const refused = await createCookieClient().http(entryUrl, {
    method: "POST",
    headers: demoEntryHeaders("198.51.100.28"),
  });
  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({ reason: "ipDailyLimit" });
  await expect(database.select().from(demoEnvironment)).resolves.toHaveLength(3);
});

test("Demo admission closes after the newest required maintenance run fails", async () => {
  await enableDemoAdmission();
  const failedAt = new Date(Date.now() + 1_000);
  await database.insert(maintenanceRun).values({
    kind: "reaper",
    status: "failed",
    startedAt: failedAt,
    heartbeatAt: failedAt,
    finishedAt: failedAt,
    failure: "Reaper failed",
  });

  const refused = await createCookieClient().http(
    new URL("/api/demo/entry", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: demoEntryHeaders("198.51.100.32"),
    },
  );

  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({ reason: "unavailable" });
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
});

test("Demo entry initializes the global usage singleton before reserving capacity", async () => {
  await enableDemoAdmission();
  await database.delete(demoGlobalUsage);

  const entered = await createCookieClient().http(
    new URL("/api/demo/entry", process.env.BETTER_AUTH_URL),
    { method: "POST", headers: demoEntryHeaders("198.51.100.45") },
  );

  expect(entered.status).toBe(201);
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ activeEnvironmentCount: 1 }),
  ]);
});

test("failed provisioning compensates identity, capacity, and admission reservations", async () => {
  await enableDemoAdmission();
  await database
    .update(deploymentPolicy)
    .set({ globalConfirmedBytes: 1 })
    .where(eq(deploymentPolicy.id, "deployment"));
  const client = createCookieClient();
  const entryUrl = new URL("/api/demo/entry", process.env.BETTER_AUTH_URL);
  const headers = demoEntryHeaders("198.51.100.29");

  const failed = await client.http(entryUrl, { method: "POST", headers });
  expect(failed.status).toBe(503);
  expect(await failed.json()).toMatchObject({ reason: "capacity" });
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(user).where(eq(user.isAnonymous, true))).resolves.toEqual([]);
  await expect(database.select().from(organization)).resolves.toEqual([]);
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ activeEnvironmentCount: 0, confirmedBytes: 0 }),
  ]);

  await database
    .update(deploymentPolicy)
    .set({ globalConfirmedBytes: initialDeploymentPolicy.globalConfirmedBytes })
    .where(eq(deploymentPolicy.id, "deployment"));
  const retried = await client.http(entryUrl, { method: "POST", headers });
  expect(retried.status).toBe(201);
});

test("the Reaper resumes a partially persisted termination without duplicating its Summary", async () => {
  const operator = await enableDemoAdmission();
  const client = createCookieClient();
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers: demoEntryHeaders("198.51.100.30"),
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);
  await database
    .update(demoEnvironment)
    .set({ state: "terminating", stateVersion: 2, endReason: "operator_terminated" })
    .where(eq(demoEnvironment.id, environment!.id));

  const reaperUrl = new URL("/api/operations/reaper", process.env.BETTER_AUTH_URL);
  const resumed = await operator.http(reaperUrl, {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
  expect(resumed.status).toBe(200);
  expect(await resumed.json()).toMatchObject({
    resumedEnvironmentCount: 1,
    completedEnvironmentCount: 1,
  });
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({ endReason: "operator_terminated" }),
  ]);

  await operator.http(reaperUrl, {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
  await expect(database.select().from(demoSummary)).resolves.toHaveLength(1);
});

test("the Reaper retires stale provisioning after its short recovery deadline", async () => {
  const operator = await enableDemoAdmission();
  const client = createCookieClient();
  const entryHeaders = demoEntryHeaders("198.51.100.43");
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers: entryHeaders,
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);
  const admissionKey = demoAdmissionKey(new Headers(entryHeaders));
  await database
    .update(demoEnvironment)
    .set({ state: "provisioning", createdAt: new Date(Date.now() - 10 * 60 * 1_000) })
    .where(eq(demoEnvironment.id, environment!.id));
  await database.update(demoProvisioningAttempt).set({
    state: "provisioning",
    admissionKey,
    admissionReserved: true,
    createdAt: new Date(Date.now() - 10 * 60 * 1_000),
  });

  const reaped = await operator.http(
    new URL("/api/operations/reaper", process.env.BETTER_AUTH_URL),
    { method: "POST", headers: { origin: process.env.BETTER_AUTH_URL! } },
  );

  expect(reaped.status).toBe(200);
  expect(await reaped.json()).toMatchObject({ completedEnvironmentCount: 1 });
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({ endReason: "provisioning_failed" }),
  ]);
  await expect(redis.get(admissionKey)).resolves.toBeNull();
});

test("the Reaper compensates a stale pre-environment provisioning attempt", async () => {
  const operator = await enableDemoAdmission();
  const staleAt = new Date(Date.now() - 10 * 60 * 1_000);
  const [orphanUser] = await database
    .insert(user)
    .values({
      name: "Interrupted Demo User",
      email: `demo-${randomUUID()}@example.invalid`,
      isAnonymous: true,
      createdAt: staleAt,
      updatedAt: staleAt,
    })
    .returning();
  const [orphanOrganization] = await database
    .insert(organization)
    .values({ name: "Interrupted Demo", slug: `demo-${randomUUID()}`, createdAt: staleAt })
    .returning();
  await database.insert(member).values({
    organizationId: orphanOrganization!.id,
    userId: orphanUser!.id,
    role: "owner",
    createdAt: staleAt,
  });
  const [attempt] = await database
    .insert(demoProvisioningAttempt)
    .values({
      entryKeyHash: "a".repeat(64),
      state: "provisioning",
      admissionKey: "demo:admission:interrupted-test-network",
      admissionReserved: true,
      globalReserved: true,
      recoveryExpiresAt: new Date(staleAt.getTime() + 5 * 60 * 1_000),
      createdAt: staleAt,
      updatedAt: staleAt,
    })
    .returning();
  await database
    .update(demoGlobalUsage)
    .set({ activeEnvironmentCount: 1 })
    .where(eq(demoGlobalUsage.id, "demo-global"));
  await redis.set("demo:admission:interrupted-test-network", "2", { EX: 24 * 60 * 60 });
  await redis.set("demo:admission:interrupted-test-network:generation", "test-generation", {
    EX: 24 * 60 * 60,
  });
  await redis.set(
    `demo:admission:interrupted-test-network:reservation:${attempt!.id}`,
    "test-generation",
    { EX: 24 * 60 * 60 },
  );

  const reaped = await operator.http(
    new URL("/api/operations/reaper", process.env.BETTER_AUTH_URL),
    { method: "POST", headers: { origin: process.env.BETTER_AUTH_URL! } },
  );

  expect(reaped.status).toBe(200);
  expect(await reaped.json()).toMatchObject({ failedProvisioningCount: 1 });
  await expect(database.select().from(demoProvisioningAttempt)).resolves.toEqual([]);
  await expect(database.select().from(user).where(eq(user.isAnonymous, true))).resolves.toEqual([]);
  await expect(database.select().from(organization)).resolves.toEqual([]);
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ activeEnvironmentCount: 0 }),
  ]);
  await expect(redis.get("demo:admission:interrupted-test-network")).resolves.toBe("1");

  await operator.http(new URL("/api/operations/reaper", process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
  await expect(redis.get("demo:admission:interrupted-test-network")).resolves.toBe("1");
});

test("a post-environment activation failure compensates all durable resources", async () => {
  await enableDemoAdmission();
  await database.execute(sql`
    CREATE FUNCTION test_fail_demo_activation() RETURNS trigger AS $$
    BEGIN
      IF NEW.state = 'active' THEN
        RAISE EXCEPTION 'activation unavailable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.execute(sql`
    CREATE TRIGGER test_fail_demo_activation
    BEFORE UPDATE ON demo_environment
    FOR EACH ROW EXECUTE FUNCTION test_fail_demo_activation()
  `);

  let failed: Response;
  try {
    failed = await createCookieClient().http(
      new URL("/api/demo/entry", process.env.BETTER_AUTH_URL),
      {
        method: "POST",
        headers: demoEntryHeaders("198.51.100.44"),
      },
    );
  } finally {
    await database.execute(sql`DROP TRIGGER test_fail_demo_activation ON demo_environment`);
    await database.execute(sql`DROP FUNCTION test_fail_demo_activation()`);
  }

  expect(failed!.status).toBe(500);
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(user).where(eq(user.isAnonymous, true))).resolves.toEqual([]);
  await expect(database.select().from(organization)).resolves.toEqual([]);
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ activeEnvironmentCount: 0, confirmedBytes: 0 }),
  ]);
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({ endReason: "provisioning_failed" }),
  ]);
});

test("Better Auth refuses an expired Demo Session at its authenticated boundary", async () => {
  await enableDemoAdmission();
  const client = createCookieClient();
  expect(
    (
      await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers: demoEntryHeaders("198.51.100.31"),
      })
    ).status,
  ).toBe(201);
  const [environment] = await database.select().from(demoEnvironment);
  await database
    .update(demoEnvironment)
    .set({
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1_000),
    })
    .where(eq(demoEnvironment.id, environment!.id));

  const refused = await client.http(
    new URL("/api/auth/organization/list", process.env.BETTER_AUTH_URL),
    { headers: { origin: process.env.BETTER_AUTH_URL! } },
  );
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "DEMO_ENVIRONMENT_UNAVAILABLE" });
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
});
