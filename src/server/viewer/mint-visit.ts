import { randomBytes } from "node:crypto";

import { getCookie, getRequest, getRequestIP, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { hashAnalyticsValue } from "#/server/analytics-hash";
import { getClientIp } from "#/server/client-ip";
import { db } from "#/server/db/client";
import { visit as visitTable } from "#/server/db/schema";
import { getRedis } from "#/server/redis";
import { requiredEnv, trustedProxyCount } from "#/server/runtime-env";
import { readLiveVisitRecord, writeLiveVisitRecord } from "#/server/viewer/live-visit-record";
import { consumeVisitCreationLimit } from "#/server/viewer/visit-creation-limit";
import {
  cookieOptions,
  visitCookieName,
  visitCookiePath,
  visitTtlSeconds,
  visitorIdCookieName,
  visitorIdCookiePath,
  visitorIdTtlSeconds,
} from "#/server/viewer/visit-cookies";
import { revealPage, type VisitorLink, type VisitorPage } from "#/server/viewer/visitor-gate";

export function visitorRequestIp() {
  const request = getRequest();
  return getClientIp({
    headers: request.headers,
    trustedProxyCount: trustedProxyCount(),
    socketAddress: getRequestIP(),
  });
}

export async function liveVisitForLink(link: Pick<VisitorLink, "id" | "gateVersion">) {
  const opaqueId = getCookie(visitCookieName);
  if (!opaqueId) return null;
  const redis = await getRedis();
  const live = await readLiveVisitRecord(redis, opaqueId);
  if (!live || live.linkId !== link.id || live.gateVersion !== link.gateVersion) return null;

  const [row] = await db
    .select({ expiresAt: visitTable.expiresAt })
    .from(visitTable)
    .where(eq(visitTable.id, live.visitId))
    .limit(1);

  if (!row || row.expiresAt <= new Date()) return null;
  return live;
}

export async function mintVisitorVisit(
  link: VisitorLink,
  options: { limitVisitCreation?: boolean; email?: string | null; emailVerified?: boolean } = {},
): Promise<VisitorPage> {
  const request = getRequest();
  const redis = await getRedis();
  const ip = visitorRequestIp();
  if (options.limitVisitCreation !== false) {
    const limit = await consumeVisitCreationLimit(redis, ip);
    if (!limit.allowed) {
      return {
        status: "rate_limited",
        senderName: link.senderName,
        organizationName: link.organizationName,
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }
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
      email: options.email ?? null,
      emailVerified: options.emailVerified === true,
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
}
