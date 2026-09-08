import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { expect } from "vitest";

import {
  demoEnvironment,
  demoGlobalUsage,
  demoReport,
  deploymentPolicy,
  document,
  documentUpload,
  link,
  maintenanceRun,
  visit,
  visitEvent,
  vault,
} from "#/server/db/schema";
import { sweepExpiredDemoReports, sweepUnconfirmedUploads } from "#/server/sweep";

import {
  callServerFunction,
  createCookieClient,
  database,
  enterAdditionalFixtureDemo,
  enterFixtureDemo,
  readUploadSample,
} from "../fixtures";
import { test } from "./http";

const documentsModulePath = "/src/server/functions/documents.ts";
const linksModulePath = "/src/server/functions/links.ts";
const vaultsModulePath = "/src/server/functions/vaults.ts";

test("Demo Uploads require a fresh Sweep heartbeat", async () => {
  const demo = await enterFixtureDemo();
  const staleHeartbeat = new Date(Date.now() - 49 * 60 * 60 * 1_000);
  await database
    .update(maintenanceRun)
    .set({ heartbeatAt: staleHeartbeat, finishedAt: staleHeartbeat })
    .where(eq(maintenanceRun.kind, "sweep"));

  const response = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "createUpload",
    method: "POST",
    data: {
      documentId: randomUUID(),
      fileName: "blocked.pdf",
      contentType: "application/pdf",
      byteSize: 1024,
    },
  });

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({ code: "DEMO_UPLOAD_UNAVAILABLE" }),
  );
  await expect(
    database
      .select()
      .from(document)
      .where(eq(document.organizationId, demo.environment.organizationId)),
  ).resolves.toHaveLength(3);
});

