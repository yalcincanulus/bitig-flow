import { afterAll, beforeAll, expect, test } from "vitest";
import nodemailer from "nodemailer";
import { createClient } from "redis";

import { mailpitBaseUrl } from "./environment";

const redis = createClient({ url: process.env.REDIS_URL });
const mailpitUrl = mailpitBaseUrl(process.env);
const mail = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
});

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  await redis.quit();
  mail.close();
});

async function mailpitMessageCount() {
  const response = await fetch(`${mailpitUrl}/api/v1/info`);
  const info = (await response.json()) as { Messages: number };
  return info.Messages;
}

test("a test can write Redis and Mailpit state", async () => {
  await redis.set("reset-example", "present");
  await mail.sendMail({
    from: process.env.SMTP_FROM,
    to: "reset@example.com",
    subject: "Reset example",
    text: "This message should be removed before the next test.",
  });

  expect(await redis.dbSize()).toBeGreaterThan(0);
  expect(await mailpitMessageCount()).toBeGreaterThan(0);
});

test("the next test finds Redis and Mailpit empty", async () => {
  expect(await redis.dbSize()).toBe(0);
  expect(await mailpitMessageCount()).toBe(0);
});
