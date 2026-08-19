import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { mintLinkSlug } from "#/lib/link-slug";
import { db } from "#/server/db/client";
import { document, link, vault } from "#/server/db/schema";
import type { DocumentId, LinkId, OrganizationId, UserId, VaultId } from "#/server/ids";

export type SyncedLink = Omit<typeof link.$inferSelect, "passwordHash"> & {
  passwordSet: boolean;
};

type LinkRow = typeof link.$inferSelect;

type DocumentTarget = Readonly<{ documentId: DocumentId }>;
type VaultTarget = Readonly<{ vaultId: VaultId }>;
type LinkTarget = DocumentTarget | VaultTarget;

export type NewLink = LinkTarget &
  Readonly<{
    id: LinkId;
    name: string | null;
    passwordHash: string | null;
    requiresEmail: boolean;
    requiresVerification: boolean;
    allowDownload: boolean;
    expiresAt: Date | null;
    createdBy: UserId;
  }>;

export type LinkChanges = Readonly<{
  name: string | null;
  passwordHash?: string | null;
  requiresEmail: boolean;
  requiresVerification: boolean;
  allowDownload: boolean;
  expiresAt: Date | null;
  isActive: boolean;
}>;

export type OwnedTarget =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "ready"; documentId: DocumentId | null; vaultId: VaultId | null }>;

function toSyncedLink(row: LinkRow): SyncedLink {
  const { passwordHash, ...publicRow } = row;
  return { ...publicRow, passwordSet: passwordHash !== null };
}

function isSlugUniqueViolation(error: unknown) {
  let current = error;
  while (typeof current === "object" && current !== null) {
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      current.constraint === "link_slug_uidx"
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export async function listLinks(orgId: OrganizationId): Promise<SyncedLink[]> {
  const rows = await db
    .select()
    .from(link)
    .where(eq(link.organizationId, orgId))
    .orderBy(desc(link.createdAt));

  return rows.map(toSyncedLink);
}

export async function resolveOwnedTarget(
  orgId: OrganizationId,
  target: LinkTarget,
): Promise<OwnedTarget> {
  if ("documentId" in target) {
    const [found] = await db
      .select({ id: document.id, status: document.status })
      .from(document)
      .where(and(eq(document.organizationId, orgId), eq(document.id, target.documentId)))
      .limit(1);

    if (!found) return { kind: "missing" };
    if (found.status !== "ready") return { kind: "pending" };
    return { kind: "ready", documentId: found.id as DocumentId, vaultId: null };
  }

  const [found] = await db
    .select({ id: vault.id })
    .from(vault)
    .where(and(eq(vault.organizationId, orgId), eq(vault.id, target.vaultId)))
    .limit(1);

  if (!found) return { kind: "missing" };
  return { kind: "ready", documentId: null, vaultId: found.id as VaultId };
}

async function insertLink(orgId: OrganizationId, newLink: NewLink, slug: string) {
  const now = new Date();
  const [created] = await db
    .insert(link)
    .values({
      id: newLink.id,
      organizationId: orgId,
      documentId: "documentId" in newLink ? newLink.documentId : null,
      vaultId: "vaultId" in newLink ? newLink.vaultId : null,
      slug,
      name: newLink.name,
      passwordHash: newLink.passwordHash,
      requiresEmail: newLink.requiresEmail,
      requiresVerification: newLink.requiresVerification,
      gateVersion: 1,
      allowDownload: newLink.allowDownload,
      expiresAt: newLink.expiresAt,
      isActive: true,
      createdBy: newLink.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error("Link insert returned no row");
  return toSyncedLink(created);
}

export async function createLink(orgId: OrganizationId, newLink: NewLink) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = mintLinkSlug(randomBytes(12));
    try {
      return await insertLink(orgId, newLink, slug);
    } catch (error) {
      if (!isSlugUniqueViolation(error) || attempt === 7) throw error;
    }
  }

  throw new Error("Link insert returned no row");
}

function gateShouldBump(current: LinkRow, changes: LinkChanges) {
  const nextHash = changes.passwordHash;
  const passwordChanging = nextHash !== undefined && nextHash !== current.passwordHash;
  const emailChanging = changes.requiresEmail !== current.requiresEmail;
  const verificationChanging = changes.requiresVerification !== current.requiresVerification;
  return passwordChanging || emailChanging || verificationChanging;
}

export async function updateLink(orgId: OrganizationId, linkId: LinkId, changes: LinkChanges) {
  const [current] = await db
    .select()
    .from(link)
    .where(and(eq(link.organizationId, orgId), eq(link.id, linkId)))
    .limit(1);

  if (!current) return undefined;

  const [updated] = await db
    .update(link)
    .set({
      name: changes.name,
      ...(changes.passwordHash !== undefined ? { passwordHash: changes.passwordHash } : {}),
      requiresEmail: changes.requiresEmail,
      requiresVerification: changes.requiresVerification,
      allowDownload: changes.allowDownload,
      expiresAt: changes.expiresAt,
      isActive: changes.isActive,
      gateVersion: current.gateVersion + (gateShouldBump(current, changes) ? 1 : 0),
      updatedAt: new Date(),
    })
    .where(and(eq(link.organizationId, orgId), eq(link.id, linkId)))
    .returning();

  return updated ? toSyncedLink(updated) : undefined;
}

export async function rotateLinkSlug(orgId: OrganizationId, linkId: LinkId) {
  const [current] = await db
    .select({ id: link.id })
    .from(link)
    .where(and(eq(link.organizationId, orgId), eq(link.id, linkId)))
    .limit(1);

  if (!current) return undefined;

  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = mintLinkSlug(randomBytes(12));
    try {
      const [updated] = await db
        .update(link)
        .set({ slug, updatedAt: new Date() })
        .where(and(eq(link.organizationId, orgId), eq(link.id, linkId)))
        .returning();

      if (!updated) return undefined;
      return toSyncedLink(updated);
    } catch (error) {
      if (!isSlugUniqueViolation(error) || attempt === 7) throw error;
    }
  }

  throw new Error("Link slug rotate returned no row");
}

export async function deleteLink(orgId: OrganizationId, linkId: LinkId) {
  const [deleted] = await db
    .delete(link)
    .where(and(eq(link.organizationId, orgId), eq(link.id, linkId)))
    .returning();

  return deleted ? toSyncedLink(deleted) : undefined;
}
