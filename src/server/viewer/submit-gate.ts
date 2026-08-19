import { randomBytes } from "node:crypto";

import { notFound } from "@tanstack/react-router";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

import { getEmailTransport } from "#/server/email";
import { getRedis } from "#/server/redis";
import { verifySharePassword } from "#/server/share-password-hash";
import { consumeCodeSendLimit } from "#/server/viewer/code-send-limit";
import {
  clearCredentialGuessLimit,
  consumeCredentialGuessLimit,
} from "#/server/viewer/credential-guess-limit";
import { consumeFormSubmissionLimit } from "#/server/viewer/form-submission-limit";
import {
  gateCodeIsExpired,
  gateCodeIsLocked,
  gateCodeResendAfterSeconds,
  gateCodeTtlSeconds,
  generateGateCode,
  hashGateCode,
  remainingGateCodeTries,
  verifyGateCode,
} from "#/server/viewer/gate-code";
import { currentGateRequirement } from "#/server/viewer/gate-requirement";
import {
  clearGateProgress,
  matchingGateProgress,
  readGateProgress,
  writeGateProgress,
  type GateProgressRecord,
} from "#/server/viewer/gate-progress";
import { liveVisitForLink, mintVisitorVisit, visitorRequestIp } from "#/server/viewer/mint-visit";
import {
  cookieOptions,
  gateProgressCookieName,
  gateProgressTtlSeconds,
  visitCookiePath,
} from "#/server/viewer/visit-cookies";
import { stashVisitorPage } from "#/server/viewer/visitor-page-stash";
import {
  findVisitorLink,
  gatePage,
  type GateRequirement,
  type VisitorLink,
} from "#/server/viewer/visitor-gate";

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function redirectToSlug(slug: string) {
  return new Response(null, { status: 303, headers: { location: `/v/${slug}` } });
}

function renderGate(
  link: VisitorLink,
  current: GateRequirement,
  progress: Awaited<ReturnType<typeof matchingGateProgress>>,
  extras: Parameters<typeof gatePage>[3] = {},
  status = 200,
  retryAfterSeconds?: number,
) {
  stashVisitorPage(gatePage(link, current, progress, extras));
  return { status, retryAfterSeconds } as const;
}

function normalizeCapturedEmail(value: string) {
  return value.trim().toLowerCase();
}

function blankCodeFields() {
  return {
    codeHash: null,
    codeAttempts: 0,
    codeSentAt: null,
    codeExpiresAt: null,
  } as const;
}

async function persistGateProgress(
  redis: Awaited<ReturnType<typeof getRedis>>,
  link: VisitorLink,
  record: Omit<GateProgressRecord, "linkId" | "gateVersion">,
) {
  const opaqueId = getCookie(gateProgressCookieName) ?? randomBytes(32).toString("base64url");
  await writeGateProgress(
    redis,
    opaqueId,
    { linkId: link.id, gateVersion: link.gateVersion, ...record },
    gateProgressTtlSeconds,
  );
  setCookie(
    gateProgressCookieName,
    opaqueId,
    cookieOptions(visitCookiePath(link.slug), gateProgressTtlSeconds),
  );
}

async function mintSatisfiedVisit(link: VisitorLink, email: string | null, emailVerified = false) {
  const minted = await mintVisitorVisit(link, { limitVisitCreation: false, email, emailVerified });
  if (minted.status === "rate_limited") {
    stashVisitorPage(minted);
    return { status: 429, retryAfterSeconds: minted.retryAfterSeconds } as const;
  }
  const gateOpaqueId = getCookie(gateProgressCookieName);
  if (gateOpaqueId) await clearGateProgress(await getRedis(), gateOpaqueId);
  return redirectToSlug(link.slug);
}

async function issueGateCode(
  redis: Awaited<ReturnType<typeof getRedis>>,
  link: VisitorLink,
  progress: Pick<
    GateProgressRecord,
    "password" | "email" | "codeHash" | "codeAttempts" | "codeSentAt" | "codeExpiresAt"
  >,
  email: string,
) {
  const limit = await consumeCodeSendLimit(redis, email, link.id);
  if (!limit.allowed) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const codeHash = progress.codeHash ?? (await hashGateCode(generateGateCode()));
    await persistGateProgress(redis, link, {
      password: progress.password === true,
      email,
      codeHash,
      codeAttempts: progress.codeHash ? progress.codeAttempts : 0,
      codeSentAt: nowSeconds,
      codeExpiresAt: progress.codeExpiresAt ?? nowSeconds + gateCodeTtlSeconds,
    });
    return;
  }

  const code = generateGateCode();
  const nowSeconds = Math.floor(Date.now() / 1000);
  await persistGateProgress(redis, link, {
    password: progress.password === true,
    email,
    codeHash: await hashGateCode(code),
    codeAttempts: 0,
    codeSentAt: nowSeconds,
    codeExpiresAt: nowSeconds + gateCodeTtlSeconds,
  });
  await getEmailTransport().send({
    to: email,
    subject: "Your share access code",
    text: `Your share access code is ${code}.`,
  });
}

