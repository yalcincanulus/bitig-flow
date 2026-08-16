import { afterAll, beforeAll, beforeEach } from "vitest";
import { getTableName, is, Table } from "drizzle-orm";
import { Pool } from "pg";
import { createClient } from "redis";

import * as schema from "#/server/db/schema";

import { mailpitBaseUrl } from "./environment";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
const mailpitUrl = mailpitBaseUrl(process.env);

const tableNames = Object.values(schema).flatMap((value) =>
  is(value, Table) ? [getTableName(value)] : [],
);

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  const tables = tableNames.map(quoteIdentifier).join(", ");
  const deleteMail = fetch(`${mailpitUrl}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then((response) => {
    if (!response.ok) throw new Error(`Mailpit reset failed with status ${response.status}`);
  });

  await Promise.all([
    pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`),
    redis.flushDb(),
    deleteMail,
  ]);
});

afterAll(async () => {
  await Promise.all([pool.end(), redis.quit()]);
});
