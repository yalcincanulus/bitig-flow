import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "#/server/db/client";
import {
  demoEnvironment,
  demoGlobalUsage,
  demoReport,
  document,
  documentUpload,
} from "#/server/db/schema";
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

type StaleUpload = Readonly<{
  id: string;
  declaredByteSize: number | null;
  demoEnvironmentId: string | null;
}>;

async function removeStaleUploadRow(row: StaleUpload) {
  return db.transaction(async (transaction) => {
    const [environment] = row.demoEnvironmentId
      ? await transaction
          .select({ id: demoEnvironment.id })
          .from(demoEnvironment)
          .where(eq(demoEnvironment.id, row.demoEnvironmentId))
          .for("update")
      : [];
    if (environment) {
      await transaction.execute(
        sql`SELECT id FROM ${demoGlobalUsage} WHERE id = 'demo-global' FOR UPDATE`,
      );
    }

    const [removed] = await transaction
      .delete(document)
      .where(and(eq(document.id, row.id), eq(document.status, "pending")))
      .returning({ id: document.id });
    if (!removed) return false;
    if (!environment) return true;

    const declaredByteSize = row.declaredByteSize ?? 0;
    const [releasedEnvironment] = await transaction
      .update(demoEnvironment)
      .set({
        documentCount: sql`${demoEnvironment.documentCount} - 1`,
        uploadedDocumentCount: sql`${demoEnvironment.uploadedDocumentCount} - 1`,
        pendingUploadCount: sql`${demoEnvironment.pendingUploadCount} - 1`,
        ...(declaredByteSize > 0
          ? {
              reservedUploadBytes: sql`${demoEnvironment.reservedUploadBytes} - ${declaredByteSize}`,
            }
          : {}),
      })
      .where(
        and(
          eq(demoEnvironment.id, environment.id),
          gte(demoEnvironment.documentCount, 1),
          gte(demoEnvironment.uploadedDocumentCount, 1),
          gte(demoEnvironment.pendingUploadCount, 1),
          gte(demoEnvironment.reservedUploadBytes, declaredByteSize),
        ),
      )
      .returning({ id: demoEnvironment.id });
    if (!releasedEnvironment) throw new Error("Demo Upload reservation is unavailable");

    const [releasedGlobal] = await transaction
      .update(demoGlobalUsage)
      .set({
        pendingUploadCount: sql`${demoGlobalUsage.pendingUploadCount} - 1`,
        confirmedBytes: sql`${demoGlobalUsage.confirmedBytes} - ${declaredByteSize}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(demoGlobalUsage.id, "demo-global"),
          gte(demoGlobalUsage.pendingUploadCount, 1),
          gte(demoGlobalUsage.confirmedBytes, declaredByteSize),
        ),
      )
      .returning({ id: demoGlobalUsage.id });
    if (!releasedGlobal) throw new Error("Global Demo Upload reservation is unavailable");
    return true;
  });
}

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
    const removed = await removeStaleUploadRow(row);
    if (!removed) continue;
    if (row.uploadKey) {
      await deleteStoredObject(row.uploadKey);
      removedUploadKeys.push(row.uploadKey);
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
