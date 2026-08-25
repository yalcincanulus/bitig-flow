import { and, eq } from "drizzle-orm";

import { hasRequirements } from "#/lib/link-trust";
import { demoEnvironmentStateSchema } from "#/lib/demo-operations";
import { db } from "#/server/db/client";
import {
  demoEnvironment,
  deploymentPolicy,
  document,
  link,
  member,
  organization,
  user,
  vault,
} from "#/server/db/schema";
import {
  documentIdSchema,
  linkIdSchema,
  vaultIdSchema,
  type DocumentId,
  type LinkId,
  type VaultId,
} from "#/server/ids";
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

export type DemoViewerContext = Readonly<{
  environmentId: string;
  expiresAt: Date;
  state:
    | "provisioning"
    | "active"
    | "global_paused"
    | "report_paused"
    | "terminating"
    | "completed";
  policyPaused: boolean;
}>;

export type VisitorGatePage = Readonly<{
  status: "gate";
  slug: string;
  demo?: DemoViewerContext;
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

type VisitorContentShared = Readonly<{
  status: "content";
  senderName: string | null;
  organizationName: string;
  allowDownload: boolean;
  slug: string;
  demo?: DemoViewerContext;
  title: string;
  /** Set when this Document was opened from a Vault Link, so the Viewer can return to the index. */
  vaultTitle: string | null;
}>;

export type VisitorMarkdownContent = VisitorContentShared &
  Readonly<{
    kind: "markdown";
    documentId: DocumentId;
    html: string;
  }>;

export type VisitorPdfContent = VisitorContentShared &
  Readonly<{
    kind: "pdf";
    documentId: DocumentId;
    pageCount: number | null;
    fileName: string | null;
    bytesPending: boolean;
  }>;

export type VisitorImageContent = VisitorContentShared &
  Readonly<{
    kind: "image";
    documentId: DocumentId;
    fileName: string | null;
    bytesPending: boolean;
  }>;

export type VisitorVaultMember = Readonly<{
  documentId: DocumentId;
  title: string;
  kind: "markdown" | "pdf" | "image";
  status: "pending" | "ready";
}>;

export type VisitorVaultContent = VisitorContentShared &
  Readonly<{
    kind: "vault_index";
    members: ReadonlyArray<VisitorVaultMember>;
  }>;

export type VisitorContentPage =
  | VisitorMarkdownContent
  | VisitorPdfContent
  | VisitorImageContent
  | VisitorVaultContent;

export type VisitorRateLimitedPage = Readonly<{
  status: "rate_limited";
  slug: string;
  demo?: DemoViewerContext;
  senderName: string | null;
  organizationName: string;
  retryAfterSeconds: number;
}>;

export type VisitorUnavailablePage = Readonly<{
  status: "unavailable";
  reason: "expired" | "terminating" | "policy_paused" | "reported" | "viewing_limited";
  slug: string;
  demo: DemoViewerContext;
}>;

export type VisitorPage =
  | VisitorGatePage
  | VisitorContentPage
  | VisitorRateLimitedPage
  | VisitorUnavailablePage;

export type VisitorLink = Readonly<{
  id: LinkId;
  slug: string;
  senderName: string | null;
  organizationName: string;
  passwordHash: string | null;
  requiresPassword: boolean;
  requiresEmail: boolean;
  requiresVerification: boolean;
  isPublic: boolean;
  gateVersion: number;
  allowDownload: boolean;
  documentId: DocumentId | null;
  vaultId: VaultId | null;
  targetTitle: string;
  demo?: DemoViewerContext;
}>;

export function senderFields(link: { senderName: string | null; organizationName: string }) {
  return { senderName: link.senderName, organizationName: link.organizationName };
}

export { currentGateRequirement, gateReceipt } from "#/server/viewer/gate-requirement";

export function gatePage(
  link: Pick<
    VisitorLink,
    "slug" | "demo" | "senderName" | "organizationName" | "requiresVerification"
  >,
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
    slug: link.slug,
    ...(link.demo ? { demo: link.demo } : {}),
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
      senderMembershipId: member.id,
      organizationName: organization.name,
      passwordHash: link.passwordHash,
      requiresEmail: link.requiresEmail,
      requiresVerification: link.requiresVerification,
      gateVersion: link.gateVersion,
      allowDownload: link.allowDownload,
      expiresAt: link.expiresAt,
      isActive: link.isActive,
      documentId: document.id,
      documentTitle: document.title,
      vaultName: vault.name,
      vaultId: vault.id,
      demoEnvironmentId: demoEnvironment.id,
      demoExpiresAt: demoEnvironment.expiresAt,
      demoState: demoEnvironment.state,
    })
    .from(link)
    .innerJoin(organization, eq(organization.id, link.organizationId))
    .leftJoin(user, eq(user.id, link.createdBy))
    .leftJoin(
      member,
      and(eq(member.userId, link.createdBy), eq(member.organizationId, link.organizationId)),
    )
    .leftJoin(document, eq(document.id, link.documentId))
    .leftJoin(vault, eq(vault.id, link.vaultId))
    .leftJoin(demoEnvironment, eq(demoEnvironment.organizationId, link.organizationId))
    .where(eq(link.slug, slug))
    .limit(1);

  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt !== null && row.expiresAt <= now) return null;

  const targetTitle = row.documentTitle ?? row.vaultName;
  if (!targetTitle) return null;

  let demo: DemoViewerContext | undefined;
  if (row.demoEnvironmentId && row.demoExpiresAt && row.demoState) {
    const [policy] = await db
      .select({ pauseAllDemoAccess: deploymentPolicy.pauseAllDemoAccess })
      .from(deploymentPolicy)
      .where(eq(deploymentPolicy.id, "deployment"))
      .limit(1);
    demo = {
      environmentId: row.demoEnvironmentId,
      expiresAt: row.demoExpiresAt,
      state: demoEnvironmentStateSchema.parse(row.demoState),
      policyPaused: policy?.pauseAllDemoAccess ?? true,
    };
  }

  return {
    id: linkIdSchema.parse(row.id),
    slug: row.slug,
    senderName: row.senderMembershipId === null ? null : row.senderName,
    organizationName: row.organizationName,
    passwordHash: row.passwordHash,
    requiresPassword: row.passwordHash !== null,
    requiresEmail: row.requiresEmail,
    requiresVerification: row.requiresVerification,
    isPublic: !hasRequirements({
      passwordSet: row.passwordHash !== null,
      requiresEmail: row.requiresEmail,
      requiresVerification: row.requiresVerification,
    }),
    gateVersion: row.gateVersion,
    allowDownload: row.allowDownload,
    documentId: row.documentId ? documentIdSchema.parse(row.documentId) : null,
    vaultId: row.vaultId ? vaultIdSchema.parse(row.vaultId) : null,
    targetTitle,
    ...(demo ? { demo } : {}),
  };
}

export function unavailableDemoViewerPage(
  link: VisitorLink,
  now = new Date(),
): VisitorUnavailablePage | undefined {
  const demo = link.demo;
  if (!demo) return undefined;
  if (demo.expiresAt <= now || demo.state === "completed") {
    return { status: "unavailable", reason: "expired", slug: link.slug, demo };
  }
  if (demo.state === "terminating" || demo.state === "provisioning") {
    return { status: "unavailable", reason: "terminating", slug: link.slug, demo };
  }
  if (demo.state === "report_paused") {
    return { status: "unavailable", reason: "reported", slug: link.slug, demo };
  }
  if (demo.policyPaused || demo.state === "global_paused") {
    return { status: "unavailable", reason: "policy_paused", slug: link.slug, demo };
  }
  return undefined;
}