test("Sweep releases abandoned Demo Upload reservations but not lifetime use", async () => {
  const demo = await enterFixtureDemo();
  const response = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "createUpload",
    method: "POST",
    data: {
      documentId: randomUUID(),
      fileName: "abandoned.pdf",
      contentType: "application/pdf",
      byteSize: 1024,
    },
  });
  expect(response.status).toBe(200);
  const pending = (await response.json()) as { document: { id: string } };
  await database
    .update(document)
    .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1_000) })
    .where(eq(document.id, pending.document.id));

  await database.execute(sql`
    CREATE OR REPLACE FUNCTION test_slow_stale_upload_delete() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_sleep(0.2);
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.execute(sql`DROP TRIGGER IF EXISTS test_slow_stale_upload_delete ON document`);
  await database.execute(sql`
    CREATE TRIGGER test_slow_stale_upload_delete
    BEFORE DELETE ON document
    FOR EACH ROW
    EXECUTE FUNCTION test_slow_stale_upload_delete()
  `);
  let sweepReports;
  try {
    sweepReports = await Promise.all([sweepUnconfirmedUploads(), sweepUnconfirmedUploads()]);
  } finally {
    await database.execute(sql`DROP TRIGGER test_slow_stale_upload_delete ON document`);
    await database.execute(sql`DROP FUNCTION test_slow_stale_upload_delete()`);
  }
  expect(sweepReports.flatMap((report) => report.removedDocumentIds)).toEqual([
    pending.document.id,
  ]);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      documentCount: 3,
      uploadedDocumentCount: 2,
      pendingUploadCount: 0,
      reservedUploadBytes: 0,
      uploadKeyLifetimeCount: 1,
      documentLifetimeCount: 1,
    }),
  ]);
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ pendingUploadCount: 0 }),
  ]);
});

test("Demo Document quotas are enforced over HTTP under concurrency", async () => {
  const demo = await enterFixtureDemo();
  await database
    .update(deploymentPolicy)
    .set({ documentCount: 5, documentLifetimeCount: 5 })
    .where(eq(deploymentPolicy.id, "deployment"));

  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      callServerFunction(demo.http, {
        modulePath: documentsModulePath,
        exportName: "createDocument",
        method: "POST",
        data: {
          documentId: randomUUID(),
          title: `Quota Document ${index}`,
        },
      }),
    ),
  );

  expect(responses.filter((response) => response.status === 200)).toHaveLength(2);
  expect(responses.filter((response) => response.status === 429)).toHaveLength(6);
  await expect(
    responses
      .find((response) => response.status === 429)!
      .clone()
      .json(),
  ).resolves.toEqual(
    expect.objectContaining({
      code: "DEMO_QUOTA_EXCEEDED",
      usage: 5,
      limitValue: 5,
    }),
  );
  const created = await Promise.all(
    responses
      .filter((response) => response.status === 200)
      .map((response) => response.json() as Promise<{ id: string }>),
  );
  let disposableId = created[0]!.id;
  for (let index = 0; index < 3; index += 1) {
    const deleted = await callServerFunction(demo.http, {
      modulePath: documentsModulePath,
      exportName: "deleteDocument",
      method: "POST",
      data: { documentId: disposableId },
    });
    expect(deleted.status).toBe(200);

    const replacement = await callServerFunction(demo.http, {
      modulePath: documentsModulePath,
      exportName: "createDocument",
      method: "POST",
      data: { documentId: randomUUID(), title: `Lifetime Document ${index}` },
    });
    expect(replacement.status).toBe(200);
    disposableId = ((await replacement.json()) as { id: string }).id;
  }
  const lifetimeRefusal = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "createDocument",
    method: "POST",
    data: { documentId: randomUUID(), title: "One Document too many" },
  });
  expect(lifetimeRefusal.status).toBe(429);
  await expect(
    database
      .select()
      .from(document)
      .where(eq(document.organizationId, demo.environment.organizationId)),
  ).resolves.toHaveLength(5);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      documentCount: 5,
      documentLifetimeCount: 5,
      refusalCount: 7,
    }),
  ]);
});

test("Demo Vault and Link simultaneous and lifetime quotas cannot be bypassed by deletion", async () => {
  const demo = await enterFixtureDemo();
  const [target] = await database
    .select({ id: document.id })
    .from(document)
    .where(eq(document.organizationId, demo.environment.organizationId))
    .limit(1);
  if (!target) throw new Error("Demo Sample Document is unavailable");
  await database
    .update(deploymentPolicy)
    .set({ vaultCount: 2, vaultLifetimeCount: 2, linkCount: 3, linkLifetimeCount: 3 })
    .where(eq(deploymentPolicy.id, "deployment"));

  const vaultResponses = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      callServerFunction(demo.http, {
        modulePath: vaultsModulePath,
        exportName: "createVault",
        method: "POST",
        data: { vaultId: randomUUID(), name: `Quota Vault ${index}` },
      }),
    ),
  );
  const linkResponses = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      callServerFunction(demo.http, {
        modulePath: linksModulePath,
        exportName: "createLink",
        method: "POST",
        data: {
          linkId: randomUUID(),
          documentId: target.id,
          name: `Quota Link ${index}`,
          requiresEmail: false,
          requiresVerification: false,
          allowDownload: false,
          expiresAt: null,
        },
      }),
    ),
  );

  expect(vaultResponses.filter((response) => response.status === 200)).toHaveLength(1);
  expect(linkResponses.filter((response) => response.status === 200)).toHaveLength(2);
  const createdVault = (await vaultResponses
    .find((response) => response.status === 200)!
    .json()) as {
    id: string;
  };
  const createdLink = (await linkResponses.find((response) => response.status === 200)!.json()) as {
    id: string;
  };

  expect(
    (
      await callServerFunction(demo.http, {
        modulePath: vaultsModulePath,
        exportName: "deleteVault",
        method: "POST",
        data: { vaultId: createdVault.id },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callServerFunction(demo.http, {
        modulePath: vaultsModulePath,
        exportName: "createVault",
        method: "POST",
        data: { vaultId: randomUUID(), name: "Last lifetime Vault" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callServerFunction(demo.http, {
        modulePath: linksModulePath,
        exportName: "deleteLink",
        method: "POST",
        data: { linkId: createdLink.id },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callServerFunction(demo.http, {
        modulePath: linksModulePath,
        exportName: "createLink",
        method: "POST",
        data: {
          linkId: randomUUID(),
          documentId: target.id,
          requiresEmail: false,
          requiresVerification: false,
          allowDownload: false,
          expiresAt: null,
        },
      })
    ).status,
  ).toBe(200);

  const [vaultLifetimeRefusal, linkLifetimeRefusal] = await Promise.all([
    callServerFunction(demo.http, {
      modulePath: vaultsModulePath,
      exportName: "createVault",
      method: "POST",
      data: { vaultId: randomUUID(), name: "Excess lifetime Vault" },
    }),
    callServerFunction(demo.http, {
      modulePath: linksModulePath,
      exportName: "createLink",
      method: "POST",
      data: {
        linkId: randomUUID(),
        documentId: target.id,
        requiresEmail: false,
        requiresVerification: false,
        allowDownload: false,
        expiresAt: null,
      },
    }),
  ]);
  expect(vaultLifetimeRefusal.status).toBe(429);
  expect(linkLifetimeRefusal.status).toBe(429);
  await expect(
    database.select().from(vault).where(eq(vault.organizationId, demo.environment.organizationId)),
  ).resolves.toHaveLength(2);
  await expect(
    database.select().from(link).where(eq(link.organizationId, demo.environment.organizationId)),
  ).resolves.toHaveLength(3);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      refusalCounts: expect.objectContaining({ vaultCount: 5, linkCount: 5 }),
    }),
  ]);
});

test("Demo identity expansion and email-dependent Link gates are refused consistently", async () => {
  const demo = await enterFixtureDemo();
  const [target] = await database
    .select({ id: document.id })
    .from(document)
    .where(eq(document.organizationId, demo.environment.organizationId))
    .limit(1);
  if (!target) throw new Error("Demo Sample Document is unavailable");

  const organizationResponse = await demo.http(
    new URL("/api/auth/organization/create", process.env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
      body: JSON.stringify({ name: "Another Organization", slug: `another-${randomUUID()}` }),
    },
  );
  const linkResponse = await callServerFunction(demo.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId: randomUUID(),
      documentId: target.id,
      requiresEmail: true,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });

  expect(organizationResponse.status).toBe(403);
  expect(await organizationResponse.json()).toEqual({
    code: "DEMO_FEATURE_DISABLED",
    message: "Disabled in demo",
  });
  expect(linkResponse.status).toBe(403);
  expect(await linkResponse.json()).toMatchObject({
    code: "DEMO_FEATURE_DISABLED",
    message: "Disabled in demo",
  });
  await expect(
    database.select().from(link).where(eq(link.organizationId, demo.environment.organizationId)),
  ).resolves.toHaveLength(1);
});

test("Pause all Demo access refuses authenticated Dashboard boundaries", async () => {
  const demo = await enterFixtureDemo();
  await database
    .update(deploymentPolicy)
    .set({ pauseAllDemoAccess: true })
    .where(eq(deploymentPolicy.id, "deployment"));

  const response = await callServerFunction(demo.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/");
});

test("Demo Upload reservations are atomic and Upload key lifetime survives deletion", async () => {
  const demo = await enterFixtureDemo();
  const declaredByteSize = 100;
  await database
    .update(deploymentPolicy)
    .set({
      documentCount: 4,
      uploadedDocumentCount: 3,
      pendingUploadCount: 1,
      documentLifetimeCount: 5,
      uploadKeyLifetimeCount: 2,
      uploadBytes: declaredByteSize,
    })
    .where(eq(deploymentPolicy.id, "deployment"));

  const uploadResponses = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      callServerFunction(demo.http, {
        modulePath: documentsModulePath,
        exportName: "createUpload",
        method: "POST",
        data: {
          documentId: randomUUID(),
          fileName: `quota-${index}.pdf`,
          contentType: "application/pdf",
          byteSize: declaredByteSize,
        },
      }),
    ),
  );
  expect(uploadResponses.filter((response) => response.status === 200)).toHaveLength(1);
  expect(uploadResponses.filter((response) => response.status === 429)).toHaveLength(5);
  let pending = (await uploadResponses.find((response) => response.status === 200)!.json()) as {
    document: { id: string };
  };

  for (let index = 0; index < 2; index += 1) {
    expect(
      (
        await callServerFunction(demo.http, {
          modulePath: documentsModulePath,
          exportName: "deleteDocument",
          method: "POST",
          data: { documentId: pending.document.id },
        })
      ).status,
    ).toBe(200);
    const replacement = await callServerFunction(demo.http, {
      modulePath: documentsModulePath,
      exportName: "createUpload",
      method: "POST",
      data: {
        documentId: randomUUID(),
        fileName: `replacement-${index}.pdf`,
        contentType: "application/pdf",
        byteSize: declaredByteSize,
      },
    });
    if (index === 0) {
      expect(replacement.status).toBe(200);
      pending = (await replacement.json()) as typeof pending;
    } else {
      expect(replacement.status).toBe(429);
    }
  }

  await expect(database.select().from(documentUpload)).resolves.toEqual([]);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      documentCount: 3,
      uploadedDocumentCount: 2,
      pendingUploadCount: 0,
      uploadKeyLifetimeCount: 2,
      documentLifetimeCount: 2,
      reservedUploadBytes: 0,
    }),
  ]);
  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ pendingUploadCount: 0, confirmationCount: 0 }),
  ]);
});

test("Demo Confirmations respect the fleet concurrency limit and reconcile trusted bytes", async () => {
  const first = await enterFixtureDemo("198.51.100.109");
  const second = await enterAdditionalFixtureDemo("198.51.100.110");
  const bytes = readUploadSample("one-page.pdf");
  await database
    .update(deploymentPolicy)
    .set({ globalConfirmationCount: 1 })
    .where(eq(deploymentPolicy.id, "deployment"));

  async function stage(demo: typeof first, index: number) {
    const response = await callServerFunction(demo.http, {
      modulePath: documentsModulePath,
      exportName: "createUpload",
      method: "POST",
      data: {
        documentId: randomUUID(),
        fileName: `confirmation-${index}.pdf`,
        contentType: "application/pdf",
        byteSize: bytes.byteLength,
      },
    });
    expect(response.status).toBe(200);
    const staged = (await response.json()) as {
      document: { id: string };
      uploadUrl: string;
    };
    expect((await fetch(staged.uploadUrl, { method: "PUT", body: bytes })).ok).toBe(true);
    return staged;
  }
  const [firstUpload, secondUpload] = await Promise.all([stage(first, 1), stage(second, 2)]);

  await database.execute(sql`
    CREATE FUNCTION test_slow_demo_confirmation() RETURNS trigger AS $$
    BEGIN
      IF OLD.status = 'pending' AND NEW.status = 'ready' THEN
        PERFORM pg_sleep(0.25);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.execute(sql`
    CREATE TRIGGER test_slow_demo_confirmation
    BEFORE UPDATE ON document
    FOR EACH ROW EXECUTE FUNCTION test_slow_demo_confirmation()
  `);
  try {
    const responses = await Promise.all(
      [
        [first, firstUpload],
        [second, secondUpload],
      ].map(([demo, upload]) =>
        callServerFunction((demo as typeof first).http, {
          modulePath: documentsModulePath,
          exportName: "confirmUpload",
          method: "POST",
          data: {
            documentId: (upload as typeof firstUpload).document.id,
            contentType: "application/pdf",
          },
        }),
      ),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
  } finally {
    await database.execute(sql`DROP TRIGGER test_slow_demo_confirmation ON document`);
    await database.execute(sql`DROP FUNCTION test_slow_demo_confirmation()`);
  }

  await expect(database.select().from(demoGlobalUsage)).resolves.toEqual([
    expect.objectContaining({ confirmationCount: 0, pendingUploadCount: 1 }),
  ]);
  const environments = await database.select().from(demoEnvironment);
  expect(environments.filter((environment) => environment.confirmationCount === 0)).toHaveLength(2);
  expect(environments.filter((environment) => environment.pendingUploadCount === 0)).toHaveLength(
    1,
  );
  expect(
    environments.filter(
      (environment) => environment.confirmedBytes > first.environment.confirmedBytes,
    ),
  ).toHaveLength(1);
});

