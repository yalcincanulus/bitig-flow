import { maintenanceFreshness } from "#/lib/demo-operations";
import type { RuntimeCapabilities } from "#/lib/deployment-policy";
import { mailCapabilityAvailable } from "#/server/email-config";
import { getRedis } from "#/server/redis";
import {
  databaseCapabilityHealthy,
  latestMaintenanceObservation,
} from "#/server/repositories/maintenance-runs";
import { trustedProxyCount } from "#/server/runtime-env";
import { storageCapabilityHealthy } from "#/server/storage";

function localOrSecureAuthUrl() {
  try {
    const url = new URL(process.env.BETTER_AUTH_URL ?? "");
    return url.protocol === "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function redisHealthy() {
  try {
    return (await (await getRedis()).ping()) === "PONG";
  } catch {
    return false;
  }
}

export async function deploymentRuntimeCapabilities(
  operatorEnrolled: boolean,
  now = new Date(),
): Promise<RuntimeCapabilities> {
  let trustedProxy = false;
  try {
    trustedProxyCount();
    trustedProxy = true;
  } catch {
    trustedProxy = false;
  }
  const [database, redis, storage, reaper, sweep] = await Promise.all([
    databaseCapabilityHealthy(),
    redisHealthy(),
    storageCapabilityHealthy(),
    latestMaintenanceObservation("reaper"),
    latestMaintenanceObservation("sweep"),
  ]);
  const mail = mailCapabilityAvailable();
  const secureTransport = localOrSecureAuthUrl();

  return {
    database,
    redis,
    storage,
    reaperFresh: maintenanceFreshness(reaper, now, 30 * 60 * 1_000),
    sweepFresh: maintenanceFreshness(sweep, now, 48 * 60 * 60 * 1_000),
    trustedProxy,
    secureTransport,
    secureCookies: secureTransport,
    operatorEnrolled,
    mail,
    recovery: mail,
  };
}
