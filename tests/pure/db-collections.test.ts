import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("#/server/functions/documents", () => ({
  listDocuments: vi.fn(),
}));

vi.mock("#/server/functions/vaults", () => ({
  createVault: vi.fn(),
  deleteVault: vi.fn(),
  listVaults: vi.fn(),
  updateVault: vi.fn(),
}));

vi.mock("#/server/functions/vault-items", () => ({
  listVaultItems: vi.fn(),
}));

vi.mock("#/server/functions/links", () => ({
  listLinks: vi.fn(),
}));

import { getCollections } from "#/db-collections";
import { listLinks } from "#/server/functions/links";
import { listVaultItems } from "#/server/functions/vault-items";
import { createVault, deleteVault, listVaults, updateVault } from "#/server/functions/vaults";

const organizationId = "9f989366-f25a-4a0a-bb3c-03d1d2ef62ab";

function vaultRow(overrides: Partial<Awaited<ReturnType<typeof listVaults>>[number]> = {}) {
  const now = new Date("2026-08-17T12:00:00.000Z");
  return {
    id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10101",
    organizationId,
    name: "Launch notes",
    description: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCollections", () => {
  test("memoizes Organization collections by QueryClient and Organization id", () => {
    const firstQueryClient = new QueryClient();
    const secondQueryClient = new QueryClient();

    const first = getCollections(firstQueryClient, "organization-1");

    expect(getCollections(firstQueryClient, "organization-1")).toBe(first);
    expect(getCollections(firstQueryClient, "organization-2")).not.toBe(first);
    expect(getCollections(secondQueryClient, "organization-1")).not.toBe(first);
  });

  test("exposes exactly the four Organization-owned entity sets", () => {
    const collections = getCollections(new QueryClient(), "organization-1");

    expect(Object.keys(collections).sort()).toEqual(["documents", "links", "vaultItems", "vaults"]);
  });

  test("keys Vault membership by its composite primary key", () => {
    const { vaultItems } = getCollections(new QueryClient(), "organization-1");

    expect(
      vaultItems.config.getKey({
        vaultId: "vault-1",
        documentId: "document-1",
        addedAt: new Date(),
      }),
    ).toBe("vault-1:document-1");
  });

  test("optimistically inserts a Vault and direct-writes the confirmed row without refetching", async () => {
    const confirmed = vaultRow({ description: "Confirmed by the server" });
    vi.mocked(listVaults).mockResolvedValue([]);
    vi.mocked(createVault).mockResolvedValue(confirmed);
    const { vaults } = getCollections(new QueryClient(), organizationId);
    await vaults.preload();

    const transaction = vaults.insert(vaultRow());

    expect(vaults.get(confirmed.id)).toMatchObject({
      id: confirmed.id,
      name: "Launch notes",
      description: null,
    });

    await transaction.isPersisted.promise;

    expect(createVault).toHaveBeenCalledWith({
      data: {
        vaultId: confirmed.id,
        name: "Launch notes",
        description: undefined,
      },
    });
    expect(vaults.get(confirmed.id)).toMatchObject(confirmed);
    expect(listVaults).toHaveBeenCalledTimes(1);
  });

  test("optimistically updates a Vault and direct-writes the confirmed row without refetching", async () => {
    const initial = vaultRow();
    const confirmed = vaultRow({
      name: "Launch archive",
      description: "Confirmed by the server",
      updatedAt: new Date("2026-08-17T13:00:00.000Z"),
    });
    vi.mocked(listVaults).mockResolvedValue([initial]);
    vi.mocked(updateVault).mockResolvedValue(confirmed);
    const { vaults } = getCollections(new QueryClient(), organizationId);
    await vaults.preload();

    const transaction = vaults.update(initial.id, (draft) => {
      draft.name = "Launch archive";
      draft.description = "Client edit";
    });

    expect(vaults.get(initial.id)).toMatchObject({
      name: "Launch archive",
      description: "Client edit",
    });

    await transaction.isPersisted.promise;

    expect(updateVault).toHaveBeenCalledWith({
      data: {
        vaultId: initial.id,
        name: "Launch archive",
        description: "Client edit",
      },
    });
    expect(vaults.get(initial.id)).toMatchObject(confirmed);
    expect(listVaults).toHaveBeenCalledTimes(1);
  });

  test("optimistically deletes a Vault and direct-writes the deletion without refetching", async () => {
    const initial = vaultRow();
    vi.mocked(listVaults).mockResolvedValue([initial]);
    vi.mocked(deleteVault).mockResolvedValue(initial);
    const { vaults } = getCollections(new QueryClient(), organizationId);
    await vaults.preload();

    const transaction = vaults.delete(initial.id);

    expect(vaults.get(initial.id)).toBeUndefined();

    await transaction.isPersisted.promise;

    expect(deleteVault).toHaveBeenCalledWith({ data: { vaultId: initial.id } });
    expect(vaults.get(initial.id)).toBeUndefined();
    expect(listVaults).toHaveBeenCalledTimes(1);
  });

  test("removes a deleted Vault's resident memberships and Links after persistence", async () => {
    const deletedVault = vaultRow();
    const retainedVault = vaultRow({ id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10202" });
    const deletedMembership = {
      vaultId: deletedVault.id,
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10303",
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    const retainedMembership = {
      vaultId: retainedVault.id,
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10404",
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    const deletedLink = {
      id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10505",
      organizationId,
      documentId: null,
      vaultId: deletedVault.id,
      slug: "deleted-link",
      name: null,
      requiresEmail: false,
      requiresVerification: false,
      gateVersion: 1,
      allowDownload: false,
      expiresAt: null,
      isActive: true,
      createdBy: null,
      createdAt: new Date("2026-08-17T12:00:00.000Z"),
      updatedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    const retainedLink = {
      ...deletedLink,
      id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10606",
      vaultId: retainedVault.id,
      slug: "retained-link",
    };
    vi.mocked(listVaults).mockResolvedValue([deletedVault, retainedVault]);
    vi.mocked(listVaultItems).mockResolvedValue([deletedMembership, retainedMembership]);
    vi.mocked(listLinks).mockResolvedValue([deletedLink, retainedLink]);
    vi.mocked(deleteVault).mockResolvedValue(deletedVault);
    const { vaults, vaultItems, links } = getCollections(new QueryClient(), organizationId);
    await Promise.all([vaults.preload(), vaultItems.preload(), links.preload()]);

    const transaction = vaults.delete(deletedVault.id);
    await transaction.isPersisted.promise;

    expect(vaultItems.get(`${deletedVault.id}:${deletedMembership.documentId}`)).toBeUndefined();
    expect(links.get(deletedLink.id)).toBeUndefined();
    expect(vaultItems.get(`${retainedVault.id}:${retainedMembership.documentId}`)).toBeDefined();
    expect(links.get(retainedLink.id)).toBeDefined();
  });
});
