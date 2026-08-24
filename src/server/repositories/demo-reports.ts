import { and, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  demoEnvironmentStateSchema,
  demoReportInputSchema,
  transitionDemoState,
} from "#/lib/demo-operations";
import { db } from "#/server/db/client";
import { demoEnvironment, demoReport } from "#/server/db/schema";

const reportRequestSchema = demoReportInputSchema.extend({
  environmentId: z.string().uuid(),
  linkId: z.string().uuid().optional(),
  networkHash: z.string().min(16).max(128),
  now: z.date().optional(),
});

export async function recordDemoReport(input: z.input<typeof reportRequestSchema>) {
  const request = reportRequestSchema.parse(input);
  const now = request.now ?? new Date();
  return db.transaction(async (transaction) => {
    // Serialize the two shared rate-limit buckets before the environment row.
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext('demo-report-global'))`);
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`demo-report-network:${request.networkHash}`}))`,
    );
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${request.environmentId} FOR UPDATE`,
    );
    const [environment] = await transaction
      .select()
      .from(demoEnvironment)
      .where(eq(demoEnvironment.id, request.environmentId))
      .limit(1);
    if (!environment || !["active", "global_paused", "report_paused"].includes(environment.state)) {
      return { accepted: false as const, reason: "unavailable" as const };
    }

    const [duplicate] = await transaction
      .select({ id: demoReport.id })
      .from(demoReport)
      .where(
        and(
          eq(demoReport.environmentId, request.environmentId),
          eq(demoReport.networkHash, request.networkHash),
        ),
      )
      .limit(1);
    if (duplicate) return { accepted: false as const, reason: "duplicate" as const };

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1_000);
    const [networkRate] = await transaction
      .select({ value: count() })
      .from(demoReport)
      .where(
        and(eq(demoReport.networkHash, request.networkHash), gte(demoReport.createdAt, dayAgo)),
      );
    if ((networkRate?.value ?? 0) >= 10) {
      return { accepted: false as const, reason: "network_rate" as const };
    }
    const [globalRate] = await transaction
      .select({ value: count() })
      .from(demoReport)
      .where(gte(demoReport.createdAt, hourAgo));
    if ((globalRate?.value ?? 0) >= 100) {
      return { accepted: false as const, reason: "global_rate" as const };
    }

    await transaction.insert(demoReport).values({
      environmentId: request.environmentId,
      linkId: request.linkId,
      category: request.category,
      details: request.details,
      networkHash: request.networkHash,
      rateLimitWindowStartedAt: dayAgo,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
    });
    const reportCount = environment.reportCount + 1;
    const reportPaused = reportCount >= 3;
    const transitionsToPaused = reportPaused && environment.state !== "report_paused";
    if (transitionsToPaused) {
      transitionDemoState(demoEnvironmentStateSchema.parse(environment.state), "report_paused");
    }
    await transaction
      .update(demoEnvironment)
      .set({
        reportCount,
        ...(transitionsToPaused
          ? { state: "report_paused", stateVersion: environment.stateVersion + 1 }
          : {}),
      })
      .where(eq(demoEnvironment.id, request.environmentId));

    return { accepted: true as const, reportCount, reportPaused };
  });
}
