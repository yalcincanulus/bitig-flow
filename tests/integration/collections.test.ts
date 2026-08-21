import { expect, test } from "vitest";

import type { OrganizationId } from "#/server/ids";
import { listVaultItems } from "#/server/repositories/vault-items";

import {
  callServerFunction,
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
} from "../fixtures";

const vaultsModulePath = "/src/server/functions/vaults.ts";
const vaultItemsModulePath = "/src/server/functions/vault-items.ts";
const linksModulePath = "/src/server/functions/links.ts";

async function seedOrganization() {
  const fixture = await createOrganizationFixture();
  const documents = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);
  const vaults = await Promise.all([
    createFixtureVault({ organizationId: fixture.organization.id }),
    createFixtureVault({ organizationId: fixture.organization.id }),
  ]);
  const [vaultItems, links] = await Promise.all([
    Promise.all(
      documents.map((document) =>
        createFixtureVaultItem({ vaultId: vaults[0]!.id, documentId: document.id }),
      ),
    ),
    Promise.all(
      documents.map((document) =>
        createFixtureLink({
          organizationId: fixture.organization.id,
          createdBy: fixture.member.user.id,
          documentId: document.id,
        }),
      ),
    ),
  ]);

  return { ...fixture, documents, vaults, vaultItems, links };
}

async function listOverRpc(http: typeof fetch, modulePath: string, exportName: string) {
  const response = await callServerFunction(http, { modulePath, exportName, method: "GET" });

  expect(response.ok).toBe(true);
  return (await response.json()) as Record<string, unknown>[];
}

function idsOf(rows: Record<string, unknown>[]) {
  return rows.map((row) => String(row.id)).sort();
}

test("each list returns its own Organization's complete set and none of another's", async () => {
  const [first, second] = await Promise.all([seedOrganization(), seedOrganization()]);

  const [vaults, vaultItems, links] = await Promise.all([
    listOverRpc(first.member.http, vaultsModulePath, "listVaults"),
    listOverRpc(first.member.http, vaultItemsModulePath, "listVaultItems"),
    listOverRpc(first.member.http, linksModulePath, "listLinks"),
  ]);

  expect(idsOf(vaults)).toEqual(first.vaults.map((vault) => vault.id).sort());
  expect(idsOf(links)).toEqual(first.links.map((link) => link.id).sort());
  expect(vaultItems.map((row) => String(row.documentId)).sort()).toEqual(
    first.vaultItems.map((item) => item.documentId).sort(),
  );
  for (const row of vaultItems) {
    expect(row.vaultId).toBe(first.vaults[0]!.id);
  }

  const otherOrganizationRowIds = [
    ...second.vaults.map((vault) => vault.id),
    ...second.documents.map((document) => document.id),
    ...second.links.map((link) => link.id),
  ];
  const returnedValues = [...vaults, ...vaultItems, ...links].flatMap((row) =>
    Object.values(row).map(String),
  );

  for (const rowId of otherOrganizationRowIds) {
    expect(returnedValues).not.toContain(rowId);
  }
});

test("the Vault membership and Link payloads carry no joined or secret columns", async () => {
  const fixture = await seedOrganization();

  const [vaultItems, links] = await Promise.all([
    listOverRpc(fixture.member.http, vaultItemsModulePath, "listVaultItems"),
    listOverRpc(fixture.member.http, linksModulePath, "listLinks"),
  ]);

  // The Vault join must contribute no columns of its own, and no Document title is denormalised.
  expect(Object.keys(vaultItems[0]!).sort()).toEqual([
    "addedAt",
    "documentId",
    "isVisible",
    "vaultId",
  ]);
  expect(links[0]).not.toHaveProperty("passwordHash");
  expect(links[0]).toHaveProperty("passwordSet");
  expect(links[0]).not.toHaveProperty("title");
});

test("a Vault membership row of another Organization is invisible at the repository seam", async () => {
  const [first, second] = await Promise.all([seedOrganization(), seedOrganization()]);

  // Sanctioned ADR-0053 exception: Vault membership is scoped through a join, proven here in SQL.
  const rows = await listVaultItems(first.organization.id as OrganizationId);

  expect(rows.map((row) => row.vaultId)).toEqual(first.vaultItems.map(() => first.vaults[0]!.id));
  expect(rows.map((row) => row.vaultId)).not.toContain(second.vaults[0]!.id);
});
