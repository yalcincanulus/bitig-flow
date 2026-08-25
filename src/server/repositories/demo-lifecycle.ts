import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, gte, inArray, lte, notExists, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { demoSampleByteSize, demoSamples } from "#/server/demo-samples";
import { releaseDemoAdmission } from "#/server/demo-admission";
import { mintLinkSlug } from "#/lib/link-slug";
import { demoEndReasonSchema } from "#/lib/demo-operations";
import { storageKeyForDocument, storageKeyPrefix } from "#/lib/upload";
import { db } from "#/server/db/client";
import {
  demoEnvironment,
  demoGlobalUsage,
  demoProvisioningAttempt,
  demoSampleResource,
  demoSummary,
  deploymentPolicy,
  document,
  link,
  member,
  organization,
  session,
  user,
  vault,
  vaultItem,
} from "#/server/db/schema";
import { deleteStoredObject, listStoredObjectKeys, putStoredObject } from "#/server/storage";

export class DemoStorageCapacityError extends Error {
  override readonly name = "DemoStorageCapacityError";

  constructor() {
    super("Demo storage capacity is unavailable");
  }
}

type DemoSampleObject = Readonly<{
  storageKey: string;
  bytes: Uint8Array;
  mimeType: string;
}>;

export async function findDemoEnvironmentForUser(userId: string) {
  const [environment] = await db
    .select()
    .from(demoEnvironment)
    .where(eq(demoEnvironment.userId, userId))
    .limit(1);
  return environment;
}

export async function demoSessionAvailability(userId: string, now = new Date()) {
  const environment = await findDemoEnvironmentForUser(userId);
  if (!environment) return { available: false as const, reason: "missing" as const };
  if (environment.expiresAt <= now) {
    await terminateDemoEnvironment(environment.id, "expired", now);
    return { available: false as const, reason: "expired" as const };
  }
  if (environment.state === "terminating" || environment.state === "completed") {
    return { available: false as const, reason: "terminating" as const };
  }
  const [policy] = await db
    .select({ pauseAllDemoAccess: deploymentPolicy.pauseAllDemoAccess })
    .from(deploymentPolicy)
    .where(eq(deploymentPolicy.id, "deployment"))
    .limit(1);
  if (!policy || policy.pauseAllDemoAccess || environment.state === "global_paused") {
    return { available: false as const, reason: "paused" as const };
  }
  return { available: true as const, environment };
}

export async function findReadyDemoEnvironmentByEntryKeyHash(
  entryKeyHash: string,
  now = new Date(),
) {
  const [attempt] = await db
    .select()
    .from(demoProvisioningAttempt)
    .where(eq(demoProvisioningAttempt.entryKeyHash, entryKeyHash))
    .limit(1);
  if (!attempt || attempt.recoveryExpiresAt <= now) return undefined;
  const [environment] = await db
    .select()
    .from(demoEnvironment)
    .where(eq(demoEnvironment.entryKeyHash, entryKeyHash))
    .limit(1);
  if (!environment || environment.state !== "active" || environment.expiresAt <= now) {
    return undefined;
  }
  const [activeSession] = await db
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.userId, environment.userId), gte(session.expiresAt, now)))
    .orderBy(desc(session.createdAt))
    .limit(1);
  return activeSession ? { environment, sessionToken: activeSession.token } : undefined;
}

export async function beginDemoProvisioningAttempt(entryKeyHash: string, recoveryExpiresAt: Date) {
  const [created] = await db
    .insert(demoProvisioningAttempt)
    .values({ entryKeyHash, recoveryExpiresAt })
    .onConflictDoNothing({ target: demoProvisioningAttempt.entryKeyHash })
    .returning();
  if (created) return { created: true as const, attempt: created };

  const [existing] = await db
    .select()
    .from(demoProvisioningAttempt)
    .where(eq(demoProvisioningAttempt.entryKeyHash, entryKeyHash))
    .limit(1);
  if (!existing) throw new Error("Demo provisioning attempt conflict could not be loaded");
  return { created: false as const, attempt: existing };
}

export async function findDemoProvisioningAttemptByEntryKeyHash(entryKeyHash: string) {
  const [attempt] = await db
    .select()
    .from(demoProvisioningAttempt)
    .where(eq(demoProvisioningAttempt.entryKeyHash, entryKeyHash))
    .limit(1);
  return attempt;
}

