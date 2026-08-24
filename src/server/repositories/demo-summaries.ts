import { inArray, lte, sql } from "drizzle-orm";

import { createDemoSummary, foldDemoSummary } from "#/lib/demo-operations";
import { db } from "#/server/db/client";
import { demoDailyAggregate, demoSummary } from "#/server/db/schema";

type SummaryInput = Parameters<typeof createDemoSummary>[0] &
  Readonly<{
    peakDocumentCount?: number;
    peakVaultCount?: number;
    peakLinkCount?: number;
    peakConfirmedBytes?: number;
  }>;

export async function persistDemoSummary(input: SummaryInput) {
  const summary = createDemoSummary(input);
  const retainUntil = new Date(summary.endedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
  const [saved] = await db
    .insert(demoSummary)
    .values({
      ...summary,
      retainUntil,
      peakDocumentCount: input.peakDocumentCount ?? 0,
      peakVaultCount: input.peakVaultCount ?? 0,
      peakLinkCount: input.peakLinkCount ?? 0,
      peakConfirmedBytes: input.peakConfirmedBytes ?? 0,
    })
    .returning();
  return saved!;
}

export async function foldExpiredDemoSummaries(now = new Date()) {
  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(demoSummary)
      .where(lte(demoSummary.retainUntil, now))
      .for("update");
    const byDay = new Map<string, ReturnType<typeof foldDemoSummary>>();
    for (const row of rows) {
      const summary = createDemoSummary({
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        endReason: row.endReason as Parameters<typeof createDemoSummary>[0]["endReason"],
        documentCreatedCount: row.documentCreatedCount,
        vaultCreatedCount: row.vaultCreatedCount,
        linkCreatedCount: row.linkCreatedCount,
        visitCount: row.visitCount,
        eventCount: row.eventCount,
        deliveredBytes: row.deliveredBytes,
        refusalCount: row.refusalCount,
        analyticsIncomplete: row.analyticsIncomplete,
      });
      const day = summary.endedAt.toISOString().slice(0, 10);
      byDay.set(day, foldDemoSummary(byDay.get(day), summary));
    }

    for (const aggregate of byDay.values()) {
      await transaction
        .insert(demoDailyAggregate)
        .values(aggregate)
        .onConflictDoUpdate({
          target: demoDailyAggregate.day,
          set: {
            environmentCount: sql`${demoDailyAggregate.environmentCount} + ${aggregate.environmentCount}`,
            expiredCount: sql`${demoDailyAggregate.expiredCount} + ${aggregate.expiredCount}`,
            endedByDemoUserCount: sql`${demoDailyAggregate.endedByDemoUserCount} + ${aggregate.endedByDemoUserCount}`,
            operatorTerminatedCount: sql`${demoDailyAggregate.operatorTerminatedCount} + ${aggregate.operatorTerminatedCount}`,
            reportedCount: sql`${demoDailyAggregate.reportedCount} + ${aggregate.reportedCount}`,
            provisioningFailedCount: sql`${demoDailyAggregate.provisioningFailedCount} + ${aggregate.provisioningFailedCount}`,
            fleetDeletedCount: sql`${demoDailyAggregate.fleetDeletedCount} + ${aggregate.fleetDeletedCount}`,
            documentCreatedCount: sql`${demoDailyAggregate.documentCreatedCount} + ${aggregate.documentCreatedCount}`,
            vaultCreatedCount: sql`${demoDailyAggregate.vaultCreatedCount} + ${aggregate.vaultCreatedCount}`,
            linkCreatedCount: sql`${demoDailyAggregate.linkCreatedCount} + ${aggregate.linkCreatedCount}`,
            visitCount: sql`${demoDailyAggregate.visitCount} + ${aggregate.visitCount}`,
            eventCount: sql`${demoDailyAggregate.eventCount} + ${aggregate.eventCount}`,
            deliveredBytes: sql`${demoDailyAggregate.deliveredBytes} + ${aggregate.deliveredBytes}`,
            refusalCount: sql`${demoDailyAggregate.refusalCount} + ${aggregate.refusalCount}`,
            aggregatedAt: now,
          },
        });
    }

    if (rows.length > 0) {
      await transaction.delete(demoSummary).where(
        inArray(
          demoSummary.id,
          rows.map((row) => row.id),
        ),
      );
    }
    return { foldedSummaryCount: rows.length, dayCount: byDay.size };
  });
}
