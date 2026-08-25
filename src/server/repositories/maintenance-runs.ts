import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "#/server/db/client";
import { maintenanceRun } from "#/server/db/schema";

const maintenanceKindSchema = z.enum(["reaper", "sweep", "summary_fold"]);

export async function databaseCapabilityHealthy() {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function queryLatestMaintenanceObservation(
  kind: z.input<typeof maintenanceKindSchema>,
  status?: "succeeded",
) {
  try {
    const parsedKind = maintenanceKindSchema.parse(kind);
    const [run] = await db
      .select({
        status: maintenanceRun.status,
        heartbeatAt: maintenanceRun.heartbeatAt,
        finishedAt: maintenanceRun.finishedAt,
      })
      .from(maintenanceRun)
      .where(
        status
          ? and(eq(maintenanceRun.kind, parsedKind), eq(maintenanceRun.status, status))
          : and(eq(maintenanceRun.kind, parsedKind), ne(maintenanceRun.status, "running")),
      )
      .orderBy(desc(maintenanceRun.startedAt))
      .limit(1);
    if (!run) return undefined;
    return {
      status: run.status as "running" | "succeeded" | "failed",
      heartbeatAt: run.heartbeatAt,
      ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    };
  } catch {
    return undefined;
  }
}

export function latestSuccessfulMaintenanceObservation(
  kind: z.input<typeof maintenanceKindSchema>,
) {
  return queryLatestMaintenanceObservation(kind, "succeeded");
}

export function latestMaintenanceObservation(kind: z.input<typeof maintenanceKindSchema>) {
  return queryLatestMaintenanceObservation(kind);
}

export async function startMaintenanceRun(
  kind: z.input<typeof maintenanceKindSchema>,
  now = new Date(),
) {
  const [run] = await db
    .insert(maintenanceRun)
    .values({ kind: maintenanceKindSchema.parse(kind), startedAt: now, heartbeatAt: now })
    .returning();
  return run!;
}

export async function heartbeatMaintenanceRun(id: string, now = new Date()) {
  const [run] = await db
    .update(maintenanceRun)
    .set({ heartbeatAt: now })
    .where(and(eq(maintenanceRun.id, id), eq(maintenanceRun.status, "running")))
    .returning();
  if (!run) throw new Error("Running maintenance record not found");
  return run;
}

export async function completeMaintenanceRun(
  id: string,
  outcome: Readonly<Record<string, number>>,
  now = new Date(),
) {
  const [run] = await db
    .update(maintenanceRun)
    .set({ status: "succeeded", heartbeatAt: now, finishedAt: now, outcome, failure: null })
    .where(and(eq(maintenanceRun.id, id), eq(maintenanceRun.status, "running")))
    .returning();
  if (!run) throw new Error("Running maintenance record not found");
  return run;
}

export async function failMaintenanceRun(id: string, error: unknown, now = new Date()) {
  const failure = (error instanceof Error ? error.message : "Maintenance failed")
    .replaceAll(/\s+/g, " ")
    .slice(0, 500);
  const [run] = await db
    .update(maintenanceRun)
    .set({ status: "failed", heartbeatAt: now, finishedAt: now, failure })
    .where(and(eq(maintenanceRun.id, id), eq(maintenanceRun.status, "running")))
    .returning();
  if (!run) throw new Error("Running maintenance record not found");
  return run;
}

export async function readMaintenanceStatus(kind: z.input<typeof maintenanceKindSchema>) {
  const runs = await db
    .select()
    .from(maintenanceRun)
    .where(eq(maintenanceRun.kind, maintenanceKindSchema.parse(kind)))
    .orderBy(desc(maintenanceRun.startedAt));
  return {
    current: runs.find((run) => run.status === "running"),
    last: runs.find((run) => run.status !== "running"),
  };
}
