import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { link as linkTable, visit as visitTable } from "#/server/db/schema";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixturePendingDocument,
  createFixtureVault,
  createOrganizationFixture,
  database,
} from "../fixtures";

const linksModulePath = "/src/server/functions/links.ts";

const bitcoinBase58Slug = /^[1-9A-HJ-NP-Za-km-z]{12}$/;

const writeCalls = [
  {
    exportName: "createLink",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30101",
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101",
      name: "Launch",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  },
  {
    exportName: "updateLink",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30102",
      name: "Launch",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
      isActive: true,
    },
  },
  {
    exportName: "rotateLinkSlug",
    data: { linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30103" },
  },
  {
    exportName: "deleteLink",
    data: { linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30104" },
  },
] as const;

async function listedLink(http: typeof fetch, linkId: string) {
  const listResponse = await callServerFunction(http, {
    modulePath: linksModulePath,
    exportName: "listLinks",
    method: "GET",
  });
  expect(listResponse.ok).toBe(true);
  const rows = (await listResponse.json()) as Array<Record<string, unknown>>;
  return rows.find((row) => row.id === linkId);
}

test("a User creates a Link against a Document with a client-minted id", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const linkId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af30111";

  const createResponse = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId,
      documentId: document.id,
      name: "Launch notes",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });

  expect(createResponse.ok).toBe(true);
  const created = (await createResponse.json()) as Record<string, unknown>;
  expect(created).toMatchObject({
    id: linkId,
    organizationId: fixture.organization.id,
    documentId: document.id,
    vaultId: null,
    name: "Launch notes",
    requiresEmail: false,
    requiresVerification: false,
    gateVersion: 1,
    allowDownload: false,
    expiresAt: null,
    isActive: true,
    passwordSet: false,
    createdBy: fixture.member.user.id,
  });
  expect(created).not.toHaveProperty("passwordHash");
  expect(created.slug).toMatch(bitcoinBase58Slug);

  expect(await listedLink(fixture.member.http, linkId)).toMatchObject({
    slug: created.slug,
    passwordSet: false,
  });
});

test("a User creates a Link against a Vault", async () => {
  const fixture = await createOrganizationFixture();
  const vault = await createFixtureVault({ organizationId: fixture.organization.id });
  const linkId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af30112";

  const createResponse = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId,
      vaultId: vault.id,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });

  expect(createResponse.ok).toBe(true);
  expect(await createResponse.json()).toMatchObject({
    id: linkId,
    vaultId: vault.id,
    documentId: null,
    passwordSet: false,
  });
});

test("the four presets and password-plus-email are writable and verification without email is refused", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const presets = [
    {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30201",
      requiresEmail: false,
      requiresVerification: false,
    },
    {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30202",
      password: "launch-gate",
      requiresEmail: false,
      requiresVerification: false,
    },
    {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30203",
      requiresEmail: true,
      requiresVerification: false,
    },
    {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30204",
      requiresEmail: true,
      requiresVerification: true,
    },
    {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30205",
      password: "launch-gate",
      requiresEmail: true,
      requiresVerification: false,
    },
  ] as const;

  for (const preset of presets) {
    const response = await callServerFunction(fixture.member.http, {
      modulePath: linksModulePath,
      exportName: "createLink",
      method: "POST",
      data: {
        documentId: document.id,
        allowDownload: false,
        expiresAt: null,
        ...preset,
      },
    });
    expect(response.ok, preset.linkId).toBe(true);
  }

  const refused = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30206",
      documentId: document.id,
      requiresEmail: false,
      requiresVerification: true,
      allowDownload: false,
      expiresAt: null,
    },
  });

  expect(refused.status).toBe(422);
  expect(await refused.json()).toMatchObject({ code: "INVALID_GATE", name: "InvalidGateError" });
});

test("a weak share password is refused and a strong one is hashed, never returned", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const refusals = [
    { password: "short", reason: "too_short" },
    { password: fixture.organization.name, reason: "organization_name" },
    { password: "password", reason: "denied" },
  ] as const;

  for (const [index, refusal] of refusals.entries()) {
    const response = await callServerFunction(fixture.member.http, {
      modulePath: linksModulePath,
      exportName: "createLink",
      method: "POST",
      data: {
        linkId: `0198b8f1-6ae4-7c39-9c3d-3cfd7af3030${index + 1}`,
        documentId: document.id,
        password: refusal.password,
        requiresEmail: false,
        requiresVerification: false,
        allowDownload: false,
        expiresAt: null,
      },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "SHARE_PASSWORD",
      reason: refusal.reason,
    });
  }

  const linkId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af30309";
  const createdResponse = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId,
      documentId: document.id,
      password: "launch-gate",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });
  const created = (await createdResponse.json()) as Record<string, unknown>;

  expect(createdResponse.ok).toBe(true);
  expect(created).toMatchObject({ passwordSet: true });
  expect(created).not.toHaveProperty("passwordHash");

  const [stored] = await database
    .select({ passwordHash: linkTable.passwordHash })
    .from(linkTable)
    .where(eq(linkTable.id, linkId));

  expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
});

