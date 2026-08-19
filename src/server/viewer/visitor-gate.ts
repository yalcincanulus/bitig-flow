import { count, eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document, link, organization, user, vault, vaultItem } from "#/server/db/schema";
import { gateCodeResendAfterSeconds } from "#/server/viewer/gate-code";
import type { GateProgressRecord } from "#/server/viewer/gate-progress";
import {
  capturedEmail,
  gateReceipt,
  type GateReceiptItem,
  type GateRequirement,
} from "#/server/viewer/gate-requirement";
import { maskCapturedEmail } from "#/server/viewer/mask-email";

export type { GateReceiptItem, GateRequirement };

export type VisitorGatePage = Readonly<{
  status: "gate";
  senderName: string | null;
  organizationName: string;
  currentRequirement: GateRequirement;
  requiresVerification: boolean;
  receipt: ReadonlyArray<GateReceiptItem>;
  maskedEmail?: string;
  remainingTries?: number;
  resendAfterSeconds?: number;
  error?: "wrong_password" | "wrong_code" | "expired_code" | "locked_code";
  retryAfterSeconds?: number;
}>;

export type VisitorRevealPage = Readonly<{
  status: "reveal";
  senderName: string | null;
  organizationName: string;
  targetTitle: string;
  emptyVault: boolean;
}>;

export type VisitorRateLimitedPage = Readonly<{
  status: "rate_limited";
  senderName: string | null;
  organizationName: string;
  retryAfterSeconds: number;
}>;

export type VisitorPage = VisitorGatePage | VisitorRevealPage | VisitorRateLimitedPage;

export type VisitorLink = Readonly<{
  id: string;
  slug: string;
  senderName: string | null;
  organizationName: string;
  passwordHash: string | null;
  requiresPassword: boolean;
  requiresEmail: boolean;
  requiresVerification: boolean;
  isPublic: boolean;
  gateVersion: number;
  targetTitle: string;
  emptyVault: boolean;
}>;

export function senderFields(link: { senderName: string | null; organizationName: string }) {
  return { senderName: link.senderName, organizationName: link.organizationName };
}

export function revealPage(link: {
  senderName: string | null;
  organizationName: string;
  targetTitle: string;
  emptyVault: boolean;
}): VisitorRevealPage {
  return {
    status: "reveal",
    ...senderFields(link),
    targetTitle: link.targetTitle,
    emptyVault: link.emptyVault,
  };
}

export { currentGateRequirement, gateReceipt } from "#/server/viewer/gate-requirement";

export function gatePage(
  link: Pick<VisitorLink, "senderName" | "organizationName" | "requiresVerification">,
  currentRequirement: GateRequirement,
  progress: Pick<
    GateProgressRecord,
    "password" | "email" | "codeAttempts" | "codeSentAt" | "codeExpiresAt"
  > | null,
  extras: Pick<
    VisitorGatePage,
    "error" | "retryAfterSeconds" | "remainingTries" | "resendAfterSeconds"
  > = {},
): VisitorGatePage {
  const address = capturedEmail(progress);
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    status: "gate",
    ...senderFields(link),
    currentRequirement,
    requiresVerification: link.requiresVerification,
    receipt: gateReceipt(progress),
    ...(currentRequirement === "code" && address
      ? {
          maskedEmail: maskCapturedEmail(address),
          resendAfterSeconds: gateCodeResendAfterSeconds(progress?.codeSentAt ?? null, nowSeconds),
        }
      : {}),
    ...extras,
  };
}

export async function findVisitorLink(slug: string): Promise<VisitorLink | null> {
  const now = new Date();
  const [row] = await db
    .select({
      id: link.id,
      slug: link.slug,
      senderName: user.name,
      organizationName: organization.name,
      passwordHash: link.passwordHash,
      requiresEmail: link.requiresEmail,
      requiresVerification: link.requiresVerification,
      gateVersion: link.gateVersion,
      expiresAt: link.expiresAt,
      isActive: link.isActive,
      documentTitle: document.title,
      vaultName: vault.name,
      vaultId: vault.id,
    })
    .from(link)
    .innerJoin(organization, eq(organization.id, link.organizationId))
    .leftJoin(user, eq(user.id, link.createdBy))
    .leftJoin(document, eq(document.id, link.documentId))
    .leftJoin(vault, eq(vault.id, link.vaultId))
    .where(eq(link.slug, slug))
    .limit(1);

  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt !== null && row.expiresAt <= now) return null;

  const targetTitle = row.documentTitle ?? row.vaultName;
  if (!targetTitle) return null;

  let emptyVault = false;
  if (row.vaultId) {
    const [membership] = await db
      .select({ total: count() })
      .from(vaultItem)
      .where(eq(vaultItem.vaultId, row.vaultId));
    emptyVault = Number(membership?.total ?? 0) === 0;
  }

  return {
    id: row.id,
    slug: row.slug,
    senderName: row.senderName,
    organizationName: row.organizationName,
    passwordHash: row.passwordHash,
    requiresPassword: row.passwordHash !== null,
    requiresEmail: row.requiresEmail,
    requiresVerification: row.requiresVerification,
    isPublic: row.passwordHash === null && !row.requiresEmail && !row.requiresVerification,
    gateVersion: row.gateVersion,
    targetTitle,
    emptyVault,
  };
}