export async function recordDemoProvisioningAdmission(attemptId: string, admissionKey: string) {
  await db
    .update(demoProvisioningAttempt)
    .set({ admissionKey, admissionReserved: true, updatedAt: new Date() })
    .where(eq(demoProvisioningAttempt.id, attemptId));
}

export async function releaseTrackedDemoProvisioningAdmission(attemptId: string) {
  const [reservation] = await db
    .select({
      key: demoProvisioningAttempt.admissionKey,
      reserved: demoProvisioningAttempt.admissionReserved,
    })
    .from(demoProvisioningAttempt)
    .where(eq(demoProvisioningAttempt.id, attemptId))
    .limit(1);
  if (!reservation?.reserved || !reservation.key) return { released: false as const };

  await releaseDemoAdmission(reservation.key, attemptId);
  await db
    .update(demoProvisioningAttempt)
    .set({ admissionKey: null, admissionReserved: false, updatedAt: new Date() })
    .where(eq(demoProvisioningAttempt.id, attemptId));
  return { released: true as const };
}

export async function recordDemoProvisioningIdentity(
  attemptId: string,
  values: { userId?: string; organizationId?: string },
) {
  await db
    .update(demoProvisioningAttempt)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(demoProvisioningAttempt.id, attemptId));
}

export async function markDemoProvisioningReady(attemptId: string) {
  await db
    .update(demoProvisioningAttempt)
    .set({
      state: "ready",
      admissionKey: null,
      admissionReserved: false,
      userId: null,
      organizationId: null,
      updatedAt: new Date(),
    })
    .where(eq(demoProvisioningAttempt.id, attemptId));
}

export async function discardDemoProvisioningAttempt(attemptId: string) {
  await db.delete(demoProvisioningAttempt).where(eq(demoProvisioningAttempt.id, attemptId));
}

