import { expect, test } from "vitest";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
} from "../fixtures";

const documentsModulePath = "/src/server/functions/documents.ts";
const vaultItemsModulePath = "/src/server/functions/vault-items.ts";
const linksModulePath = "/src/server/functions/links.ts";

const writeCalls = [
  {
    exportName: "createDocument",
    data: {
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20201",
      title: "Launch notes",
    },
  },
  {
    exportName: "deleteDocument",
    data: { documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20202" },
  },
  {
    exportName: "updateDocument",
    data: {
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20203",
      title: "Launch notes",
      content: "Hello",
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  },
] as const;

test("a User creates a markdown Document with a client-minted id", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101";

  const createResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "createDocument",
    method: "POST",
    data: {
      documentId,
      title: "Launch notes",
    },
  });

  expect(createResponse.ok).toBe(true);
  expect(await createResponse.json()).toMatchObject({
    id: documentId,
    organizationId: fixture.organization.id,
    title: "Launch notes",
    kind: "markdown",
    status: "ready",
    content: "",
    storageKey: null,
    createdBy: fixture.member.user.id,
  });

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });

  expect(listResponse.ok).toBe(true);
  expect(await listResponse.json()).toEqual([
    expect.objectContaining({ id: documentId, title: "Launch notes", content: "" }),
  ]);
});

test("an empty title becomes Untitled at the server", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20102";

  const createResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "createDocument",
    method: "POST",
    data: {
      documentId,
      title: "   ",
    },
  });

  expect(createResponse.ok).toBe(true);
  expect(await createResponse.json()).toMatchObject({
    id: documentId,
    title: "Untitled",
    kind: "markdown",
    status: "ready",
    content: "",
    storageKey: null,
  });
});

test("deleting a Document cascades its membership and Links", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const vault = await createFixtureVault({ organizationId: fixture.organization.id });
  await Promise.all([
    createFixtureVaultItem({ vaultId: vault.id, documentId: document.id }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: document.id,
    }),
  ]);

  const deleteResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "deleteDocument",
    method: "POST",
    data: { documentId: document.id },
  });

  expect(deleteResponse.ok).toBe(true);
  expect(await deleteResponse.json()).toMatchObject({ id: document.id });

  const [documentsResponse, vaultItemsResponse, linksResponse] = await Promise.all([
    callServerFunction(fixture.member.http, {
      modulePath: documentsModulePath,
      exportName: "listDocuments",
      method: "GET",
    }),
    callServerFunction(fixture.member.http, {
      modulePath: vaultItemsModulePath,
      exportName: "listVaultItems",
      method: "GET",
    }),
    callServerFunction(fixture.member.http, {
      modulePath: linksModulePath,
      exportName: "listLinks",
      method: "GET",
    }),
  ]);

  expect(await documentsResponse.json()).toEqual([]);
  expect(await vaultItemsResponse.json()).toEqual([]);
  expect(await linksResponse.json()).toEqual([]);
});

test.each(writeCalls)("$exportName redirects to sign in without a session", async (writeCall) => {
  const client = createCookieClient();

  const response = await callServerFunction(client.http, {
    modulePath: documentsModulePath,
    exportName: writeCall.exportName,
    method: "POST",
    data: writeCall.data,
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
});

test("updateDocument upserts a markdown Document the server has never seen", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20301";
  const updatedAt = "2026-08-17T12:00:00.000Z";

  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId,
      title: "Launch notes",
      content: "# Hello",
      updatedAt,
      organizationId: "00000000-0000-0000-0000-000000000000",
    },
  });

  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({
    id: documentId,
    organizationId: fixture.organization.id,
    title: "Launch notes",
    kind: "markdown",
    status: "ready",
    content: "# Hello",
    createdBy: fixture.member.user.id,
    updatedBy: fixture.member.user.id,
  });
});

test("calling updateDocument twice with the same payload changes nothing", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20302";
  const payload = {
    documentId,
    title: "Launch notes",
    content: "First draft",
    updatedAt: "2026-08-17T12:00:00.000Z",
  };

  const firstResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: payload,
  });
  const first = (await firstResponse.json()) as { updatedAt: string; content: string };

  const secondResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: payload,
  });
  const second = (await secondResponse.json()) as { updatedAt: string; content: string };

  expect(firstResponse.ok).toBe(true);
  expect(secondResponse.ok).toBe(true);
  expect(second.content).toBe("First draft");
  expect(second.updatedAt).toBe(first.updatedAt);
});

test("a stale updatedAt is a typed conflict that names the other person", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20303";
  const createResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "createDocument",
    method: "POST",
    data: { documentId, title: "Launch notes" },
  });
  const created = (await createResponse.json()) as { updatedAt: string };

  await callServerFunction(fixture.admin.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId,
      title: "Launch notes",
      content: "Admin draft",
      updatedAt: created.updatedAt,
    },
  });

  const conflictResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId,
      title: "Launch notes",
      content: "Member draft",
      updatedAt: created.updatedAt,
    },
  });

  expect(conflictResponse.status).toBe(409);
  expect(await conflictResponse.json()).toMatchObject({
    code: "DOCUMENT_CONFLICT",
    name: "DocumentConflictError",
    updatedByName: fixture.admin.user.name,
    title: "Launch notes",
    content: "Admin draft",
  });

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(await listResponse.json()).toEqual([
    expect.objectContaining({ id: documentId, content: "Admin draft" }),
  ]);
});

test("a body over 256 KB is refused by updateDocument", async () => {
  const fixture = await createOrganizationFixture();
  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20304",
      title: "Launch notes",
      content: "a".repeat(256 * 1024 + 1),
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  });

  expect(response.ok).toBe(false);
});

test("an empty title on updateDocument becomes Untitled", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20305";

  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId,
      title: "   ",
      content: "Hello",
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  });

  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({
    id: documentId,
    title: "Untitled",
    content: "Hello",
  });
});

test("updateDocument reports another Organization's Document as not found", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const foreignDocument = await createFixtureDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
    content: "Stay put",
  });

  const response = await callServerFunction(firstOrganization.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: foreignDocument.id,
      title: "Hijacked",
      content: "Should not land",
      updatedAt: foreignDocument.updatedAt.toISOString(),
    },
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ isNotFound: true });

  const foreignList = await callServerFunction(secondOrganization.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(await foreignList.json()).toEqual([
    expect.objectContaining({
      id: foreignDocument.id,
      title: foreignDocument.title,
      content: "Stay put",
    }),
  ]);
});

test("deleteDocument reports another Organization's Document as not found", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const foreignDocument = await createFixtureDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
  });

  const response = await callServerFunction(firstOrganization.member.http, {
    modulePath: documentsModulePath,
    exportName: "deleteDocument",
    method: "POST",
    data: { documentId: foreignDocument.id },
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ isNotFound: true });
});
