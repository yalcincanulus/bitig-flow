import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  demoDailyAggregate,
  demoEnvironment,
  demoReport,
  demoSummary,
  deploymentPolicy,
  document,
  maintenanceRun,
  organization,
  user,
} from "#/server/db/schema";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createOrganizationFixture,
  database,
  enableFixtureDemoAdmission,
  enterAdditionalFixtureDemo,
  fixtureObjectExists,
  readUploadSample,
} from "../fixtures";
import { test } from "./http";

const documentsModulePath = "/src/server/functions/documents.ts";
const linksModulePath = "/src/server/functions/links.ts";
const vaultsModulePath = "/src/server/functions/vaults.ts";

test("the serial rollout journey enters, uses, limits, ends, expires, aggregates, and cleans up", async () => {
  const durable = await createOrganizationFixture();
  const durableDocument = await createFixtureDocument({
    organizationId: durable.organization.id,
    createdBy: durable.member.user.id,
    title: "Durable regression Document",
  });
  const operator = await enableFixtureDemoAdmission();
  const demo = await enterAdditionalFixtureDemo("198.51.100.210");

  const dashboardContext = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/dashboard.ts",
    exportName: "getDashboardContext",
    method: "GET",
  });
  const dashboard = (await dashboardContext.json()) as {
    demo: { samples: { documents: string[]; vaults: string[]; links: string[] } };
  };
  expect(dashboard.demo.samples).toMatchObject({
    documents: expect.arrayContaining([expect.any(String)]),
    vaults: [expect.any(String)],
    links: [expect.any(String)],
  });

  const listedSamples = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  const sampleDocuments = (await listedSamples.json()) as Array<{
    id: string;
    title: string;
    kind: string;
    content: string | null;
    updatedAt: string;
  }>;
  const welcome = sampleDocuments.find(
    (candidate) =>
      candidate.kind === "markdown" && dashboard.demo.samples.documents.includes(candidate.id),
  );
  if (!welcome) throw new Error("Sample Markdown Document is unavailable");
  const usedSample = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: welcome.id,
      title: welcome.title,
      content: `${welcome.content ?? ""}\nReviewed during rollout.`,
      updatedAt: welcome.updatedAt,
    },
  });
  expect(usedSample.status).toBe(200);

  const uploadBytes = readUploadSample("one-page.pdf");
  const staged = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "createUpload",
    method: "POST",
    data: {
      documentId: randomUUID(),
      fileName: "rollout-proof.pdf",
      contentType: "application/pdf",
      byteSize: uploadBytes.byteLength,
    },
  });
  expect(staged.status).toBe(200);
  const upload = (await staged.json()) as { document: { id: string }; uploadUrl: string };
  expect((await fetch(upload.uploadUrl, { method: "PUT", body: uploadBytes })).ok).toBe(true);
  const confirmed = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "confirmUpload",
    method: "POST",
    data: { documentId: upload.document.id, contentType: "application/pdf" },
  });
  expect(confirmed.status).toBe(200);
  const uploaded = (await confirmed.json()) as { id: string; storageKey: string };

  const createdDocumentId = randomUUID();
  const createdVaultId = randomUUID();
  const createdLinkId = randomUUID();
  const createdDocument = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "createDocument",
    method: "POST",
    data: { documentId: createdDocumentId, title: "Rollout notes" },
  });
  const createdVault = await callServerFunction(demo.http, {
    modulePath: vaultsModulePath,
    exportName: "createVault",
    method: "POST",
    data: { vaultId: createdVaultId, name: "Rollout Vault", description: "Journey proof" },
  });
  const createdLink = await callServerFunction(demo.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId: createdLinkId,
      documentId: createdDocumentId,
      name: "Rollout share",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: true,
      expiresAt: null,
    },
  });
  expect([createdDocument.status, createdVault.status, createdLink.status]).toEqual([
    200, 200, 200,
  ]);
  const shared = (await createdLink.json()) as { slug: string };

  const visitor = createCookieClient();
  const viewed = await visitor.http(new URL(`/v/${shared.slug}`, process.env.BETTER_AUTH_URL));
  expect(viewed.status).toBe(200);
  expect(await viewed.text()).toContain("Temporary demo content");

  await database
    .update(demoEnvironment)
    .set({ documentCount: 5 })
    .where(eq(demoEnvironment.id, demo.environment.id));
  await database
    .update(deploymentPolicy)
    .set({ documentCount: 5 })
    .where(eq(deploymentPolicy.id, "deployment"));
  const quotaRefusal = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "createDocument",
    method: "POST",
    data: { documentId: randomUUID(), title: "Over the representative quota" },
  });
  expect(quotaRefusal.status).toBe(429);
  expect(await quotaRefusal.json()).toMatchObject({
    code: "DEMO_QUOTA_EXCEEDED",
    limit: "documentCount",
  });

  const reported = await fetch(
    new URL(`/api/demo/reports/${shared.slug}`, process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: process.env.BETTER_AUTH_URL!,
        "x-forwarded-for": "198.51.100.211",
      },
      body: JSON.stringify({ category: "spam_or_phishing" }),
    },
  );
  expect(reported.status).toBe(201);

  const ended = await demo.http(new URL("/api/demo/end", process.env.BETTER_AUTH_URL), {
    method: "POST",
  });
  expect(ended.status).toBe(200);
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(demoReport)).resolves.toEqual([]);
  await expect(fixtureObjectExists(uploaded.storageKey)).resolves.toBe(false);
  await expect(database.select().from(demoSummary)).resolves.toEqual([
    expect.objectContaining({
      endReason: "ended_by_demo_user",
      documentCreatedCount: 2,
      vaultCreatedCount: 1,
      linkCreatedCount: 1,
      refusalCount: 1,
    }),
  ]);

  const expiring = await enterAdditionalFixtureDemo("198.51.100.212");
  await database
    .update(demoEnvironment)
    .set({ expiresAt: new Date(Date.now() - 1) })
    .where(eq(demoEnvironment.id, expiring.environment.id));
  const reaperUrl = new URL("/api/operations/reaper", process.env.BETTER_AUTH_URL);
  const expired = await operator.http(reaperUrl, { method: "POST" });
  expect(expired.status).toBe(200);
  expect(await expired.json()).toMatchObject({ expiredEnvironmentCount: 1 });
  await expect(database.select().from(demoSummary)).resolves.toHaveLength(2);

  await database.update(demoSummary).set({ retainUntil: new Date(Date.now() - 1) });
  expect((await operator.http(reaperUrl, { method: "POST" })).status).toBe(200);
  await expect(database.select().from(demoSummary)).resolves.toHaveLength(2);
  const aggregated = await operator.http(
    new URL("/api/operations/summary-fold", process.env.BETTER_AUTH_URL),
    { method: "POST" },
  );
  expect(aggregated.status).toBe(200);
  expect(await aggregated.json()).toMatchObject({ foldedSummaryCount: 2 });
  await expect(database.select().from(maintenanceRun)).resolves.toContainEqual(
    expect.objectContaining({ kind: "summary_fold", status: "succeeded" }),
  );
  await expect(database.select().from(demoSummary)).resolves.toEqual([]);
  await expect(database.select().from(demoDailyAggregate)).resolves.toEqual([
    expect.objectContaining({
      environmentCount: 2,
      endedByDemoUserCount: 1,
      expiredCount: 1,
      documentCreatedCount: 2,
      vaultCreatedCount: 1,
      linkCreatedCount: 1,
    }),
  ]);
  await expect(database.select().from(demoEnvironment)).resolves.toEqual([]);
  await expect(database.select().from(user).where(eq(user.isAnonymous, true))).resolves.toEqual([]);

  const durableDocuments = await callServerFunction(durable.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(durableDocuments.status).toBe(200);
  expect(await durableDocuments.json()).toContainEqual(
    expect.objectContaining({ id: durableDocument.id, title: durableDocument.title }),
  );
  await expect(
    database.select().from(organization).where(eq(organization.id, durable.organization.id)),
  ).resolves.toHaveLength(1);
  await expect(
    database.select().from(document).where(eq(document.id, durableDocument.id)),
  ).resolves.toHaveLength(1);
});