export async function createProvisioningDemoEnvironment(
  userId: string,
  organizationId: string,
  entryKeyHash: string,
  attemptId: string,
) {
  const now = new Date();
  const welcomeId = uuidv7();
  const pdfId = uuidv7();
  const imageId = uuidv7();
  const vaultId = uuidv7();
  const linkId = uuidv7();
  const pdfStorageKey = storageKeyForDocument(organizationId, pdfId, storageKeyPrefix());
  const imageStorageKey = storageKeyForDocument(organizationId, imageId, storageKeyPrefix());

  const environment = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${deploymentPolicy} WHERE id = 'deployment' FOR SHARE`,
    );
    const [policy] = await transaction
      .select({
        environmentLifetimeHours: deploymentPolicy.environmentLifetimeHours,
        globalConfirmedBytes: deploymentPolicy.globalConfirmedBytes,
      })
      .from(deploymentPolicy)
      .where(eq(deploymentPolicy.id, "deployment"))
      .limit(1);
    if (!policy) throw new Error("Demo admission is unavailable");

    const [reservedBytes] = await transaction
      .update(demoGlobalUsage)
      .set({
        confirmedBytes: sql`${demoGlobalUsage.confirmedBytes} + ${demoSampleByteSize}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(demoGlobalUsage.id, "demo-global"),
          lte(
            sql<number>`${demoGlobalUsage.confirmedBytes} + ${demoSampleByteSize}`,
            policy.globalConfirmedBytes,
          ),
        ),
      )
      .returning({ id: demoGlobalUsage.id });
    if (!reservedBytes) throw new DemoStorageCapacityError();

    const [createdEnvironment] = await transaction
      .insert(demoEnvironment)
      .values({
        userId,
        organizationId,
        anonymousReference: randomBytes(6).toString("base64url"),
        entryKeyHash,
        state: "provisioning",
        createdAt: now,
        expiresAt: new Date(now.getTime() + policy.environmentLifetimeHours * 60 * 60 * 1_000),
        documentCount: 3,
        uploadedDocumentCount: 2,
        vaultCount: 1,
        linkCount: 1,
        confirmedBytes: demoSampleByteSize,
      })
      .returning();
    if (!createdEnvironment) throw new Error("Demo Environment insert returned no row");
    const [linkedAttempt] = await transaction
      .update(demoProvisioningAttempt)
      .set({
        environmentId: createdEnvironment.id,
        globalReserved: false,
        updatedAt: now,
      })
      .where(eq(demoProvisioningAttempt.id, attemptId))
      .returning({ id: demoProvisioningAttempt.id });
    if (!linkedAttempt) throw new Error("Demo provisioning attempt is unavailable");

    await transaction.insert(document).values([
      {
        id: welcomeId,
        organizationId,
        title: demoSamples.welcome.title,
        kind: "markdown",
        status: "ready",
        content: demoSamples.welcome.content,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: pdfId,
        organizationId,
        title: demoSamples.pdf.title,
        kind: "pdf",
        status: "ready",
        storageKey: pdfStorageKey,
        fileName: demoSamples.pdf.fileName,
        mimeType: demoSamples.pdf.mimeType,
        byteSize: demoSamples.pdf.bytes.byteLength,
        checksum: demoSamples.pdf.checksum,
        pageCount: demoSamples.pdf.pageCount,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: imageId,
        organizationId,
        title: demoSamples.image.title,
        kind: "image",
        status: "ready",
        storageKey: imageStorageKey,
        fileName: demoSamples.image.fileName,
        mimeType: demoSamples.image.mimeType,
        byteSize: demoSamples.image.bytes.byteLength,
        checksum: demoSamples.image.checksum,
        pageCount: demoSamples.image.pageCount,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await transaction.insert(vault).values({
      id: vaultId,
      organizationId,
      name: demoSamples.vault.name,
      description: demoSamples.vault.description,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(vaultItem).values(
      [welcomeId, pdfId, imageId].map((documentId) => ({
        vaultId,
        documentId,
        isVisible: true,
        addedAt: now,
      })),
    );
    await transaction.insert(link).values({
      id: linkId,
      organizationId,
      vaultId,
      slug: mintLinkSlug(randomBytes(12)),
      name: demoSamples.link.name,
      allowDownload: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(demoSampleResource).values([
      { environmentId: createdEnvironment.id, kind: "document", documentId: welcomeId },
      { environmentId: createdEnvironment.id, kind: "document", documentId: pdfId },
      { environmentId: createdEnvironment.id, kind: "document", documentId: imageId },
      { environmentId: createdEnvironment.id, kind: "vault", vaultId },
      { environmentId: createdEnvironment.id, kind: "link", linkId },
    ]);

    return createdEnvironment;
  });

  return {
    environment,
    sampleObjects: [
      {
        storageKey: pdfStorageKey,
        bytes: demoSamples.pdf.bytes,
        mimeType: demoSamples.pdf.mimeType,
      },
      {
        storageKey: imageStorageKey,
        bytes: demoSamples.image.bytes,
        mimeType: demoSamples.image.mimeType,
      },
    ] satisfies ReadonlyArray<DemoSampleObject>,
  };
}

export async function storeDemoSampleObjects(sampleObjects: ReadonlyArray<DemoSampleObject>) {
  for (const sample of sampleObjects) {
    await putStoredObject(sample.storageKey, sample.bytes, sample.mimeType);
  }
}

export async function findDemoSampleResourceIds(environmentId: string) {
  const rows = await db
    .select({
      documentId: demoSampleResource.documentId,
      vaultId: demoSampleResource.vaultId,
      linkId: demoSampleResource.linkId,
    })
    .from(demoSampleResource)
    .where(eq(demoSampleResource.environmentId, environmentId));

  return {
    documents: rows.flatMap((row) => (row.documentId ? [row.documentId] : [])).sort(),
    vaults: rows.flatMap((row) => (row.vaultId ? [row.vaultId] : [])).sort(),
    links: rows.flatMap((row) => (row.linkId ? [row.linkId] : [])).sort(),
  };
}

export async function activateDemoEnvironment(environmentId: string) {
  const [activated] = await db
    .update(demoEnvironment)
    .set({ state: "active", stateVersion: sql`${demoEnvironment.stateVersion} + 1` })
    .where(and(eq(demoEnvironment.id, environmentId), eq(demoEnvironment.state, "provisioning")))
    .returning();
  if (!activated) throw new Error("Provisioning Demo Environment is unavailable");
  return activated;
}

export async function removeUntrackedDemoIdentity(userId?: string, organizationId?: string) {
  if (organizationId) await db.delete(organization).where(eq(organization.id, organizationId));
  if (userId) await db.delete(user).where(eq(user.id, userId));
}

export async function removeStaleUntrackedDemoIdentities(createdBefore: Date, limit = 25) {
  const orphanUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.isAnonymous, true),
        lte(user.createdAt, createdBefore),
        notExists(
          db
            .select({ id: demoEnvironment.id })
            .from(demoEnvironment)
            .where(eq(demoEnvironment.userId, user.id)),
        ),
      ),
    )
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(limit);
  for (const orphan of orphanUsers) {
    const memberships = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, orphan.id));
    const organizationIds = memberships.map((membership) => membership.organizationId);
    if (organizationIds.length > 0) {
      await db.delete(organization).where(inArray(organization.id, organizationIds));
    }
    await db.delete(user).where(eq(user.id, orphan.id));
  }
  return orphanUsers.length;
}

