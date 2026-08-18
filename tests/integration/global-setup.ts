import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createClient } from "redis";

import {
  mailpitBaseUrl,
  required,
  testBaseUrl,
  testDatabaseName,
  testPort,
  testRedisIndex,
  testStorageKeyPrefix,
} from "./environment";

function deriveTestEnvironment(): NodeJS.ProcessEnv {
  const environment = parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8"));
  const databaseUrl = new URL(required(environment, "DATABASE_URL"));
  const developmentDatabaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (developmentDatabaseName === testDatabaseName) {
    throw new Error(`The development DATABASE_URL must not use ${testDatabaseName}`);
  }
  databaseUrl.pathname = `/${testDatabaseName}`;

  const redisUrl = new URL(required(environment, "REDIS_URL"));
  const developmentRedisIndex = Number(redisUrl.pathname.slice(1) || "0");
  if (developmentRedisIndex === Number(testRedisIndex)) {
    throw new Error(
      `The development REDIS_URL must not use the reserved test index ${testRedisIndex}`,
    );
  }
  redisUrl.pathname = `/${testRedisIndex}`;

  if ((environment.S3_KEY_PREFIX ?? "") === testStorageKeyPrefix) {
    throw new Error(
      `The development S3_KEY_PREFIX must not use the reserved test prefix ${testStorageKeyPrefix}`,
    );
  }

  return {
    ...environment,
    DATABASE_URL: databaseUrl.toString(),
    REDIS_URL: redisUrl.toString(),
    PORT: testPort,
    BETTER_AUTH_URL: testBaseUrl,
    S3_KEY_PREFIX: testStorageKeyPrefix,
  };
}

async function probeService(name: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (cause) {
    throw new Error(`${name} is unreachable — run pnpm infra:up and try again`, { cause });
  }
}

async function probeServices(environment: NodeJS.ProcessEnv) {
  const databaseUrl = new URL(required(environment, "DATABASE_URL"));
  databaseUrl.pathname = "/postgres";
  const postgres = new Pool({
    connectionString: databaseUrl.toString(),
    connectionTimeoutMillis: 1_000,
  });

  const redis = createClient({
    url: required(environment, "REDIS_URL"),
    socket: { connectTimeout: 1_000, reconnectStrategy: false },
  });
  redis.on("error", () => undefined);

  const mailpitUrl = `${mailpitBaseUrl(environment)}/api/v1/info`;
  const garage = new S3Client({
    endpoint: required(environment, "S3_ENDPOINT"),
    region: required(environment, "S3_REGION"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required(environment, "S3_ACCESS_KEY_ID"),
      secretAccessKey: required(environment, "S3_SECRET_ACCESS_KEY"),
    },
  });

  await Promise.all([
    probeService("Postgres", async () => {
      try {
        await postgres.query("SELECT 1");
      } finally {
        await postgres.end();
      }
    }),
    probeService("Redis", async () => {
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        if (redis.isOpen) redis.destroy();
      }
    }),
    probeService("Mailpit", async () => {
      const response = await fetch(mailpitUrl, { signal: AbortSignal.timeout(1_000) });
      if (!response.ok) throw new Error(`status ${response.status}`);
    }),
    probeService("Garage", async () => {
      try {
        await garage.send(new HeadBucketCommand({ Bucket: required(environment, "S3_BUCKET") }), {
          abortSignal: AbortSignal.timeout(1_000),
        });
      } finally {
        garage.destroy();
      }
    }),
  ]);
}

async function prepareTestDatabase(environment: NodeJS.ProcessEnv) {
  const testDatabaseUrl = new URL(required(environment, "DATABASE_URL"));
  const maintenanceUrl = new URL(testDatabaseUrl);
  maintenanceUrl.pathname = "/postgres";

  const maintenancePool = new Pool({ connectionString: maintenanceUrl.toString() });
  try {
    const result = await maintenancePool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT FROM pg_database WHERE datname = $1) AS exists",
      [testDatabaseName],
    );
    if (!result.rows[0]?.exists) {
      await maintenancePool.query(`CREATE DATABASE "${testDatabaseName}"`);
    }
  } finally {
    await maintenancePool.end();
  }

  const testPool = new Pool({ connectionString: testDatabaseUrl.toString() });
  try {
    const database = drizzle({ client: testPool });
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    });
  } finally {
    await testPool.end();
  }
}

async function waitForServer(server: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`Vite dev server exited with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(testBaseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Vite dev server did not start at ${testBaseUrl}`);
}

async function stopServer(server: ReturnType<typeof spawn>) {
  if (server.exitCode !== null || server.pid === undefined) return;

  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => server.kill("SIGKILL"), 5_000);
    forceKill.unref();
    server.once("exit", () => {
      clearTimeout(forceKill);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

export default async function setup() {
  const testEnvironment = deriveTestEnvironment();
  Object.assign(process.env, testEnvironment);
  await probeServices(testEnvironment);
  await prepareTestDatabase(testEnvironment);

  const require = createRequire(import.meta.url);
  const viteExecutable = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
  const server = spawn(
    process.execPath,
    [viteExecutable, "dev", "--host", "127.0.0.1", "--port", testPort, "--strictPort"],
    {
      env: { ...process.env, ...testEnvironment },
      stdio: "inherit",
    },
  );

  try {
    await waitForServer(server);
  } catch (error) {
    await stopServer(server);
    throw error;
  }

  return async () => {
    await stopServer(server);
  };
}
