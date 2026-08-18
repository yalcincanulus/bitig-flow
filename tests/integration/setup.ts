import { afterAll, beforeAll, beforeEach } from "vitest";
import { getTableName, is, Table } from "drizzle-orm";

import * as schema from "#/server/db/schema";

import { pool, redis } from "../fixtures/services";
import { mailpitBaseUrl } from "./environment";

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
  const applicationPool = (
    globalThis as typeof globalThis & { bitigFlowDatabasePool?: typeof pool }
  ).bitigFlowDatabasePool;

  await Promise.all([pool.end(), redis.quit(), applicationPool?.end() ?? Promise.resolve()]);
});
