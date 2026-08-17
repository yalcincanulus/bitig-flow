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

const vaultsModulePath = "/src/server/functions/vaults.ts";
const documentsModulePath = "/src/server/functions/documents.ts";
const vaultItemsModulePath = "/src/server/functions/vault-items.ts";
const linksModulePath = "/src/server/functions/links.ts";

const writeCalls = [
  {
    exportName: "createVault",
    data: {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10201",
      name: "Launch notes",
    },
  },
  {
    exportName: "updateVault",
    data: {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10202",
      name: "Launch archive",
      description: null,
    },
  },
  {
    exportName: "deleteVault",
    data: { vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10203" },
  },
] as const;

test("a User creates a Vault with a client-minted id", async () => {
  const fixture = await createOrganizationFixture();
  const vaultId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af10101";

  const createResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultsModulePath,
    exportName: "createVault",
    method: "POST",
    data: {
      vaultId,
      name: "Launch notes",
      description: "Documents for the launch",
    },
  });

  expect(createResponse.ok).toBe(true);
  expect(await createResponse.json()).toMatchObject({
    id: vaultId,
    organizationId: fixture.organization.id,
    name: "Launch notes",
    description: "Documents for the launch",
  });

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultsModulePath,
    exportName: "listVaults",
    method: "GET",
  });

  expect(listResponse.ok).toBe(true);
  expect(await listResponse.json()).toEqual([
    expect.objectContaining({ id: vaultId, name: "Launch notes" }),
  ]);
});

test("a User renames a Vault and edits its description", async () => {
  const fixture = await createOrganizationFixture();
  const vault = await createFixtureVault({
    organizationId: fixture.organization.id,
    name: "Launch notes",
    description: "First draft",
  });

  const updateResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultsModulePath,
    exportName: "updateVault",
    method: "POST",
    data: {
      vaultId: vault.id,
      name: "Launch archive",
      description: "Final material",
    },
  });

  expect(updateResponse.ok).toBe(true);
  expect(await updateResponse.json()).toMatchObject({
    id: vault.id,
    organizationId: fixture.organization.id,
    name: "Launch archive",
    description: "Final material",
  });
});

test("deleting a Vault cascades its membership and Links but leaves its Documents", async () => {
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
      vaultId: vault.id,
    }),
  ]);

  const deleteResponse = await callServerFunction(fixture.member.http, {
    modulePath: vaultsModulePath,
    exportName: "deleteVault",
    method: "POST",
    data: { vaultId: vault.id },
  });

  expect(deleteResponse.ok).toBe(true);
  expect(await deleteResponse.json()).toMatchObject({ id: vault.id });

  const [vaultsResponse, vaultItemsResponse, linksResponse, documentsResponse] = await Promise.all([
    callServerFunction(fixture.member.http, {
      modulePath: vaultsModulePath,
      exportName: "listVaults",
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
    callServerFunction(fixture.member.http, {
      modulePath: documentsModulePath,
      exportName: "listDocuments",
      method: "GET",
    }),
  ]);

  expect(await vaultsResponse.json()).toEqual([]);
  expect(await vaultItemsResponse.json()).toEqual([]);
  expect(await linksResponse.json()).toEqual([]);
  expect(await documentsResponse.json()).toEqual([expect.objectContaining({ id: document.id })]);
});

test.each(writeCalls)("$exportName redirects to sign in without a session", async (writeCall) => {
  const client = createCookieClient();

  const response = await callServerFunction(client.http, {
    modulePath: vaultsModulePath,
    exportName: writeCall.exportName,
    method: "POST",
    data: writeCall.data,
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
});

test.each([
  {
    exportName: "updateVault",
    data: (vaultId: string) => ({
      vaultId,
      name: "Cross-organization edit",
      description: null,
    }),
  },
  {
    exportName: "deleteVault",
    data: (vaultId: string) => ({ vaultId }),
  },
] as const)("$exportName reports another Organization's Vault as not found", async (writeCall) => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const foreignVault = await createFixtureVault({
    organizationId: secondOrganization.organization.id,
  });

  const response = await callServerFunction(firstOrganization.member.http, {
    modulePath: vaultsModulePath,
    exportName: writeCall.exportName,
    method: "POST",
    data: writeCall.data(foreignVault.id),
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ isNotFound: true });
});
