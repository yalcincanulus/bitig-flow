import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";

import { sharePasswordRefusal } from "#/lib/share-password";
import { orgMiddleware, permission } from "#/server/auth-middleware";
import { documentIdSchema, linkIdSchema, userIdSchema, vaultIdSchema } from "#/server/ids";
import {
  createLink as createLinkInRepository,
  deleteLink as deleteLinkInRepository,
  listLinks as listLinksFromRepository,
  resolveOwnedTarget,
  rotateLinkSlug as rotateLinkSlugInRepository,
  updateLink as updateLinkInRepository,
  type NewLink,
} from "#/server/repositories/links";
import { hashSharePassword } from "#/server/share-password-hash";
import {
  refuseDemoFeature,
  releaseFailedDemoBudget,
  reserveDemoBudgetOrThrow,
} from "#/server/demo-policy";

const timestampSchema = z
  .union([z.date(), z.iso.datetime()])
  .transform((timestamp) => (typeof timestamp === "string" ? new Date(timestamp) : timestamp));

const gateFlagsSchema = z.object({
  requiresEmail: z.boolean(),
  requiresVerification: z.boolean(),
});

const createLinkSchema = gateFlagsSchema
  .extend({
    linkId: linkIdSchema,
    documentId: documentIdSchema.optional(),
    vaultId: vaultIdSchema.optional(),
    name: z.string().nullable().optional(),
    password: z.string().optional(),
    allowDownload: z.boolean(),
    expiresAt: timestampSchema.nullable(),
  })
  .refine((value) => Boolean(value.documentId) !== Boolean(value.vaultId), {
    message: "A Link targets a Document or a Vault.",
  });

const updateLinkSchema = gateFlagsSchema.extend({
  linkId: linkIdSchema,
  name: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  allowDownload: z.boolean(),
  expiresAt: timestampSchema.nullable(),
  isActive: z.boolean(),
});

const linkIdOnlySchema = z.object({ linkId: linkIdSchema });

export type SharePasswordError = Readonly<{
  name: "SharePasswordError";
  code: "SHARE_PASSWORD";
  reason: "too_short" | "organization_name" | "denied";
}>;

export type PendingTargetError = Readonly<{
  name: "PendingTargetError";
  code: "PENDING_TARGET";
}>;

export type InvalidGateError = Readonly<{
  name: "InvalidGateError";
  code: "INVALID_GATE";
}>;

export function isSharePasswordError(error: unknown): error is SharePasswordError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "SHARE_PASSWORD"
  );
}

export function isPendingTargetError(error: unknown): error is PendingTargetError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PENDING_TARGET"
  );
}

export function isInvalidGateError(error: unknown): error is InvalidGateError {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "INVALID_GATE"
  );
}

function sharePasswordError(reason: SharePasswordError["reason"]): SharePasswordError {
  return { name: "SharePasswordError", code: "SHARE_PASSWORD", reason };
}

function pendingTargetError(): PendingTargetError {
  return { name: "PendingTargetError", code: "PENDING_TARGET" };
}

function invalidGateError(): InvalidGateError {
  return { name: "InvalidGateError", code: "INVALID_GATE" };
}

function authoredName(name: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

function refuseVerificationWithoutEmail(requiresEmail: boolean, requiresVerification: boolean) {
  if (requiresVerification && !requiresEmail) {
    setResponseStatus(422);
    throw invalidGateError();
  }
}

async function hashedSharePassword(password: string | undefined, organizationName: string) {
  if (password === undefined) return undefined;
  const reason = sharePasswordRefusal(password, organizationName);
  if (reason) {
    setResponseStatus(422);
    throw sharePasswordError(reason);
  }
  return hashSharePassword(password);
}

export const listLinks = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => listLinksFromRepository(context.orgId));

export const createLink = createServerFn({ method: "POST" })
  .middleware([permission({ link: ["create"] })])
  .validator(createLinkSchema)
  .handler(async ({ context, data }) => {
    if (data.requiresEmail || data.requiresVerification) {
      refuseDemoFeature(context.demoEnvironmentId);
    }
    refuseVerificationWithoutEmail(data.requiresEmail, data.requiresVerification);

    const target = data.documentId ? { documentId: data.documentId } : { vaultId: data.vaultId! };
    const owned = await resolveOwnedTarget(context.orgId, target);
    if (owned.kind === "missing") throw notFound();
    if (owned.kind === "pending") {
      setResponseStatus(422);
      throw pendingTargetError();
    }

    const passwordHash =
      (await hashedSharePassword(data.password, context.organization.name)) ?? null;
    const newLink = {
      id: data.linkId,
      name: authoredName(data.name),
      passwordHash,
      requiresEmail: data.requiresEmail,
      requiresVerification: data.requiresVerification,
      allowDownload: data.allowDownload,
      expiresAt: data.expiresAt,
      createdBy: userIdSchema.parse(context.userId),
      ...(owned.documentId ? { documentId: owned.documentId } : { vaultId: owned.vaultId! }),
    } satisfies NewLink;

    await reserveDemoBudgetOrThrow(context.demoEnvironmentId, "link");
    try {
      return await createLinkInRepository(context.orgId, newLink);
    } catch (error) {
      await releaseFailedDemoBudget(context.demoEnvironmentId, "link");
      throw error;
    }
  });

export const updateLink = createServerFn({ method: "POST" })
  .middleware([permission({ link: ["update"] })])
  .validator(updateLinkSchema)
  .handler(async ({ context, data }) => {
    if (data.requiresEmail || data.requiresVerification) {
      refuseDemoFeature(context.demoEnvironmentId);
    }
    refuseVerificationWithoutEmail(data.requiresEmail, data.requiresVerification);

    let passwordHash: string | null | undefined;
    if (data.password === undefined) {
      passwordHash = undefined;
    } else if (data.password === null) {
      passwordHash = null;
    } else {
      passwordHash = await hashedSharePassword(data.password, context.organization.name);
    }

    const updated = await updateLinkInRepository(context.orgId, data.linkId, {
      name: authoredName(data.name),
      passwordHash,
      requiresEmail: data.requiresEmail,
      requiresVerification: data.requiresVerification,
      allowDownload: data.allowDownload,
      expiresAt: data.expiresAt,
      isActive: data.isActive,
    });
    if (!updated) throw notFound();
    return updated;
  });

export const rotateLinkSlug = createServerFn({ method: "POST" })
  .middleware([permission({ link: ["update"] })])
  .validator(linkIdOnlySchema)
  .handler(async ({ context, data }) => {
    const rotated = await rotateLinkSlugInRepository(context.orgId, data.linkId);
    if (!rotated) throw notFound();
    return rotated;
  });

export const deleteLink = createServerFn({ method: "POST" })
  .middleware([permission({ link: ["delete"] })])
  .validator(linkIdOnlySchema)
  .handler(async ({ context, data }) => {
    const deleted = await deleteLinkInRepository(context.orgId, data.linkId);
    if (!deleted) throw notFound();
    await releaseFailedDemoBudget(context.demoEnvironmentId, "link");
    return deleted;
  });