export type VisitorGateSsr = Readonly<{
  status: number;
  retryAfterSeconds?: number;
}>;

export async function submitVisitorGate(slug: string): Promise<Response | VisitorGateSsr> {
  const link = await findVisitorLink(slug);
  if (!link) throw notFound();

  if (await liveVisitForLink(link)) return redirectToSlug(link.slug);

  const request = getRequest();
  const form = await request.formData();
  const step = formValue(form, "step");
  const password = formValue(form, "password");

  const redis = await getRedis();
  const progress = matchingGateProgress(
    link,
    await readGateProgress(redis, getCookie(gateProgressCookieName)),
  );
  const current = currentGateRequirement(link, progress);

  if (current === "satisfied") return redirectToSlug(link.slug);

  if (step === "email" && current === "email") {
    const ip = visitorRequestIp();
    const limit = await consumeFormSubmissionLimit(redis, link.id, ip);
    if (!limit.allowed) {
      return renderGate(
        link,
        "email",
        progress,
        { retryAfterSeconds: limit.retryAfterSeconds },
        429,
        limit.retryAfterSeconds,
      );
    }

    const email = normalizeCapturedEmail(formValue(form, "email"));
    if (!email) return renderGate(link, "email", progress);

    if (link.requiresVerification) {
      await issueGateCode(
        redis,
        link,
        {
          password: progress?.password === true,
          email,
          ...blankCodeFields(),
        },
        email,
      );
      return redirectToSlug(link.slug);
    }

    return mintSatisfiedVisit(link, email);
  }

  if (step === "resend" && current === "code") {
    const ip = visitorRequestIp();
    const limit = await consumeFormSubmissionLimit(redis, link.id, ip);
    if (!limit.allowed) {
      return renderGate(
        link,
        "code",
        progress,
        { retryAfterSeconds: limit.retryAfterSeconds },
        429,
        limit.retryAfterSeconds,
      );
    }

    const email = progress?.email;
    if (!progress || !email) return renderGate(link, "code", progress);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const cooldown = gateCodeResendAfterSeconds(progress.codeSentAt, nowSeconds);
    if (cooldown > 0) {
      return renderGate(link, "code", progress, { resendAfterSeconds: cooldown });
    }

    await issueGateCode(redis, link, progress, email);
    return redirectToSlug(link.slug);
  }

  if (step === "code" && current === "code") {
    const ip = visitorRequestIp();
    const submitted = formValue(form, "code").trim();
    const email = progress?.email;
    if (!progress || !email) return renderGate(link, "code", progress);

    const accepted =
      progress.codeHash !== null &&
      !gateCodeIsLocked(progress.codeAttempts) &&
      !gateCodeIsExpired(progress.codeExpiresAt, Math.floor(Date.now() / 1000)) &&
      submitted.length === 6 &&
      (await verifyGateCode(progress.codeHash, submitted));

    if (accepted) {
      await clearCredentialGuessLimit(redis, link.id, ip);
      return mintSatisfiedVisit(link, email, true);
    }

    const limit = await consumeCredentialGuessLimit(redis, link.id, ip);
    if (!limit.allowed) {
      return renderGate(
        link,
        "code",
        progress,
        { retryAfterSeconds: limit.retryAfterSeconds },
        429,
        limit.retryAfterSeconds,
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (gateCodeIsLocked(progress.codeAttempts)) {
      return renderGate(link, "code", progress, { error: "locked_code" });
    }
    if (gateCodeIsExpired(progress.codeExpiresAt, nowSeconds)) {
      return renderGate(link, "code", progress, { error: "expired_code" });
    }

    const nextAttempts = progress.codeAttempts + 1;
    const nextProgress = { ...progress, email, codeAttempts: nextAttempts };
    await persistGateProgress(redis, link, nextProgress);
    if (gateCodeIsLocked(nextAttempts)) {
      return renderGate(link, "code", nextProgress, { error: "locked_code", remainingTries: 0 });
    }
    return renderGate(link, "code", nextProgress, {
      error: "wrong_code",
      remainingTries: remainingGateCodeTries(nextAttempts),
    });
  }

  if (step !== "password" || current !== "password") {
    return renderGate(link, current, progress);
  }

  const ip = visitorRequestIp();
  const hash = link.passwordHash;
  const accepted = hash !== null && (await verifySharePassword(hash, password));
  if (accepted) {
    await clearCredentialGuessLimit(redis, link.id, ip);
    const remaining = currentGateRequirement(link, { password: true, email: null });
    if (remaining !== "satisfied") {
      await persistGateProgress(redis, link, {
        password: true,
        email: null,
        ...blankCodeFields(),
      });
      return redirectToSlug(link.slug);
    }

    return mintSatisfiedVisit(link, null);
  }

  const limit = await consumeCredentialGuessLimit(redis, link.id, ip);
  if (!limit.allowed) {
    return renderGate(
      link,
      "password",
      progress,
      { retryAfterSeconds: limit.retryAfterSeconds },
      429,
      limit.retryAfterSeconds,
    );
  }

  return renderGate(link, "password", progress, { error: "wrong_password" });
}
