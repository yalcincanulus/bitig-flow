/**
 * Smoke-tests the local infra stack end to end. Run after `docker compose up -d --wait`:
 *
 *   pnpm infra:verify
 *
 * This is a check, not a test suite — it proves the containers are reachable and
 * configured the way the app will expect, and nothing more.
 */

import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import nodemailer from "nodemailer";

import { createStorageClients } from "../src/server/storage-clients.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} — is .env populated?`);
  return value;
}

const checks: Array<{ name: string; detail: string }> = [];

function pass(name: string, detail: string) {
  checks.push({ name, detail });
  console.log(`  ✓ ${name} — ${detail}`);
}

// --- Garage (S3) -------------------------------------------------------------

async function verifyStorage() {
  console.log("garage (S3)");

  const { s3, presigner, bucket } = createStorageClients();

  const key = `org/${randomUUID()}/doc/${randomUUID()}/verify.txt`;
  const body = `bitig-flow infra check ${new Date().toISOString()}`;
  const bodyHash = createHash("sha256").update(body).digest("hex");

  const put = await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }),
  );
  pass("putObject", `${key} → ETag ${put.ETag}`);

  const cors = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const rule = cors.CORSRules?.[0];
  if (!rule?.AllowedMethods?.includes("PUT")) {
    throw new Error("Bucket CORS does not allow PUT — did the garage-init sidecar run?");
  }
  pass("bucket CORS", `${rule.AllowedOrigins?.join(", ")} allows ${rule.AllowedMethods.join("/")}`);

  const getUrl = await getSignedUrl(presigner, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 60,
  });
  const fetched = await fetch(getUrl);
  if (!fetched.ok)
    throw new Error(`Presigned GET failed: ${fetched.status} ${await fetched.text()}`);
  const fetchedHash = createHash("sha256")
    .update(await fetched.text())
    .digest("hex");
  if (fetchedHash !== bodyHash) throw new Error("Presigned GET returned different bytes");
  pass("presigned GET (60s)", "round-tripped byte-identical");

  const putUrl = await getSignedUrl(presigner, new PutObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 60,
  });
  if (new URL(putUrl).searchParams.get("X-Amz-SignedHeaders")?.includes("x-amz-checksum")) {
    throw new Error("Presigned PUT signs checksum headers — a browser PUT would 403");
  }
  const uploaded = await fetch(putUrl, { method: "PUT", body: "browser-shaped upload" });
  if (!uploaded.ok)
    throw new Error(`Presigned PUT failed: ${uploaded.status} ${await uploaded.text()}`);
  pass("presigned PUT (browser shaped)", "no checksum headers signed, accepted");

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  pass("cleanup", "verification object deleted");
}

// --- Mailpit -----------------------------------------------------------------

async function verifyMail() {
  console.log("mailpit (SMTP)");

  const host = required("SMTP_HOST");
  const port = Number(required("SMTP_PORT"));
  const subject = `infra check ${randomUUID()}`;

  const transport = nodemailer.createTransport({ host, port, secure: false });
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "no-reply@bitig.local",
    to: "someone@example.com",
    subject,
    text: "If you are reading this in Mailpit, the dev mail path works.",
  });
  pass("SMTP send", `${host}:${port} accepted the message`);

  // Mailpit's web UI and its API share port 8025.
  const apiBase = `http://${host}:8025`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${apiBase}/api/v1/search?query=${encodeURIComponent(subject)}`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: Array<{ Subject: string }> };
      if (messages.some((m) => m.Subject === subject)) {
        pass("mailpit delivery", `message visible at ${apiBase}`);
        return;
      }
    }
    await sleep(300);
  }
  throw new Error(`Message "${subject}" never appeared in Mailpit`);
}

// --- Postgres / Redis --------------------------------------------------------
// Both are checked by their compose healthchecks; assert only that the URLs the
// app will use are present and point where compose published them.

function verifyUrls() {
  console.log("connection strings");
  const database = new URL(required("DATABASE_URL"));
  if (database.port !== "5432")
    throw new Error(`DATABASE_URL port is ${database.port}, expected 5432`);
  pass("DATABASE_URL", `${database.hostname}:${database.port}${database.pathname}`);

  const redis = new URL(required("REDIS_URL"));
  if (redis.port !== "6379") throw new Error(`REDIS_URL port is ${redis.port}, expected 6379`);
  pass("REDIS_URL", `${redis.hostname}:${redis.port}`);
}

verifyUrls();
await verifyStorage();
await verifyMail();
console.log(`\n${checks.length} checks passed.`);
