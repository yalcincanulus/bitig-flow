import { redisCall } from "#/server/redis";

export type GateProgressRecord = Readonly<{
  linkId: string;
  gateVersion: number;
  password: boolean;
  email: string | null;
  codeHash: string | null;
  codeAttempts: number;
  codeSentAt: number | null;
  codeExpiresAt: number | null;
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

function optionalUnix(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
      code_hash?: unknown;
      code_attempts?: unknown;
      code_sent_at?: unknown;
      code_expires_at?: unknown;
    };
    if (typeof parsed.link_id !== "string" || typeof parsed.gate_version !== "number") {
      return null;
    }
    return {
      linkId: parsed.link_id,
      gateVersion: parsed.gate_version,
      password: parsed.password === true,
      email: typeof parsed.email === "string" ? parsed.email : null,
      codeHash: typeof parsed.code_hash === "string" ? parsed.code_hash : null,
      codeAttempts: typeof parsed.code_attempts === "number" ? parsed.code_attempts : 0,
      codeSentAt: optionalUnix(parsed.code_sent_at),
      codeExpiresAt: optionalUnix(parsed.code_expires_at),
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
        code_hash: record.codeHash,
        code_attempts: record.codeAttempts,
        code_sent_at: record.codeSentAt,
        code_expires_at: record.codeExpiresAt,
      }),
      { EX: ttlSeconds },
    ),
  );
}

export async function clearGateProgress(redis: Pick<RedisKeyValue, "del">, opaqueId: string) {
  await redisCall(() => redis.del(gateProgressRecordKey(opaqueId)));
}
