import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";

vi.mock("#/server/functions/documents", () => ({
  listDocuments: vi.fn(),
}));

vi.mock("#/server/functions/vaults", () => ({
  listVaults: vi.fn(),
}));

vi.mock("#/server/functions/vault-items", () => ({
  listVaultItems: vi.fn(),
}));

vi.mock("#/server/functions/links", () => ({
  listLinks: vi.fn(),
}));

import { getCollections } from "#/db-collections";

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
});