test("public Demo Viewer content is temporary, noindexed, reportable, and paused safely", async () => {
  const demo = await enterFixtureDemo();
  const [publicLink] = await database
    .select({ slug: link.slug, targetName: link.name })
    .from(link)
    .where(eq(link.organizationId, demo.environment.organizationId))
    .limit(1);
  if (!publicLink) throw new Error("Demo Sample Link is unavailable");
  const viewerUrl = new URL(`/v/${publicLink.slug}`, process.env.BETTER_AUTH_URL);
  const reportUrl = new URL(`/api/demo/reports/${publicLink.slug}`, process.env.BETTER_AUTH_URL);
  const visitor = createCookieClient();

  const page = await visitor.http(viewerUrl);
  const markup = await page.text();
  expect(page.status).toBe(200);
  expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  expect(markup).toContain("Temporary demo content");
  expect(markup).toContain("Deleted at");

  const freeText = await fetch(reportUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.BETTER_AUTH_URL!,
      "x-forwarded-for": "198.51.100.120",
    },
    body: JSON.stringify({ category: "spam_or_phishing", details: "Requests credentials" }),
  });
  expect(freeText.status).toBe(422);

  const first = await fetch(reportUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.BETTER_AUTH_URL!,
      "x-forwarded-for": "198.51.100.121",
    },
    body: JSON.stringify({ category: "spam_or_phishing" }),
  });
  const duplicate = await fetch(reportUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.BETTER_AUTH_URL!,
      "x-forwarded-for": "198.51.100.121",
    },
    body: JSON.stringify({ category: "spam_or_phishing" }),
  });
  const [second, third] = await Promise.all(
    ["198.51.100.122", "198.51.100.123"].map((ip) =>
      fetch(reportUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: process.env.BETTER_AUTH_URL!,
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ category: "harmful_or_illegal_content" }),
      }),
    ),
  );
  expect(first.status).toBe(201);
  expect(duplicate.status).toBe(409);
  expect(second.status).toBe(201);
  expect(third.status).toBe(201);

  const paused = await createCookieClient().http(viewerUrl);
  const pausedMarkup = await paused.text();
  expect(paused.status).toBe(503);
  expect(pausedMarkup).toContain("temporarily unavailable");
  expect(pausedMarkup).not.toContain(publicLink.targetName ?? "Product tour");
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([expect.objectContaining({ state: "report_paused", reportCount: 3 })]);

  const expiredAt = new Date(Date.now() - 1);
  await database.update(demoReport).set({ expiresAt: expiredAt });
  const swept = await sweepExpiredDemoReports();
  expect(swept.removedReportIds).toHaveLength(3);
  await expect(database.select().from(demoReport)).resolves.toEqual([]);
});

