import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("#/server/functions/documents", () => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock("#/server/functions/vaults", () => ({
  createVault: vi.fn(),
  deleteVault: vi.fn(),
  listVaults: vi.fn(),
  updateVault: vi.fn(),
}));

vi.mock("#/server/functions/vault-items", () => ({
  addVaultItem: vi.fn(),
  listVaultItems: vi.fn(),
  removeVaultItem: vi.fn(),
}));

vi.mock("#/server/functions/links", () => ({
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  listLinks: vi.fn(),
  rotateLinkSlug: vi.fn(),
  updateLink: vi.fn(),
}));

import { getCollections } from "#/db-collections";
import { queueSharePassword } from "#/lib/pending-share-password";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  updateDocument,
} from "#/server/functions/documents";
import {
  createLink,
  deleteLink,
  listLinks,
  rotateLinkSlug,
  updateLink,
} from "#/server/functions/links";
import { addVaultItem, listVaultItems, removeVaultItem } from "#/server/functions/vault-items";
import { createVault, deleteVault, listVaults, updateVault } from "#/server/functions/vaults";

const organizationId = "9f989366-f25a-4a0a-bb3c-03d1d2ef62ab";

function documentRow(overrides: Partial<Awaited<ReturnType<typeof listDocuments>>[number]> = {}) {
  const now = new Date("2026-08-17T12:00:00.000Z");
  return {
    id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101",
    organizationId,
    title: "Launch notes",
    kind: "markdown" as const,
    status: "ready" as const,
    content: "",
    storageKey: null,
    fileName: null,
    mimeType: null,
    byteSize: null,
    checksum: null,
    pageCount: null,
    createdBy: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20000",
    updatedBy: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20000",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

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

function linkRow(overrides: Partial<Awaited<ReturnType<typeof listLinks>>[number]> = {}) {
  const now = new Date("2026-08-17T12:00:00.000Z");
  return {
    id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10505",
    organizationId,
    documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20101",
    vaultId: null,
    slug: "pending.slug",
    name: "Launch",
    passwordSet: false,
    requiresEmail: false,
    requiresVerification: false,
    gateVersion: 1,
    allowDownload: false,
    expiresAt: null,
    isActive: true,
    createdBy: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20000",
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

  test("indexes Vault membership and Links by Document and Vault id", () => {
    const { vaultItems, links } = getCollections(new QueryClient(), "organization-1");

    expect(
      [...vaultItems.indexes.values()].some((index) => index.matchesField(["documentId"])),
    ).toBe(true);
    expect([...vaultItems.indexes.values()].some((index) => index.matchesField(["vaultId"]))).toBe(
      true,
    );
    expect([...links.indexes.values()].some((index) => index.matchesField(["documentId"]))).toBe(
      true,
    );
    expect([...links.indexes.values()].some((index) => index.matchesField(["vaultId"]))).toBe(true);
  });

  test("keeps Organization queries in the Query cache for the QueryClient's life", async () => {
    const queryClient = new QueryClient();
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(listVaults).mockResolvedValue([]);
    vi.mocked(listVaultItems).mockResolvedValue([]);
    vi.mocked(listLinks).mockResolvedValue([]);
    const { documents, vaults, vaultItems, links } = getCollections(queryClient, organizationId);
    await Promise.all([
      documents.preload(),
      vaults.preload(),
      vaultItems.preload(),
      links.preload(),
    ]);

    for (const collection of ["documents", "vaults", "vault-items", "links"] as const) {
      expect(
        queryClient.getQueryCache().find({
          queryKey: ["organizations", organizationId, collection],
          exact: true,
        })?.gcTime,
      ).toBe(Number.POSITIVE_INFINITY);
    }
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
      passwordSet: false,
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

  test("optimistically inserts Vault membership and direct-writes the confirmed row without refetching", async () => {
    const membership = {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10101",
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10303",
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    const confirmed = {
      ...membership,
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    vi.mocked(listVaultItems).mockResolvedValue([]);
    vi.mocked(addVaultItem).mockResolvedValue(confirmed);
    const { vaultItems } = getCollections(new QueryClient(), organizationId);
    await vaultItems.preload();

    const transaction = vaultItems.insert(membership);

    expect(vaultItems.get(`${membership.vaultId}:${membership.documentId}`)).toMatchObject(
      membership,
    );

    await transaction.isPersisted.promise;

    expect(addVaultItem).toHaveBeenCalledWith({
      data: {
        vaultId: membership.vaultId,
        documentId: membership.documentId,
        addedAt: membership.addedAt,
      },
    });
    expect(vaultItems.get(`${membership.vaultId}:${membership.documentId}`)).toMatchObject(
      confirmed,
    );
    expect(listVaultItems).toHaveBeenCalledTimes(1);
  });

  test("optimistically removes Vault membership and direct-writes the deletion without refetching", async () => {
    const membership = {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10101",
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10303",
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    vi.mocked(listVaultItems).mockResolvedValue([membership]);
    vi.mocked(removeVaultItem).mockResolvedValue(membership);
    const { vaultItems } = getCollections(new QueryClient(), organizationId);
    await vaultItems.preload();

    const key = `${membership.vaultId}:${membership.documentId}` as const;
    const transaction = vaultItems.delete(key);

    expect(vaultItems.get(key)).toBeUndefined();

    await transaction.isPersisted.promise;

    expect(removeVaultItem).toHaveBeenCalledWith({
      data: {
        vaultId: membership.vaultId,
        documentId: membership.documentId,
      },
    });
    expect(vaultItems.get(key)).toBeUndefined();
    expect(listVaultItems).toHaveBeenCalledTimes(1);
  });

  test("optimistically inserts a markdown Document and direct-writes the confirmed row without refetching", async () => {
    const confirmed = documentRow({ title: "Untitled" });
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(createDocument).mockResolvedValue(confirmed);
    const { documents } = getCollections(new QueryClient(), organizationId);
    await documents.preload();

    const transaction = documents.insert(documentRow({ title: "" }));

    expect(documents.get(confirmed.id)).toMatchObject({
      id: confirmed.id,
      title: "",
      kind: "markdown",
      status: "ready",
      content: "",
    });

    await transaction.isPersisted.promise;

    expect(createDocument).toHaveBeenCalledWith({
      data: {
        documentId: confirmed.id,
        title: "",
      },
    });
    expect(documents.get(confirmed.id)).toMatchObject(confirmed);
    expect(listDocuments).toHaveBeenCalledTimes(1);
  });

  test("optimistically updates a markdown Document and direct-writes the confirmed row without refetching", async () => {
    const initial = documentRow();
    const confirmed = documentRow({
      title: "Launch archive",
      content: "Confirmed by the server",
      updatedAt: new Date("2026-08-17T13:00:00.000Z"),
    });
    vi.mocked(listDocuments).mockResolvedValue([initial]);
    vi.mocked(updateDocument).mockResolvedValue(confirmed);
    const { documents } = getCollections(new QueryClient(), organizationId);
    await documents.preload();

    const transaction = documents.update(initial.id, (draft) => {
      draft.title = "Launch archive";
      draft.content = "Client edit";
    });

    expect(documents.get(initial.id)).toMatchObject({
      title: "Launch archive",
      content: "Client edit",
    });

    await transaction.isPersisted.promise;

    expect(updateDocument).toHaveBeenCalledWith({
      data: {
        documentId: initial.id,
        title: "Launch archive",
        content: "Client edit",
        updatedAt: initial.updatedAt,
      },
    });
    expect(documents.get(initial.id)).toMatchObject(confirmed);
    expect(listDocuments).toHaveBeenCalledTimes(1);
  });

  test("optimistically deletes a Document and removes its memberships and Links after persistence", async () => {
    const deletedDocument = documentRow();
    const retainedDocument = documentRow({ id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20102" });
    const deletedMembership = {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10101",
      documentId: deletedDocument.id,
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    const retainedMembership = {
      vaultId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10101",
      documentId: retainedDocument.id,
      addedAt: new Date("2026-08-17T12:00:00.000Z"),
    };
    const deletedLink = {
      id: "0198b8f1-6ae4-7c39-9c3d-3cfd7af10505",
      organizationId,
      documentId: deletedDocument.id,
      vaultId: null,
      slug: "deleted-link",
      name: null,
      passwordSet: false,
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
      documentId: retainedDocument.id,
      slug: "retained-link",
    };
    vi.mocked(listDocuments).mockResolvedValue([deletedDocument, retainedDocument]);
    vi.mocked(listVaultItems).mockResolvedValue([deletedMembership, retainedMembership]);
    vi.mocked(listLinks).mockResolvedValue([deletedLink, retainedLink]);
    vi.mocked(deleteDocument).mockResolvedValue(deletedDocument);
    const { documents, vaultItems, links } = getCollections(new QueryClient(), organizationId);
    await Promise.all([documents.preload(), vaultItems.preload(), links.preload()]);

    const transaction = documents.delete(deletedDocument.id);
    expect(documents.get(deletedDocument.id)).toBeUndefined();

    await transaction.isPersisted.promise;

    expect(deleteDocument).toHaveBeenCalledWith({ data: { documentId: deletedDocument.id } });
    expect(documents.get(deletedDocument.id)).toBeUndefined();
    expect(documents.get(retainedDocument.id)).toBeDefined();
    expect(vaultItems.get(`${deletedMembership.vaultId}:${deletedDocument.id}`)).toBeUndefined();
    expect(links.get(deletedLink.id)).toBeUndefined();
    expect(vaultItems.get(`${retainedMembership.vaultId}:${retainedDocument.id}`)).toBeDefined();
    expect(links.get(retainedLink.id)).toBeDefined();
    expect(listDocuments).toHaveBeenCalledTimes(1);
  });

  test("optimistically inserts a Link and direct-writes the confirmed row without refetching", async () => {
    const confirmed = linkRow({ slug: "abc123ABCXYZ", name: "Launch notes" });
    vi.mocked(listLinks).mockResolvedValue([]);
    vi.mocked(createLink).mockResolvedValue(confirmed);
    const { links } = getCollections(new QueryClient(), organizationId);
    await links.preload();
    queueSharePassword(confirmed.id, "launch-gate");

    const transaction = links.insert(linkRow({ slug: "............", name: "Launch notes" }));

    expect(links.get(confirmed.id)).toMatchObject({
      id: confirmed.id,
      slug: "............",
      name: "Launch notes",
    });

    await transaction.isPersisted.promise;

    expect(createLink).toHaveBeenCalledWith({
      data: {
        linkId: confirmed.id,
        documentId: confirmed.documentId ?? undefined,
        vaultId: confirmed.vaultId ?? undefined,
        name: "Launch notes",
        password: "launch-gate",
        requiresEmail: false,
        requiresVerification: false,
        allowDownload: false,
        expiresAt: null,
      },
    });
    expect(links.get(confirmed.id)).toMatchObject(confirmed);
    expect(listLinks).toHaveBeenCalledTimes(1);
  });

  test("optimistically updates a Link and direct-writes the confirmed row without refetching", async () => {
    const initial = linkRow();
    const confirmed = linkRow({
      name: "Launch archive",
      allowDownload: true,
      updatedAt: new Date("2026-08-17T13:00:00.000Z"),
    });
    vi.mocked(listLinks).mockResolvedValue([initial]);
    vi.mocked(updateLink).mockResolvedValue(confirmed);
    const { links } = getCollections(new QueryClient(), organizationId);
    await links.preload();

    const transaction = links.update(initial.id, (draft) => {
      draft.name = "Launch archive";
      draft.allowDownload = true;
    });

    expect(links.get(initial.id)).toMatchObject({
      name: "Launch archive",
      allowDownload: true,
    });

    await transaction.isPersisted.promise;

    expect(updateLink).toHaveBeenCalledWith({
      data: {
        linkId: initial.id,
        name: "Launch archive",
        password: undefined,
        requiresEmail: false,
        requiresVerification: false,
        allowDownload: true,
        expiresAt: null,
        isActive: true,
      },
    });
    expect(rotateLinkSlug).not.toHaveBeenCalled();
    expect(links.get(initial.id)).toMatchObject(confirmed);
    expect(listLinks).toHaveBeenCalledTimes(1);
  });

  test("a Slug change rotates the Slug without refetching", async () => {
    const initial = linkRow({ slug: "oldslugvalue" });
    const confirmed = linkRow({ slug: "newslugvalue" });
    vi.mocked(listLinks).mockResolvedValue([initial]);
    vi.mocked(rotateLinkSlug).mockResolvedValue(confirmed);
    const { links } = getCollections(new QueryClient(), organizationId);
    await links.preload();

    const transaction = links.update(initial.id, (draft) => {
      draft.slug = "............";
    });

    await transaction.isPersisted.promise;

    expect(rotateLinkSlug).toHaveBeenCalledWith({ data: { linkId: initial.id } });
    expect(updateLink).not.toHaveBeenCalled();
    expect(links.get(initial.id)).toMatchObject(confirmed);
    expect(listLinks).toHaveBeenCalledTimes(1);
  });

  test("optimistically deletes a Link and direct-writes the deletion without refetching", async () => {
    const initial = linkRow();
    vi.mocked(listLinks).mockResolvedValue([initial]);
    vi.mocked(deleteLink).mockResolvedValue(initial);
    const { links } = getCollections(new QueryClient(), organizationId);
    await links.preload();

    const transaction = links.delete(initial.id);

    expect(links.get(initial.id)).toBeUndefined();

    await transaction.isPersisted.promise;

    expect(deleteLink).toHaveBeenCalledWith({ data: { linkId: initial.id } });
    expect(links.get(initial.id)).toBeUndefined();
    expect(listLinks).toHaveBeenCalledTimes(1);
  });
});
