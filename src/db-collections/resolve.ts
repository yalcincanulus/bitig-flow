import { notFound } from "@tanstack/react-router";

/**
 * The part of a collection a detail route needs: sync it, then read one row out of it.
 */
interface WarmCollection<TRow> {
  preload: () => Promise<void>;
  get: (key: string) => TRow | undefined;
}

/**
 * The one rule the Document, Vault, and Link detail routes share.
 *
 * A collection is built per Organization and only ever holds the active Organization's rows,
 * so an id belonging to another Organization is simply absent — cross-Organization is not-found
 * by construction rather than by a check someone remembered to write. The server is never asked
 * for the row: the collection is warmed instead, because route loaders run in parallel and a
 * detail route cannot assume the Dashboard layout's preload has already resolved.
 */
export async function resolveRow<TRow>(collection: WarmCollection<TRow>, id: string) {
  await collection.preload();

  const row = collection.get(id);
  if (row === undefined) {
    throw notFound();
  }

  return row;
}