test("Demo Viewer distinguishes terminating content after Links are disabled", async () => {
  const demo = await enterFixtureDemo();
  const [publicLink] = await database
    .select({ slug: link.slug, id: link.id })
    .from(link)
    .where(eq(link.organizationId, demo.environment.organizationId))
    .limit(1);
  if (!publicLink) throw new Error("Demo Sample Link is unavailable");

  await database
    .update(demoEnvironment)
    .set({ state: "terminating" })
    .where(eq(demoEnvironment.id, demo.environment.id));
  await database.update(link).set({ isActive: false }).where(eq(link.id, publicLink.id));
  const terminating = await createCookieClient().http(
    new URL(`/v/${publicLink.slug}`, process.env.BETTER_AUTH_URL),
  );
  expect(terminating.status).toBe(503);
  expect(await terminating.text()).toContain("being removed");
});

test("Demo egress is charged before Viewer or Preview bytes stream", async () => {
  const demo = await enterFixtureDemo();
  const [publicLink] = await database
    .select({ slug: link.slug })
    .from(link)
    .where(eq(link.organizationId, demo.environment.organizationId))
    .limit(1);
  const [pdf] = await database
    .select({ id: document.id, byteSize: document.byteSize })
    .from(document)
    .where(eq(document.organizationId, demo.environment.organizationId))
    .limit(3)
    .then((rows) => rows.filter((row) => row.byteSize !== null));
  if (!publicLink || !pdf?.byteSize) throw new Error("Demo Sample PDF is unavailable");
  const rangeBytes = Math.min(10, pdf.byteSize);
  await database
    .update(deploymentPolicy)
    .set({ deliveredBytes: rangeBytes })
    .where(eq(deploymentPolicy.id, "deployment"));

  const visitor = createCookieClient();
  expect(
    (await visitor.http(new URL(`/v/${publicLink.slug}`, process.env.BETTER_AUTH_URL))).status,
  ).toBe(200);
  const bytesUrl = new URL(`/v/${publicLink.slug}/bytes/${pdf.id}`, process.env.BETTER_AUTH_URL);
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      visitor.http(bytesUrl, { headers: { range: `bytes=0-${rangeBytes - 1}` } }),
    ),
  );
  expect(responses.filter((response) => response.status === 206)).toHaveLength(1);
  const refusals = responses.filter((response) => response.status === 429);
  expect(refusals).toHaveLength(5);
  for (const refusal of refusals) {
    expect((await refusal.arrayBuffer()).byteLength).toBe(0);
  }

  const preview = await demo.http(
    new URL(`/api/documents/${pdf.id}/bytes`, process.env.BETTER_AUTH_URL),
  );
  expect(preview.status).toBe(429);
  expect((await preview.arrayBuffer()).byteLength).toBe(0);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([expect.objectContaining({ deliveredBytes: rangeBytes })]);
});

