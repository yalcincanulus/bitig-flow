import { redisCall } from "#/server/redis";

export type GateProgressRecord = Readonly<{
  linkId: string;
  gateVersion: number;
  password: boolean;
  email: string | null;
}>;

type RedisKeyValue = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

export function matchingGateProgress(
  link: { id: string; gateVersion: number },
  progress: GateProgressRecord | null,
) {
  if (!progress || progress.linkId !== link.id || progress.gateVersion !== link.gateVersion) {
    return null;
  }
  return progress;
}

export function gateProgressRecordKey(opaqueId: string) {
  return `gate:progress:${opaqueId}`;
}

export async function readGateProgress(
  redis: Pick<RedisKeyValue, "get">,
  opaqueId: string | undefined,
): Promise<GateProgressRecord | null> {
  if (!opaqueId) return null;
  const raw = await redisCall(() => redis.get(gateProgressRecordKey(opaqueId)));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      link_id?: unknown;
      gate_version?: unknown;
      password?: unknown;
      email?: unknown;
    };
    if (typeof parsed.link_id !== "string" || typeof parsed.gate_version !== "number") {
      return null;
    }
    return {
      linkId: parsed.link_id,
      gateVersion: parsed.gate_version,
      password: parsed.password === true,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return null;
  }
}

export async function writeGateProgress(
  redis: Pick<RedisKeyValue, "set">,
  opaqueId: string,
  record: GateProgressRecord,
  ttlSeconds: number,
) {
  await redisCall(() =>
    redis.set(
      gateProgressRecordKey(opaqueId),
      JSON.stringify({
        link_id: record.linkId,
        gate_version: record.gateVersion,
        password: record.password,
        email: record.email,
      }),
      { EX: ttlSeconds },
    ),
  );
}

export async function clearGateProgress(redis: Pick<RedisKeyValue, "del">, opaqueId: string) {
  await redisCall(() => redis.del(gateProgressRecordKey(opaqueId)));
}
