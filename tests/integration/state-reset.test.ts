import { afterAll, expect, test } from "vitest";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

test("a test can write a row directly", async () => {
  await pool.query(
    `INSERT INTO "user" (name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, false, NOW(), NOW())`,
    ["Reset Example", "reset@example.com"],
  );

  const result = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM "user"`);
  expect(Number(result.rows[0]?.count)).toBe(1);
});

test("the next test finds the table empty", async () => {
  const result = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM "user"`);

  expect(Number(result.rows[0]?.count)).toBe(0);
});
