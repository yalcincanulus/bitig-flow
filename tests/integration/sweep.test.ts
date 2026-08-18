import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { expect, test } from "vitest";

import { storageKeyForDocument } from "#/lib/upload";
import { document } from "#/server/db/schema";
import { sweepOrphanedObjects, sweepUnconfirmedUploads } from "#/server/sweep";

import {
  createFixturePendingDocument,
  createFixtureUploadedDocument,
  createOrganizationFixture,
  database,
  fixtureObjectExists,
  readUploadSample,
} from "../fixtures";
import { putFixtureObject } from "../fixtures/storage";

const execFileAsync = promisify(execFile);
const pixelPng = readUploadSample("pixel.png");

async function agePendingDocument(documentId: string) {
  await database
    .update(document)
    .set({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(document.id, documentId));
}

test("a pending Document aged past 24 hours loses its object and then its row", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    kind: "image",
    fileName: "pixel.png",
    bytes: pixelPng,
    contentType: "image/png",
  });

  await agePendingDocument(pending.id);

  const report = await sweepUnconfirmedUploads();

  expect(report.removedDocumentIds).toEqual([pending.id]);
  expect(await fixtureObjectExists(pending.storageKey!)).toBe(false);
  expect(await database.select().from(document).where(eq(document.id, pending.id))).toEqual([]);
});

test("a recently created pending Document is untouched", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    kind: "image",
    fileName: "pixel.png",
    bytes: pixelPng,
    contentType: "image/png",
  });

  const report = await sweepUnconfirmedUploads();

  expect(report.removedDocumentIds).toEqual([]);
  expect(await fixtureObjectExists(pending.storageKey!)).toBe(true);
  expect(await database.select().from(document).where(eq(document.id, pending.id))).toEqual([
    expect.objectContaining({ id: pending.id, status: "pending" }),
  ]);
});

test("an object with no matching Document row is removed", async () => {
  const fixture = await createOrganizationFixture();
  const storageKey = storageKeyForDocument(fixture.organization.id, uuidv7());
  await putFixtureObject(storageKey, pixelPng, "image/png");

  const report = await sweepOrphanedObjects();

  expect(report.removedStorageKeys).toContain(storageKey);
  expect(await fixtureObjectExists(storageKey)).toBe(false);
});

test("an object with a matching Document row is not removed", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    contentType: "image/png",
    fileName: "pixel.png",
    bytes: pixelPng,
  });

  const report = await sweepOrphanedObjects();

  expect(report.removedStorageKeys).not.toContain(uploaded.storageKey);
  expect(await fixtureObjectExists(uploaded.storageKey!)).toBe(true);
});

test("running either pass twice changes nothing the second time", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    kind: "image",
    fileName: "pixel.png",
    bytes: pixelPng,
    contentType: "image/png",
  });
  await agePendingDocument(pending.id);

  const orphanKey = storageKeyForDocument(fixture.organization.id, uuidv7());
  await putFixtureObject(orphanKey, pixelPng, "image/png");

  await sweepUnconfirmedUploads();
  await sweepOrphanedObjects();

  expect(await sweepUnconfirmedUploads()).toEqual({ removedDocumentIds: [] });
  expect(await sweepOrphanedObjects()).toEqual({ removedStorageKeys: [] });
});

test("the entrypoint runs both passes and exits, and is reachable through a package script", async () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts.sweep).toContain("src/server/sweep-cli.ts");

  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "src/server/sweep-cli.ts"],
    {
      env: process.env,
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
    },
  );

  expect(result.stdout).toContain('"unconfirmed"');
  expect(result.stdout).toContain('"orphans"');
});
