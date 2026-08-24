import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { expect, test } from "vitest";

import { storageKeyForDocument, storageKeyPrefix, uploadKeyForOrganization } from "#/lib/upload";
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
const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));

async function agePendingDocument(documentId: string) {
  await database
    .update(document)
    .set({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(document.id, documentId));
}

async function createAgedPendingUpload() {
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
  return pending;
}

function packageScripts() {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    scripts: Record<string, string>;
  };
  return packageJson.scripts;
}

function nodeArgsForScript(script: string) {
  return script.split(/\s+/).filter((token) => token !== "node" && token !== "--env-file=.env");
}

test("a pending Document aged past 24 hours loses its staged object and then its row", async () => {
  const pending = await createAgedPendingUpload();

  const report = await sweepUnconfirmedUploads();

  expect(report.removedDocumentIds).toEqual([pending.id]);
  expect(report.removedUploadKeys).toEqual([pending.uploadKey]);
  expect(await fixtureObjectExists(pending.uploadKey)).toBe(false);
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

  expect(report).toEqual({ removedDocumentIds: [], removedUploadKeys: [] });
  expect(await fixtureObjectExists(pending.uploadKey)).toBe(true);
  expect(await database.select().from(document).where(eq(document.id, pending.id))).toEqual([
    expect.objectContaining({ id: pending.id, status: "pending" }),
  ]);
});

test("orphan Sweep does not remove a development Storage key", async () => {
  const fixture = await createOrganizationFixture();
  const developmentKey = `org/${fixture.organization.id}/doc/${uuidv7()}/original`;
  await putFixtureObject(developmentKey, pixelPng, "image/png");

  const report = await sweepOrphanedObjects();

  expect(report.removedStorageKeys).not.toContain(developmentKey);
  expect(await fixtureObjectExists(developmentKey)).toBe(true);
});

test("an object with no matching Document row is removed", async () => {
  const fixture = await createOrganizationFixture();
  const storageKey = storageKeyForDocument(fixture.organization.id, uuidv7(), storageKeyPrefix());
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

test("sweeping unconfirmed uploads twice changes nothing the second time", async () => {
  const pending = await createAgedPendingUpload();

  expect(await sweepUnconfirmedUploads()).toEqual({
    removedDocumentIds: [pending.id],
    removedUploadKeys: [pending.uploadKey],
  });
  expect(await sweepUnconfirmedUploads()).toEqual({
    removedDocumentIds: [],
    removedUploadKeys: [],
  });
});

test("sweeping orphaned objects twice changes nothing the second time", async () => {
  const fixture = await createOrganizationFixture();
  const orphanKey = storageKeyForDocument(fixture.organization.id, uuidv7(), storageKeyPrefix());
  await putFixtureObject(orphanKey, pixelPng, "image/png");

  const first = await sweepOrphanedObjects();
  expect(first.removedStorageKeys).toContain(orphanKey);
  expect(await sweepOrphanedObjects()).toEqual({
    removedStorageKeys: [],
    removedUploadKeys: [],
  });
});

test("an Upload key no upload attempt claims is removed", async () => {
  const fixture = await createOrganizationFixture();
  const abandonedKey = uploadKeyForOrganization(
    fixture.organization.id,
    randomUUID(),
    storageKeyPrefix(),
  );
  await putFixtureObject(abandonedKey, pixelPng, "image/png");

  const report = await sweepOrphanedObjects();

  expect(report.removedUploadKeys).toContain(abandonedKey);
  expect(await fixtureObjectExists(abandonedKey)).toBe(false);
});

test("an Upload key an in-flight upload still holds is left alone", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    kind: "image",
    fileName: "pixel.png",
    bytes: pixelPng,
    contentType: "image/png",
  });

  const report = await sweepOrphanedObjects();

  expect(report.removedUploadKeys).not.toContain(pending.uploadKey);
  expect(await fixtureObjectExists(pending.uploadKey)).toBe(true);
});

test("the entrypoint runs both passes and exits, and is reachable through a package script", async () => {
  const scripts = packageScripts();

  expect(scripts.sweep).toContain("src/server/sweep-cli.ts");
  expect(scripts["sweep:unconfirmed"]).toContain("--unconfirmed");
  expect(scripts["sweep:orphans"]).toContain("--orphans");

  const result = await execFileAsync(process.execPath, nodeArgsForScript(scripts.sweep!), {
    env: process.env,
    cwd: projectDirectory,
  });

  expect(result.stdout).toContain('"unconfirmed"');
  expect(result.stdout).toContain('"orphans"');
});
