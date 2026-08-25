import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import {
  demoEnvironment,
  demoGlobalUsage,
  deploymentPolicy,
  maintenanceRun,
  platformOperator,
  user,
} from "#/server/db/schema";

import { createFixtureUser } from "./auth";
import { createCookieClient } from "./http";
import { database } from "./services";

export async function enableFixtureDemoAdmission() {
  const operator = await createFixtureUser();
  const now = new Date();

  await database.insert(platformOperator).values({ userId: operator.user.id });
  await database.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, operator.user.id));
  await database.insert(deploymentPolicy).values({ acceptNewDemos: true });
  await database.insert(demoGlobalUsage).values({ id: "demo-global" });
  await database.insert(maintenanceRun).values([
    {
      kind: "reaper",
      status: "succeeded",
      startedAt: now,
      heartbeatAt: now,
      finishedAt: now,
      outcome: {},
    },
    {
      kind: "sweep",
      status: "succeeded",
      startedAt: now,
      heartbeatAt: now,
      finishedAt: now,
      outcome: {},
    },
  ]);
  return operator;
}

async function enterEnabledFixtureDemo(ip: string) {
  const client = createCookieClient();
  const response = await client.http(new URL("/api/demo/entry", process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: {
      origin: process.env.BETTER_AUTH_URL!,
      "x-demo-entry-key": randomUUID(),
      "x-forwarded-for": ip,
    },
  });
  if (response.status !== 201) {
    throw new Error(`Fixture Demo entry failed with status ${response.status}`);
  }

  const [environment] = await database
    .select()
    .from(demoEnvironment)
    .orderBy(desc(demoEnvironment.createdAt))
    .limit(1);
  if (!environment) throw new Error("Fixture Demo Environment was not created");
  return { ...client, environment };
}

export async function enterFixtureDemo(ip = "198.51.100.107") {
  await enableFixtureDemoAdmission();
  return enterEnabledFixtureDemo(ip);
}

export function enterAdditionalFixtureDemo(ip = "198.51.100.108") {
  return enterEnabledFixtureDemo(ip);
}