export async function removeDemoStorage(organizationId: string) {
  const prefixes = [
    `${storageKeyPrefix()}org/${organizationId}/`,
    `${storageKeyPrefix()}upload/${organizationId}/`,
  ];
  const keys = (await Promise.all(prefixes.map((prefix) => listStoredObjectKeys(prefix)))).flat();
  await Promise.all(keys.map((key) => deleteStoredObject(key)));
  return keys.length;
}

export async function terminateDemoEnvironment(
  environmentId: string,
  endReason: string,
  now = new Date(),
) {
  const reason = demoEndReasonSchema.parse(endReason);
  const terminating = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const [environment] = await transaction
      .select()
      .from(demoEnvironment)
      .where(eq(demoEnvironment.id, environmentId))
      .limit(1);
    if (!environment) return undefined;

    if (environment.state !== "terminating") {
      await transaction
        .update(demoEnvironment)
        .set({
          state: "terminating",
          stateVersion: environment.stateVersion + 1,
          endReason: reason,
        })
        .where(eq(demoEnvironment.id, environmentId));
    }
    await transaction
      .update(link)
      .set({ isActive: false, updatedAt: now })
      .where(eq(link.organizationId, environment.organizationId));
    await transaction.delete(session).where(eq(session.userId, environment.userId));
    return environment;
  });
  if (!terminating) return { status: "alreadyTerminated" as const };

  const finalized = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const [environment] = await transaction
      .select()
      .from(demoEnvironment)
      .where(eq(demoEnvironment.id, environmentId))
      .limit(1);
    if (!environment) return undefined;
    const finalizedReason = demoEndReasonSchema.parse(environment.endReason ?? reason);

    await transaction.insert(demoSummary).values({
      startedAt: environment.createdAt,
      endedAt: now,
      retainUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
      durationSeconds: Math.max(
        0,
        Math.floor((now.getTime() - environment.createdAt.getTime()) / 1_000),
      ),
      endReason: finalizedReason,
      documentCreatedCount: environment.documentLifetimeCount,
      vaultCreatedCount: environment.vaultLifetimeCount,
      linkCreatedCount: environment.linkLifetimeCount,
      documentActivityCount: environment.documentActivityCount,
      vaultActivityCount: environment.vaultActivityCount,
      linkActivityCount: environment.linkActivityCount,
      visitCount: environment.visitLifetimeCount,
      eventCount: environment.eventLifetimeCount,
      downloadCount: environment.downloadLifetimeCount,
      deliveredBytes: environment.deliveredBytes,
      peakDocumentCount: environment.documentCount,
      peakVaultCount: environment.vaultCount,
      peakLinkCount: environment.linkCount,
      peakConfirmedBytes: environment.confirmedBytes,
      refusalCount: environment.refusalCount,
      analyticsIncomplete: environment.analyticsIncomplete,
    });
    await transaction
      .update(demoGlobalUsage)
      .set({
        activeEnvironmentCount: sql`greatest(0, ${demoGlobalUsage.activeEnvironmentCount} - 1)`,
        confirmedBytes: sql`greatest(0, ${demoGlobalUsage.confirmedBytes} - ${environment.confirmedBytes + environment.reservedUploadBytes})`,
        pendingUploadCount: sql`greatest(0, ${demoGlobalUsage.pendingUploadCount} - ${environment.pendingUploadCount})`,
        confirmationCount: sql`greatest(0, ${demoGlobalUsage.confirmationCount} - ${environment.confirmationCount})`,
        updatedAt: now,
      })
      .where(eq(demoGlobalUsage.id, "demo-global"));
    await transaction.delete(organization).where(eq(organization.id, environment.organizationId));
    await transaction.delete(user).where(eq(user.id, environment.userId));
    return environment;
  });
  if (!finalized) return { status: "alreadyTerminated" as const };

  try {
    await removeDemoStorage(finalized.organizationId);
    return { status: "completed" as const, storageDeferred: false };
  } catch {
    return { status: "completed" as const, storageDeferred: true };
  }
}
