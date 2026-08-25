import { and, eq, isNotNull, lt } from "drizzle-orm";

import { db } from "#/server/db/client";
import { demoEnvironment, demoReport, document, documentUpload } from "#/server/db/schema";
import { releaseDemoBudget } from "#/server/repositories/demo-environments";
import { storageKeyPrefix, uploadKeyPrefix } from "#/lib/upload";
import { deleteStoredObject, listStoredObjectKeys } from "#/server/storage";

const unconfirmedOlderThanMs = 24 * 60 * 60 * 1000;

export type UnconfirmedSweepReport = Readonly<{
  removedDocumentIds: ReadonlyArray<string>;
  removedUploadKeys: ReadonlyArray<string>;
}>;

export type OrphanSweepReport = Readonly<{
  removedStorageKeys: ReadonlyArray<string>;
  removedUploadKeys: ReadonlyArray<string>;
}>;

// This is the bounded lifetime of an Upload key: while its pending row lives the staged
// object is protected, and both go together once the row ages out.
export async function sweepUnconfirmedUploads(): Promise<UnconfirmedSweepReport> {
  const cutoff = new Date(Date.now() - unconfirmedOlderThanMs);
  const stale = await db
    .select({
      id: document.id,
      uploadKey: documentUpload.uploadKey,
      declaredByteSize: documentUpload.declaredByteSize,
      demoEnvironmentId: demoEnvironment.id,
    })
    .from(document)
    .leftJoin(documentUpload, eq(documentUpload.documentId, document.id))
    .leftJoin(demoEnvironment, eq(demoEnvironment.organizationId, document.organizationId))
    .where(and(eq(document.status, "pending"), lt(document.createdAt, cutoff)));

  const removedDocumentIds: string[] = [];
  const removedUploadKeys: string[] = [];

  for (const row of stale) {
    if (row.uploadKey) {
      await deleteStoredObject(row.uploadKey);
      removedUploadKeys.push(row.uploadKey);
    }
    await db.delete(document).where(eq(document.id, row.id));
    if (row.demoEnvironmentId) {
      await releaseDemoBudget(row.demoEnvironmentId, "uploadedDocument", 1);
      await releaseDemoBudget(row.demoEnvironmentId, "pendingUpload", 1);
      if (row.declaredByteSize) {
        await releaseDemoBudget(row.demoEnvironmentId, "uploadBytes", row.declaredByteSize);
      }
    }
    removedDocumentIds.push(row.id);
  }

  return { removedDocumentIds, removedUploadKeys };
}

export async function sweepExpiredDemoReports(now = new Date()) {
  const removed = await db
    .delete(demoReport)
    .where(lt(demoReport.expiresAt, now))
    .returning({ id: demoReport.id });
  return { removedReportIds: removed.map((row) => row.id) };
}

// The listing is taken before the rows it is judged against, never after: a key that appears
// while this runs is simply not in the list, whereas a row that appears after the query would
// have had its object deleted out from under an upload still in flight.
async function sweepUnknownKeys(prefix: string, claimedKeys: () => Promise<Array<string>>) {
  const keys = await listStoredObjectKeys(prefix);
  const claimed = new Set(await claimedKeys());
  const removed: string[] = [];

  for (const key of keys) {
    if (claimed.has(key)) continue;
    await deleteStoredObject(key);
    removed.push(key);
  }

  return removed;
}

// Both key spaces are reconciled the same way: an object no row claims is bytes nothing can
// reach. For `upload/` that means a staging object whose upload attempt is gone.
export async function sweepOrphanedObjects(): Promise<OrphanSweepReport> {
  const prefix = storageKeyPrefix();

  const removedStorageKeys = await sweepUnknownKeys(`${prefix}org/`, async () => {
    const rows = await db
      .select({ storageKey: document.storageKey })
      .from(document)
      .where(isNotNull(document.storageKey));
    return rows.flatMap((row) => (row.storageKey === null ? [] : [row.storageKey]));
  });

  const removedUploadKeys = await sweepUnknownKeys(uploadKeyPrefix(prefix), async () => {
    const rows = await db.select({ uploadKey: documentUpload.uploadKey }).from(documentUpload);
    return rows.map((row) => row.uploadKey);
  });

  return { removedStorageKeys, removedUploadKeys };
}
