import { randomBytes } from "node:crypto";

import { notFound } from "@tanstack/react-router";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

import { getRedis } from "#/server/redis";
import { verifySharePassword } from "#/server/share-password-hash";
import {
  clearCredentialGuessLimit,
  consumeCredentialGuessLimit,
} from "#/server/viewer/credential-guess-limit";
import { currentGateRequirement } from "#/server/viewer/gate-requirement";
import {
  clearGateProgress,
  matchingGateProgress,
  readGateProgress,
  writeGateProgress,
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

export type VisitorPasswordSsr = Readonly<{
  status: number;
  retryAfterSeconds?: number;
}>;

export async function submitVisitorPassword(slug: string): Promise<Response | VisitorPasswordSsr> {
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

  if (step !== "password" || current !== "password") {
    return renderGate(link, current, progress);
  }

  const ip = visitorRequestIp();
  const hash = link.passwordHash;
  const accepted = hash !== null && (await verifySharePassword(hash, password));
  if (accepted) {
    await clearCredentialGuessLimit(redis, link.id, ip);
    const remaining = currentGateRequirement(link, { password: true });
    if (remaining !== "satisfied") {
      const opaqueId = getCookie(gateProgressCookieName) ?? randomBytes(32).toString("base64url");
      await writeGateProgress(
        redis,
        opaqueId,
        { linkId: link.id, gateVersion: link.gateVersion, password: true },
        gateProgressTtlSeconds,
      );
      setCookie(
        gateProgressCookieName,
        opaqueId,
        cookieOptions(visitCookiePath(link.slug), gateProgressTtlSeconds),
      );
      return redirectToSlug(link.slug);
    }

    const gateOpaqueId = getCookie(gateProgressCookieName);
    if (gateOpaqueId) await clearGateProgress(redis, gateOpaqueId);
    await mintVisitorVisit(link, { limitVisitCreation: false });
    return redirectToSlug(link.slug);
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
