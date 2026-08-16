import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createClient } from "redis";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const database = drizzle({ client: pool });
export const redis = createClient({ url: process.env.REDIS_URL });