test("replacing or clearing a password or flipping a Requirement bumps gate_version; options do not", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const linkId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af30401";

  await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId,
      documentId: document.id,
      name: "Launch",
      password: "launch-gate",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });

  const optionEdits = [
    { name: "Launch notes", allowDownload: false, expiresAt: null, isActive: true },
    { name: "Launch notes", allowDownload: true, expiresAt: null, isActive: true },
    {
      name: "Launch notes",
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: true,
    },
    {
      name: "Launch notes",
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: false,
    },
  ] as const;

  for (const edit of optionEdits) {
    const response = await callServerFunction(fixture.member.http, {
      modulePath: linksModulePath,
      exportName: "updateLink",
      method: "POST",
      data: {
        linkId,
        requiresEmail: false,
        requiresVerification: false,
        ...edit,
      },
    });
    expect(response.ok).toBe(true);
    expect(await response.json()).toMatchObject({ gateVersion: 1, passwordSet: true });
  }

  const replacePassword = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId,
      name: "Launch notes",
      password: "launch-gate-2",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: false,
    },
  });
  expect(await replacePassword.json()).toMatchObject({ gateVersion: 2, passwordSet: true });

  const requireEmail = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId,
      name: "Launch notes",
      requiresEmail: true,
      requiresVerification: false,
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: false,
    },
  });
  expect(await requireEmail.json()).toMatchObject({ gateVersion: 3, passwordSet: true });

  const requireVerification = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId,
      name: "Launch notes",
      requiresEmail: true,
      requiresVerification: true,
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: false,
    },
  });
  expect(await requireVerification.json()).toMatchObject({ gateVersion: 4, passwordSet: true });

  const clearPassword = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId,
      name: "Launch notes",
      password: null,
      requiresEmail: true,
      requiresVerification: true,
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: false,
    },
  });
  expect(await clearPassword.json()).toMatchObject({ gateVersion: 5, passwordSet: false });

  const clearAgain = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId,
      name: "Launch notes",
      password: null,
      requiresEmail: true,
      requiresVerification: true,
      allowDownload: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      isActive: false,
    },
  });
  expect(await clearAgain.json()).toMatchObject({ gateVersion: 5, passwordSet: false });
});

test("a User can deactivate, reactivate, rotate the Slug, and delete a Link with its Visits", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const createdLink = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: document.id,
    slug: "oldslugvalue",
  });
  await database.insert(visitTable).values({
    linkId: createdLink.id,
    visitorId: "visitor-1",
    gateVersion: 1,
    startedAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  const deactivated = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: createdLink.id,
      name: createdLink.name,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
      isActive: false,
    },
  });
  expect(await deactivated.json()).toMatchObject({
    isActive: false,
    slug: "oldslugvalue",
    gateVersion: 1,
  });

  const reactivated = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: createdLink.id,
      name: createdLink.name,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
      isActive: true,
    },
  });
  expect(await reactivated.json()).toMatchObject({ isActive: true, gateVersion: 1 });

  const rotated = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "rotateLinkSlug",
    method: "POST",
    data: { linkId: createdLink.id },
  });
  const rotatedBody = (await rotated.json()) as { slug: string; gateVersion: number };
  expect(rotated.ok).toBe(true);
  expect(rotatedBody.slug).toMatch(bitcoinBase58Slug);
  expect(rotatedBody.slug).not.toBe("oldslugvalue");
  expect(rotatedBody.gateVersion).toBe(1);

  const reused = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: document.id,
    slug: "oldslugvalue",
  });
  expect(reused.slug).toBe("oldslugvalue");

  const deleted = await callServerFunction(fixture.member.http, {
    modulePath: linksModulePath,
    exportName: "deleteLink",
    method: "POST",
    data: { linkId: createdLink.id },
  });
  expect(deleted.ok).toBe(true);
  expect(await listedLink(fixture.member.http, createdLink.id)).toBeUndefined();

  const visits = await database
    .select()
    .from(visitTable)
    .where(eq(visitTable.linkId, createdLink.id));
  expect(visits).toEqual([]);
});

test("creating against a pending Document is refused; a foreign Target is not found", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const pending = await createFixturePendingDocument({
    organizationId: first.organization.id,
    createdBy: first.member.user.id,
  });
  const foreignDocument = await createFixtureDocument({
    organizationId: second.organization.id,
    createdBy: second.member.user.id,
  });
  const foreignVault = await createFixtureVault({ organizationId: second.organization.id });

  const pendingResponse = await callServerFunction(first.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30601",
      documentId: pending.id,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });
  expect(pendingResponse.status).toBe(422);
  expect(await pendingResponse.json()).toMatchObject({ code: "PENDING_TARGET" });

  const foreignDocumentResponse = await callServerFunction(first.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30602",
      documentId: foreignDocument.id,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });
  expect(foreignDocumentResponse.status).toBe(404);

  const foreignVaultResponse = await callServerFunction(first.member.http, {
    modulePath: linksModulePath,
    exportName: "createLink",
    method: "POST",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30603",
      vaultId: foreignVault.id,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
    },
  });
  expect(foreignVaultResponse.status).toBe(404);

  const foreignUpdate = await callServerFunction(first.member.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af30699",
      name: "Hijack",
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
      isActive: true,
    },
  });
  expect(foreignUpdate.status).toBe(404);
});

test.each(writeCalls)("$exportName redirects to sign in without a session", async (writeCall) => {
  const client = createCookieClient();

  const response = await callServerFunction(client.http, {
    modulePath: linksModulePath,
    exportName: writeCall.exportName,
    method: "POST",
    data: writeCall.data,
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
});
