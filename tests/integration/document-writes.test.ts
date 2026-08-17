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