test("Demo Visit and Event caps preserve content and mark analytics incomplete", async () => {
  const demo = await enterFixtureDemo();
  const [publicLink] = await database
    .select({ slug: link.slug })
    .from(link)
    .where(eq(link.organizationId, demo.environment.organizationId))
    .limit(1);
  const members = await database
    .select({ id: document.id })
    .from(document)
    .where(eq(document.organizationId, demo.environment.organizationId))
    .limit(2);
  if (!publicLink || members.length < 2) throw new Error("Demo Samples are unavailable");
  await database.delete(visit);
  await database
    .update(demoEnvironment)
    .set({
      visitLifetimeCount: 0,
      eventLifetimeCount: 0,
      downloadLifetimeCount: 0,
      analyticsIncomplete: false,
    })
    .where(eq(demoEnvironment.id, demo.environment.id));
  await database
    .update(deploymentPolicy)
    .set({ visitLifetimeCount: 1, eventLifetimeCount: 1 })
    .where(eq(deploymentPolicy.id, "deployment"));

  const firstVisitor = createCookieClient();
  expect(
    (await firstVisitor.http(new URL(`/v/${publicLink.slug}`, process.env.BETTER_AUTH_URL))).status,
  ).toBe(200);
  expect(
    (
      await firstVisitor.http(
        new URL(`/v/${publicLink.slug}/${members[0]!.id}`, process.env.BETTER_AUTH_URL),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await firstVisitor.http(
        new URL(`/v/${publicLink.slug}/${members[1]!.id}`, process.env.BETTER_AUTH_URL),
      )
    ).status,
  ).toBe(200);

  const unmeteredVisitor = createCookieClient();
  const unmetered = await unmeteredVisitor.http(
    new URL(`/v/${publicLink.slug}`, process.env.BETTER_AUTH_URL),
  );
  expect(unmetered.status).toBe(200);
  expect(await database.select().from(visit)).toHaveLength(1);
  expect(await database.select().from(visitEvent)).toHaveLength(1);
  await expect(
    database.select().from(demoEnvironment).where(eq(demoEnvironment.id, demo.environment.id)),
  ).resolves.toEqual([
    expect.objectContaining({
      visitLifetimeCount: 1,
      eventLifetimeCount: 1,
      analyticsIncomplete: true,
    }),
  ]);

  const analytics = await callServerFunction(demo.http, {
    modulePath: "/src/server/functions/analytics.ts",
    exportName: "getAnalytics",
    method: "GET",
    data: {},
  });
  expect(analytics.status).toBe(200);
  expect(await analytics.json()).toMatchObject({ analyticsIncomplete: true });
});
