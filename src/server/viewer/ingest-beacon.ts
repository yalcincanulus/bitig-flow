import { getCookie } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "#/server/db/client";
import { demoEnvironment, link, visit as visitTable, visitEvent } from "#/server/db/schema";
import { documentIdSchema, linkIdSchema, visitIdSchema } from "#/server/ids";
import { getRedis, redisCall } from "#/server/redis";
import { consumeBeaconLimit } from "#/server/viewer/beacon-limit";
import { readLiveVisitRecord } from "#/server/viewer/live-visit-record";
import { isDocumentReachableFromLink } from "#/server/viewer/reachability";
import { visitCookieName } from "#/server/viewer/visit-cookies";
import { consumeDemoAnalyticsBudget } from "#/server/demo-policy";
import { rollbackDemoBudgets } from "#/server/repositories/demo-environments";

export const pageDwellCapMs = 30 * 60 * 1000;
export const beaconDedupeTtlSeconds = 5 * 60;

const beaconBodySchema = z.object({
  documents: z.record(z.string(), z.record(z.string(), z.number().finite().nonnegative())),
  seq: z.number().int().nonnegative(),
  nonce: z.string().min(1),
});

const pageDwellPayloadSchema = z.object({
  page: z.number(),
  ms: z.number(),
});

export function beaconDedupeKey(visitId: string, nonce: string, seq: number) {
  return `beacon:${visitId}:${nonce}:${seq}`;
}

function emptyBeaconResponse() {
  return new Response(null, { status: 204 });
}

function dwellPages(pages: Record<string, number>) {
  const result: Array<{ page: number; ms: number }> = [];
  for (const [key, reported] of Object.entries(pages)) {
    if (!/^[1-9]\d*$/.test(key)) continue;
    const ms = Math.floor(reported);
    if (ms <= 0) continue;
    result.push({ page: Number(key), ms });
  }
  return result;
}

async function liveVisitFromCookie() {
  const opaqueId = getCookie(visitCookieName);
  if (!opaqueId) return null;

  const redis = await getRedis();
  const live = await readLiveVisitRecord(redis, opaqueId);
  if (!live) return null;
  if (live.visitId === null) return null;

  const linkId = linkIdSchema.safeParse(live.linkId);
  const visitId = visitIdSchema.safeParse(live.visitId);
  if (!linkId.success || !visitId.success) return null;

  const now = new Date();
  const [linkRow] = await db
    .select({
      gateVersion: link.gateVersion,
      isActive: link.isActive,
      expiresAt: link.expiresAt,
      organizationId: link.organizationId,
    })
    .from(link)
    .where(eq(link.id, linkId.data))
    .limit(1);

  if (!linkRow || !linkRow.isActive) return null;
  if (linkRow.expiresAt !== null && linkRow.expiresAt <= now) return null;
  if (live.gateVersion !== linkRow.gateVersion) return null;

  const [visitRow] = await db
    .select({
      expiresAt: visitTable.expiresAt,
    })
    .from(visitTable)
    .where(eq(visitTable.id, visitId.data))
    .limit(1);

  if (!visitRow || visitRow.expiresAt <= now) return null;
  const [demo] = await db
    .select({ environmentId: demoEnvironment.id })
    .from(demoEnvironment)
    .where(eq(demoEnvironment.organizationId, linkRow.organizationId))
    .limit(1);
  return {
    visitId: visitId.data,
    linkId: linkId.data,
    redis,
    demoEnvironmentId: demo?.environmentId,
  };
}

function existingDwellMs(
  rows: ReadonlyArray<{ documentId: string | null; payload: unknown }>,
  documentId: string,
  page: number,
) {
  let total = 0;
  for (const row of rows) {
    if (row.documentId !== documentId) continue;
    const payload = pageDwellPayloadSchema.safeParse(row.payload);
    if (!payload.success || payload.data.page !== page) continue;
    total += payload.data.ms;
  }
  return total;
}

export async function ingestBeacon(request: Request) {
  let parsed: z.infer<typeof beaconBodySchema>;
  try {
    parsed = beaconBodySchema.parse(JSON.parse(await request.text()));
  } catch {
    return emptyBeaconResponse();
  }

  const live = await liveVisitFromCookie();
  if (!live) return emptyBeaconResponse();

  const limit = await consumeBeaconLimit(live.redis, live.visitId, live.linkId);
  if (!limit.allowed) return emptyBeaconResponse();

  const claimed = await redisCall(() =>
    live.redis.set(beaconDedupeKey(live.visitId, parsed.nonce, parsed.seq), "1", {
      NX: true,
      EX: beaconDedupeTtlSeconds,
    }),
  );
  if (claimed === null) return emptyBeaconResponse();

  const now = new Date();
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        documentId: visitEvent.documentId,
        payload: visitEvent.payload,
      })
      .from(visitEvent)
      .where(and(eq(visitEvent.visitId, live.visitId), eq(visitEvent.type, "page_dwell")));

    const rows = [];
    let accepted = false;
    for (const [rawDocumentId, pages] of Object.entries(parsed.documents)) {
      const documentId = documentIdSchema.safeParse(rawDocumentId);
      if (!documentId.success) continue;
      const reported = dwellPages(pages);
      if (reported.length === 0) continue;
      if (!(await isDocumentReachableFromLink(live.linkId, documentId.data))) continue;
      accepted = true;

      for (const dwell of reported) {
        const remaining = Math.max(
          0,
          Math.min(
            dwell.ms,
            pageDwellCapMs - existingDwellMs(existing, documentId.data, dwell.page),
          ),
        );
        if (remaining <= 0) continue;
        rows.push({
          visitId: live.visitId,
          documentId: documentId.data,
          type: "page_dwell" as const,
          payload: { page: dwell.page, ms: remaining },
          occurredAt: now,
        });
      }
    }

    if (rows.length > 0) {
      const recordsEvents = await consumeDemoAnalyticsBudget(
        live.demoEnvironmentId,
        "event",
        rows.length,
      );
      if (recordsEvents) {
        try {
          await tx.insert(visitEvent).values(rows);
        } catch (error) {
          if (live.demoEnvironmentId) {
            await rollbackDemoBudgets(live.demoEnvironmentId, [
              { kind: "event", amount: rows.length },
            ]);
          }
          throw error;
        }
      }
    }
    if (accepted) {
      await tx.update(visitTable).set({ lastSeenAt: now }).where(eq(visitTable.id, live.visitId));
    }
  });

  return emptyBeaconResponse();
}
