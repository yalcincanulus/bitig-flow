import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });

try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
} finally {
  await pool.end();
}
