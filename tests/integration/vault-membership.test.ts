import { expect, test } from "vitest";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
} from "../fixtures";

const vaultItemsModulePath = "/src/server/functions/vault-items.ts";
const documentsModulePath = "/src/server/functions/documents.ts";

const addedAt = "2026-08-17T12:00:00.000Z";

test("a User adds a Document to a Vault", async () => {
  const fixture = await createOrganizationFixture();
  const [vault, document] = await Promise.all([
    createFixtureVault({ organizationId: fixture.organization.id }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);

  const addResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "addVaultItem",
    method: "POST",
    data: {
      vaultId: vault.id,
      documentId: document.id,
      addedAt,
    },
  });

  expect(addResponse.ok).toBe(true);
  expect(await addResponse.json()).toEqual({
    vaultId: vault.id,
    documentId: document.id,
    isVisible: true,
    addedAt,
  });

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "listVaultItems",
    method: "GET",
  });

  expect(listResponse.ok).toBe(true);
  expect(await listResponse.json()).toEqual([
    { vaultId: vault.id, documentId: document.id, isVisible: true, addedAt },
  ]);
});

test("a User removes a Document from a Vault without deleting the Document", async () => {
  const fixture = await createOrganizationFixture();
  const [vault, document] = await Promise.all([
    createFixtureVault({ organizationId: fixture.organization.id }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);
  await createFixtureVaultItem({ vaultId: vault.id, documentId: document.id });

  const removeResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "removeVaultItem",
    method: "POST",
    data: {
      vaultId: vault.id,
      documentId: document.id,
    },
  });

  expect(removeResponse.ok).toBe(true);
  expect(await removeResponse.json()).toMatchObject({
    vaultId: vault.id,
    documentId: document.id,
  });

  const [membershipResponse, documentsResponse] = await Promise.all([
    callServerFunction(fixture.member.http, {
      modulePath: vaultItemsModulePath,
      exportName: "listVaultItems",
      method: "GET",
    }),
    callServerFunction(fixture.member.http, {
      modulePath: documentsModulePath,
      exportName: "listDocuments",
      method: "GET",
    }),
  ]);

  expect(await membershipResponse.json()).toEqual([]);
  expect(await documentsResponse.json()).toEqual([expect.objectContaining({ id: document.id })]);
});

test("adding a Document already in the Vault is a no-op", async () => {
  const fixture = await createOrganizationFixture();
  const [vault, document] = await Promise.all([
    createFixtureVault({ organizationId: fixture.organization.id }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);
  const firstAddedAt = "2026-08-17T12:00:00.000Z";
  const secondAddedAt = "2026-08-17T13:00:00.000Z";

  const firstResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "addVaultItem",
    method: "POST",
    data: { vaultId: vault.id, documentId: document.id, addedAt: firstAddedAt },
  });
  const secondResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "addVaultItem",
    method: "POST",
    data: { vaultId: vault.id, documentId: document.id, addedAt: secondAddedAt },
  });

  expect(firstResponse.ok).toBe(true);
  expect(secondResponse.ok).toBe(true);
  expect(await secondResponse.json()).toEqual(await firstResponse.json());

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "listVaultItems",
    method: "GET",
  });

  expect(await listResponse.json()).toEqual([
    { vaultId: vault.id, documentId: document.id, isVisible: true, addedAt: firstAddedAt },
  ]);
});

test("a User hides a Document in a Vault and shows it again", async () => {
  const fixture = await createOrganizationFixture();
  const [vault, document] = await Promise.all([
    createFixtureVault({ organizationId: fixture.organization.id }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);
  await createFixtureVaultItem({ vaultId: vault.id, documentId: document.id });

  const hideResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "setVaultItemVisibility",
    method: "POST",
    data: { vaultId: vault.id, documentId: document.id, isVisible: false },
  });

  expect(hideResponse.ok).toBe(true);
  expect(await hideResponse.json()).toMatchObject({
    vaultId: vault.id,
    documentId: document.id,
    isVisible: false,
  });

  const hiddenList = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "listVaultItems",
    method: "GET",
  });

  // Hiding withdraws the Document from Links, and never from the Vault.
  expect(await hiddenList.json()).toEqual([
    expect.objectContaining({ documentId: document.id, isVisible: false }),
  ]);

  const showResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultItemsModulePath,
    exportName: "setVaultItemVisibility",
    method: "POST",
    data: { vaultId: vault.id, documentId: document.id, isVisible: true },
  });

  expect(showResponse.ok).toBe(true);
  expect(await showResponse.json()).toMatchObject({ isVisible: true });
});

const writeCalls = [
  {
    exportName: "addVaultItem",
    data: {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10201",
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10202",
      addedAt,
    },
  },
  {
    exportName: "removeVaultItem",
    data: {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10201",
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10202",
    },
  },
  {
    exportName: "setVaultItemVisibility",
    data: {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10201",
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10202",
      isVisible: false,
    },
  },
] as const;

test.each(writeCalls)("$exportName redirects to sign in without a session", async (writeCall) => {
  const client = createCookieClient();

  const response = await callServerFunction(client.http, {
    modulePath: vaultItemsModulePath,
    exportName: writeCall.exportName,
    method: "POST",
    data: writeCall.data,
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
});

test.each(writeCalls)(
  "$exportName reports another Organization's Vault as not found",
  async (writeCall) => {
    const [firstOrganization, secondOrganization] = await Promise.all([
      createOrganizationFixture(),
      createOrganizationFixture(),
    ]);
    const [foreignVault, foreignDocument] = await Promise.all([
      createFixtureVault({ organizationId: secondOrganization.organization.id }),
      createFixtureDocument({
        organizationId: secondOrganization.organization.id,
        createdBy: secondOrganization.member.user.id,
      }),
    ]);
    await createFixtureVaultItem({ vaultId: foreignVault.id, documentId: foreignDocument.id });

    const response = await callServerFunction(firstOrganization.member.http, {
      modulePath: vaultItemsModulePath,
      exportName: writeCall.exportName,
      method: "POST",
      data: {
        ...writeCall.data,
        vaultId: foreignVault.id,
        documentId: foreignDocument.id,
      },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ isNotFound: true });
  },
);

test.each(writeCalls)(
  "$exportName refuses a Document from another Organization",
  async (writeCall) => {
    const [firstOrganization, secondOrganization] = await Promise.all([
      createOrganizationFixture(),
      createOrganizationFixture(),
    ]);
    const [localVault, foreignDocument] = await Promise.all([
      createFixtureVault({ organizationId: firstOrganization.organization.id }),
      createFixtureDocument({
        organizationId: secondOrganization.organization.id,
        createdBy: secondOrganization.member.user.id,
      }),
    ]);

    const response = await callServerFunction(firstOrganization.member.http, {
      modulePath: vaultItemsModulePath,
      exportName: writeCall.exportName,
      method: "POST",
      data: {
        ...writeCall.data,
        vaultId: localVault.id,
        documentId: foreignDocument.id,
      },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ isNotFound: true });
  },
);
