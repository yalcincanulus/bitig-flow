import { isNotFound } from "@tanstack/react-router";
import { describe, expect, test } from "vitest";

import { resolveRow } from "#/db-collections/resolve";

interface Row {
  id: string;
}

/**
 * A collection stands in for the real one: its rows only become visible once the
 * caller has awaited `preload`, which is what makes the lookup rule's ordering observable.
 */
function warmCollection(rows: Array<Row>) {
  let warm = false;

  return {
    preloadCount: 0,
    preload() {
      this.preloadCount += 1;
      warm = true;
      return Promise.resolve();
    },
    get(key: string) {
      return warm ? rows.find((row) => row.id === key) : undefined;
    },
  };
}

describe("resolveRow", () => {
  test("returns the row the id names", async () => {
    const collection = warmCollection([{ id: "document-1" }]);

    await expect(resolveRow(collection, "document-1")).resolves.toEqual({ id: "document-1" });
  });

  test("waits for the collection to be warm before looking the id up", async () => {
    const collection = warmCollection([{ id: "document-1" }]);

    await resolveRow(collection, "document-1");

    expect(collection.preloadCount).toBe(1);
  });

  test("throws not-found when the collection does not hold the id", async () => {
    const collection = warmCollection([{ id: "document-1" }]);

    const error = await resolveRow(collection, "document-2").catch((thrown: unknown) => thrown);

    expect(isNotFound(error)).toBe(true);
  });
});
