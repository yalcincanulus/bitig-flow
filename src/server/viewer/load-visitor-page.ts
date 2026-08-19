import { randomBytes } from "node:crypto";

import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequest,
  getRequestIP,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";
import { z } from "zod";

import { hashAnalyticsValue } from "#/server/analytics-hash";
import { getClientIp } from "#/server/client-ip";
import { db } from "#/server/db/client";
import { visit as visitTable } from "#/server/db/schema";
import { getRedis } from "#/server/redis";
import { requiredEnv, trustedProxyCount } from "#/server/runtime-env";
import { readLiveVisitRecord, writeLiveVisitRecord } from "#/server/viewer/live-visit-record";
import { consumeVisitCreationLimit } from "#/server/viewer/visit-creation-limit";
import {
  visitCookieName,
  visitCookiePath,
  visitTtlSeconds,
  visitorIdCookieName,
  visitorIdCookiePath,
  visitorIdTtlSeconds,
} from "#/server/viewer/visit-cookies";
import { findVisitorLink, type VisitorPage } from "#/server/viewer/visitor-gate";

function cookieOptions(path: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path,
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

function senderFields(link: { senderName: string | null; organizationName: string }) {
  return { senderName: link.senderName, organizationName: link.organizationName };
}

function revealPage(link: {
  senderName: string | null;
  organizationName: string;
  targetTitle: string;
  emptyVault: boolean;
}): VisitorPage {
  return {
    status: "reveal",
    ...senderFields(link),
    targetTitle: link.targetTitle,
    emptyVault: link.emptyVault,
  };
}

export const loadVisitorPage = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<VisitorPage> => {
    const link = await findVisitorLink(data.slug);
    if (!link) throw notFound();

    if (!link.isPublic) {
      return {
        status: "gate",
        ...senderFields(link),
        requiresPassword: link.requiresPassword,
      };
    }

    const request = getRequest();
    const redis = await getRedis();
    const opaqueId = getCookie(visitCookieName);
    if (opaqueId) {
      const live = await readLiveVisitRecord(redis, opaqueId);
      if (live && live.linkId === link.id && live.gateVersion === link.gateVersion) {
        return revealPage(link);
      }
    }

    const ip = getClientIp({
      headers: request.headers,
      trustedProxyCount: trustedProxyCount(),
      socketAddress: getRequestIP(),
    });
    const limit = await consumeVisitCreationLimit(redis, ip);
    if (!limit.allowed) {
      setResponseStatus(429);
      setResponseHeader("Retry-After", String(limit.retryAfterSeconds));
      return {
        status: "rate_limited",
        ...senderFields(link),
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }

    const visitorId = getCookie(visitorIdCookieName) ?? randomBytes(16).toString("base64url");
    const visitOpaqueId = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + visitTtlSeconds * 1000);

    const [created] = await db
      .insert(visitTable)
      .values({
        linkId: link.id,
        visitorId,
        gateVersion: link.gateVersion,
        startedAt: now,
        lastSeenAt: now,
        expiresAt,
        userAgent: request.headers.get("user-agent"),
        ipHash: hashAnalyticsValue(requiredEnv("ANALYTICS_SALT"), ip),
      })
      .returning({ id: visitTable.id });

    if (!created) throw new Error("Visit insert returned no row");

    await writeLiveVisitRecord(
      redis,
      visitOpaqueId,
      { visitId: created.id, linkId: link.id, gateVersion: link.gateVersion },
      visitTtlSeconds,
    );

    setCookie(
      visitCookieName,
      visitOpaqueId,
      cookieOptions(visitCookiePath(link.slug), visitTtlSeconds),
    );
    if (!getCookie(visitorIdCookieName)) {
      setCookie(
        visitorIdCookieName,
        visitorId,
        cookieOptions(visitorIdCookiePath, visitorIdTtlSeconds),
      );
    }

    return revealPage(link);
  });
