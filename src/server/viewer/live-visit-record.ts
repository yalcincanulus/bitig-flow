import { redisCall } from "#/server/redis";

export type LiveVisitRecord = Readonly<{
  visitId: string | null;
  linkId: string;
  gateVersion: number;
}>;

type RedisKeyValue = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
};

export function liveVisitRecordKey(opaqueId: string) {
  return `visit:live:${opaqueId}`;
}

export async function readLiveVisitRecord(
  redis: Pick<RedisKeyValue, "get">,
  opaqueId: string,
): Promise<LiveVisitRecord | null> {
  const raw = await redisCall(() => redis.get(liveVisitRecordKey(opaqueId)));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      visit_id?: unknown;
      link_id?: unknown;
      gate_version?: unknown;
    };
    if (
      (typeof parsed.visit_id !== "string" && parsed.visit_id !== null) ||
      typeof parsed.link_id !== "string" ||
      typeof parsed.gate_version !== "number"
    ) {
      return null;
    }
    return { visitId: parsed.visit_id, linkId: parsed.link_id, gateVersion: parsed.gate_version };
  } catch {
    return null;
  }
}

export async function writeLiveVisitRecord(
  redis: Pick<RedisKeyValue, "set">,
  opaqueId: string,
  record: LiveVisitRecord,
  ttlSeconds: number,
) {
  await redisCall(() =>
    redis.set(
      liveVisitRecordKey(opaqueId),
      JSON.stringify({
        visit_id: record.visitId,
        link_id: record.linkId,
        gate_version: record.gateVersion,
      }),
      { EX: ttlSeconds },
    ),
  );
}
