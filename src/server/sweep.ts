import { and, eq, isNotNull, lt } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document } from "#/server/db/schema";
import { storageKeyPrefix } from "#/lib/upload";
import { deleteStoredObject, listStoredObjectKeys } from "#/server/storage";

const unconfirmedOlderThanMs = 24 * 60 * 60 * 1000;

export type UnconfirmedSweepReport = Readonly<{
  removedDocumentIds: ReadonlyArray<string>;
  removedStorageKeys: ReadonlyArray<string>;
}>;

export type OrphanSweepReport = Readonly<{
  removedStorageKeys: ReadonlyArray<string>;
}>;

export async function sweepUnconfirmedUploads(): Promise<UnconfirmedSweepReport> {
  const cutoff = new Date(Date.now() - unconfirmedOlderThanMs);
  const stale = await db
    .select({ id: document.id, storageKey: document.storageKey })
    .from(document)
    .where(and(eq(document.status, "pending"), lt(document.createdAt, cutoff)));

  const removedDocumentIds: string[] = [];
  const removedStorageKeys: string[] = [];

  for (const row of stale) {
    if (row.storageKey) {
      await deleteStoredObject(row.storageKey);
      removedStorageKeys.push(row.storageKey);
    }
    await db.delete(document).where(eq(document.id, row.id));
    removedDocumentIds.push(row.id);
  }

  return { removedDocumentIds, removedStorageKeys };
}

export async function sweepOrphanedObjects(): Promise<OrphanSweepReport> {
  const [keys, rows] = await Promise.all([
    listStoredObjectKeys(`${storageKeyPrefix()}org/`),
    db
      .select({ storageKey: document.storageKey })
      .from(document)
      .where(isNotNull(document.storageKey)),
  ]);

  const known = new Set(rows.flatMap((row) => (row.storageKey === null ? [] : [row.storageKey])));
  const removedStorageKeys: string[] = [];

  for (const key of keys) {
    if (known.has(key)) continue;
    await deleteStoredObject(key);
    removedStorageKeys.push(key);
  }

  return { removedStorageKeys };
}
