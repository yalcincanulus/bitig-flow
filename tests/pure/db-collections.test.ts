import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";

vi.mock("#/server/functions/documents", () => ({
  listDocuments: vi.fn(),
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
});
