import { and, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";

import {
  applyDemoReservation,
  demoEnvironmentStateSchema,
  demoReservationIncrements,
  demoReservationLimits,
  transitionDemoState,
  type DemoReservationKind,
  type DemoUsage,
  type DemoUsageCounter,
} from "#/lib/demo-operations";
import { storedDeploymentPolicySchema } from "#/lib/deployment-policy";
import { db } from "#/server/db/client";
import {
  demoEnvironment,
  demoGlobalUsage,
  demoProvisioningAttempt,
  deploymentPolicy,
} from "#/server/db/schema";

const globalReservation = {
  uploadBytes: { usage: "confirmedBytes", limit: "globalConfirmedBytes" },
  confirmedBytes: { usage: "confirmedBytes", limit: "globalConfirmedBytes" },
  pendingUpload: { usage: "pendingUploadCount", limit: "globalPendingUploadCount" },
  confirmation: { usage: "confirmationCount", limit: "globalConfirmationCount" },
} as const;

type GlobalReservationKind = keyof typeof globalReservation;

function isGlobalReservation(kind: DemoReservationKind): kind is GlobalReservationKind {
  return kind in globalReservation;
}

const usageColumns = {
  documentCount: demoEnvironment.documentCount,
  uploadedDocumentCount: demoEnvironment.uploadedDocumentCount,
  vaultCount: demoEnvironment.vaultCount,
  linkCount: demoEnvironment.linkCount,
  pendingUploadCount: demoEnvironment.pendingUploadCount,
  confirmationCount: demoEnvironment.confirmationCount,
  uploadKeyLifetimeCount: demoEnvironment.uploadKeyLifetimeCount,
  documentLifetimeCount: demoEnvironment.documentLifetimeCount,
  vaultLifetimeCount: demoEnvironment.vaultLifetimeCount,
  linkLifetimeCount: demoEnvironment.linkLifetimeCount,
  environmentConfirmedBytes: demoEnvironment.confirmedBytes,
  reservedUploadBytes: demoEnvironment.reservedUploadBytes,
  deliveredBytes: demoEnvironment.deliveredBytes,
  visitLifetimeCount: demoEnvironment.visitLifetimeCount,
  eventLifetimeCount: demoEnvironment.eventLifetimeCount,
} as const satisfies Record<
  DemoUsageCounter,
  (typeof demoEnvironment)[keyof typeof demoEnvironment]
>;

const usageProperties = {
  documentCount: "documentCount",
  uploadedDocumentCount: "uploadedDocumentCount",
  vaultCount: "vaultCount",
  linkCount: "linkCount",
  pendingUploadCount: "pendingUploadCount",
  confirmationCount: "confirmationCount",
  uploadKeyLifetimeCount: "uploadKeyLifetimeCount",
  documentLifetimeCount: "documentLifetimeCount",
  vaultLifetimeCount: "vaultLifetimeCount",
  linkLifetimeCount: "linkLifetimeCount",
  environmentConfirmedBytes: "confirmedBytes",
  reservedUploadBytes: "reservedUploadBytes",
  deliveredBytes: "deliveredBytes",
  visitLifetimeCount: "visitLifetimeCount",
  eventLifetimeCount: "eventLifetimeCount",
} as const satisfies Record<DemoUsageCounter, keyof typeof demoEnvironment.$inferInsert>;

function environmentUsage(row: typeof demoEnvironment.$inferSelect) {
  return {
    documentCount: row.documentCount,
    uploadedDocumentCount: row.uploadedDocumentCount,
    vaultCount: row.vaultCount,
    linkCount: row.linkCount,
    pendingUploadCount: row.pendingUploadCount,
    confirmationCount: row.confirmationCount,
    uploadKeyLifetimeCount: row.uploadKeyLifetimeCount,
    documentLifetimeCount: row.documentLifetimeCount,
    vaultLifetimeCount: row.vaultLifetimeCount,
    linkLifetimeCount: row.linkLifetimeCount,
    environmentConfirmedBytes: row.confirmedBytes,
    reservedUploadBytes: row.reservedUploadBytes,
    deliveredBytes: row.deliveredBytes,
    visitLifetimeCount: row.visitLifetimeCount,
    eventLifetimeCount: row.eventLifetimeCount,
    refusalCount: row.refusalCount,
  };
}

export type DemoBudgetReservation = Readonly<{
  kind: DemoReservationKind;
  amount: number;
}>;

const globalUsageProperties = {
  confirmedBytes: "confirmedBytes",
  pendingUploadCount: "pendingUploadCount",
  confirmationCount: "confirmationCount",
} as const;

export async function reserveDemoBudgets(
  environmentId: string,
  reservations: ReadonlyArray<DemoBudgetReservation>,
) {
  if (
    reservations.length === 0 ||
    reservations.some(({ amount }) => !Number.isSafeInteger(amount) || amount < 1)
  ) {
    throw new Error("Reservations must contain positive safe integers");
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${deploymentPolicy} WHERE id = 'deployment' FOR SHARE`,
    );
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const [[policyRow], [environment]] = await Promise.all([
      transaction
        .select()
        .from(deploymentPolicy)
        .where(eq(deploymentPolicy.id, "deployment"))
        .limit(1),
      transaction
        .select()
        .from(demoEnvironment)
        .where(eq(demoEnvironment.id, environmentId))
        .limit(1),
    ]);
    if (
      !policyRow ||
      !environment ||
      environment.state !== "active" ||
      policyRow.pauseAllDemoAccess
    ) {
      return { accepted: false as const, limit: "environmentUnavailable" as const };
    }

    const recordRefusal = async (dimension: string) => {
      const now = new Date();
      await transaction
        .update(demoEnvironment)
        .set({
          refusalCount: sql`least(100, ${demoEnvironment.refusalCount} + 1)`,
          refusalCounts: sql`jsonb_set(
            ${demoEnvironment.refusalCounts},
            ARRAY[${dimension}],
            to_jsonb(least(
              100,
              coalesce((${demoEnvironment.refusalCounts} ->> ${dimension})::integer, 0) + 1
            )),
            true
          )`,
          refusalFirstAt: sql`coalesce(${demoEnvironment.refusalFirstAt}, ${now})`,
          refusalLastAt: now,
        })
        .where(eq(demoEnvironment.id, environmentId));
    };
    const policy = storedDeploymentPolicySchema.parse(policyRow);
    let nextUsage: DemoUsage = environmentUsage(environment);
    for (const reservation of reservations) {
      const result = applyDemoReservation(nextUsage, reservation, policy);
      if (!result.accepted) {
        await recordRefusal(result.limit);
        const check = demoReservationLimits(reservation.kind).find(
          (candidate) => candidate.limit === result.limit,
        );
        const usage = check?.usage.reduce((total, counter) => total + (nextUsage[counter] ?? 0), 0);
        return {
          accepted: false as const,
          limit: result.limit,
          ...(usage === undefined ? {} : { usage }),
          limitValue: policy[result.limit],
        };
      }
      nextUsage = result.usage;
    }

    const globalDeltas = {
      confirmedBytes: 0,
      pendingUploadCount: 0,
      confirmationCount: 0,
    };
    for (const reservation of reservations) {
      if (!isGlobalReservation(reservation.kind)) continue;
      globalDeltas[globalReservation[reservation.kind].usage] += reservation.amount;
    }
    if (Object.values(globalDeltas).some((amount) => amount > 0)) {
      await transaction.execute(
        sql`SELECT id FROM ${demoGlobalUsage} WHERE id = 'demo-global' FOR UPDATE`,
      );
      const [globalUsage] = await transaction
        .select()
        .from(demoGlobalUsage)
        .where(eq(demoGlobalUsage.id, "demo-global"))
        .limit(1);
      if (!globalUsage) {
        await recordRefusal("globalUnavailable");
        return { accepted: false as const, limit: "globalUnavailable" as const };
      }
      for (const reservation of reservations) {
        if (!isGlobalReservation(reservation.kind)) continue;
        const fields = globalReservation[reservation.kind];
        if (globalUsage[fields.usage] + globalDeltas[fields.usage] > policy[fields.limit]) {
          await recordRefusal(fields.limit);
          return {
            accepted: false as const,
            limit: fields.limit,
            usage: globalUsage[fields.usage],
            limitValue: policy[fields.limit],
          };
        }
      }
      const globalChanges: Record<string, SQL | Date> = { updatedAt: new Date() };
      for (const [usage, amount] of Object.entries(globalDeltas)) {
        if (amount <= 0) continue;
        const column = demoGlobalUsage[usage as keyof typeof globalUsageProperties];
        globalChanges[globalUsageProperties[usage as keyof typeof globalUsageProperties]] =
          sql`${column} + ${amount}`;
      }
      await transaction
        .update(demoGlobalUsage)
        .set(globalChanges)
        .where(eq(demoGlobalUsage.id, "demo-global"));
    }

    const environmentDeltas = new Map<DemoUsageCounter, number>();
    for (const reservation of reservations) {
      for (const counter of demoReservationIncrements[reservation.kind]) {
        environmentDeltas.set(counter, (environmentDeltas.get(counter) ?? 0) + reservation.amount);
      }
    }
    const environmentChanges: Record<string, SQL> = {};
    for (const [counter, amount] of environmentDeltas) {
      environmentChanges[usageProperties[counter]] = sql`${usageColumns[counter]} + ${amount}`;
    }
    await transaction
      .update(demoEnvironment)
      .set(environmentChanges)
      .where(and(eq(demoEnvironment.id, environmentId), eq(demoEnvironment.state, "active")));

    return { accepted: true as const };
  });
}

export async function reserveDemoBudget(
  environmentId: string,
  kind: DemoReservationKind,
  amount: number,
) {
  return reserveDemoBudgets(environmentId, [{ kind, amount }]);
}

export async function rollbackDemoBudgets(
  environmentId: string,
  reservations: ReadonlyArray<DemoBudgetReservation>,
) {
  if (
    reservations.length === 0 ||
    reservations.some(({ amount }) => !Number.isSafeInteger(amount) || amount < 1)
  ) {
    throw new Error("Reservations must contain positive safe integers");
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const [environment] = await transaction
      .select()
      .from(demoEnvironment)
      .where(eq(demoEnvironment.id, environmentId))
      .limit(1);
    if (!environment) throw new Error("Demo Environment is unavailable");

    const environmentDeltas = new Map<DemoUsageCounter, number>();
    const globalDeltas = {
      confirmedBytes: 0,
      pendingUploadCount: 0,
      confirmationCount: 0,
    };
    for (const reservation of reservations) {
      for (const counter of demoReservationIncrements[reservation.kind]) {
        environmentDeltas.set(counter, (environmentDeltas.get(counter) ?? 0) + reservation.amount);
      }
      if (isGlobalReservation(reservation.kind)) {
        globalDeltas[globalReservation[reservation.kind].usage] += reservation.amount;
      }
    }
    const usage = environmentUsage(environment);
    for (const [counter, amount] of environmentDeltas) {
      if ((usage[counter] ?? 0) < amount) {
        throw new Error(`Cannot roll back more ${counter} than reserved`);
      }
    }

    if (Object.values(globalDeltas).some((amount) => amount > 0)) {
      await transaction.execute(
        sql`SELECT id FROM ${demoGlobalUsage} WHERE id = 'demo-global' FOR UPDATE`,
      );
      const [globalUsage] = await transaction
        .select()
        .from(demoGlobalUsage)
        .where(eq(demoGlobalUsage.id, "demo-global"))
        .limit(1);
      if (!globalUsage) throw new Error("Global Demo usage is unavailable");
      const globalChanges: Record<string, SQL | Date> = { updatedAt: new Date() };
      for (const [usageName, amount] of Object.entries(globalDeltas)) {
        if (amount <= 0) continue;
        const key = usageName as keyof typeof globalUsageProperties;
        if (globalUsage[key] < amount) {
          throw new Error(`Cannot roll back more global ${usageName} than reserved`);
        }
        globalChanges[globalUsageProperties[key]] = sql`${demoGlobalUsage[key]} - ${amount}`;
      }
      await transaction
        .update(demoGlobalUsage)
        .set(globalChanges)
        .where(eq(demoGlobalUsage.id, "demo-global"));
    }

    const environmentChanges: Record<string, SQL> = {};
    for (const [counter, amount] of environmentDeltas) {
      environmentChanges[usageProperties[counter]] = sql`${usageColumns[counter]} - ${amount}`;
    }
    await transaction
      .update(demoEnvironment)
      .set(environmentChanges)
      .where(eq(demoEnvironment.id, environmentId));
    return { rolledBack: true as const };
  });
}

export async function reserveGlobalDemoEnvironment(provisioningAttemptId?: string) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${deploymentPolicy} WHERE id = 'deployment' FOR SHARE`,
    );
    const [policyRow] = await transaction
      .select()
      .from(deploymentPolicy)
      .where(eq(deploymentPolicy.id, "deployment"))
      .limit(1);
    if (!policyRow) return { accepted: false as const, limit: "unavailable" as const };

    const policy = storedDeploymentPolicySchema.parse(policyRow);
    await transaction
      .insert(demoGlobalUsage)
      .values({ id: "demo-global" })
      .onConflictDoNothing({ target: demoGlobalUsage.id });
    const [reserved] = await transaction
      .update(demoGlobalUsage)
      .set({
        activeEnvironmentCount: sql`${demoGlobalUsage.activeEnvironmentCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(demoGlobalUsage.id, "demo-global"),
          lt(demoGlobalUsage.activeEnvironmentCount, policy.activeEnvironmentCount),
        ),
      )
      .returning({ id: demoGlobalUsage.id });
    if (!reserved) return { accepted: false as const, limit: "activeEnvironmentCount" as const };
    if (provisioningAttemptId) {
      const [tracked] = await transaction
        .update(demoProvisioningAttempt)
        .set({ globalReserved: true, updatedAt: new Date() })
        .where(eq(demoProvisioningAttempt.id, provisioningAttemptId))
        .returning({ id: demoProvisioningAttempt.id });
      if (!tracked) throw new Error("Demo provisioning attempt is unavailable");
    }
    return { accepted: true as const };
  });
}

export async function releaseGlobalDemoEnvironment(provisioningAttemptId?: string) {
  return db.transaction(async (transaction) => {
    if (provisioningAttemptId) {
      const [tracked] = await transaction
        .update(demoProvisioningAttempt)
        .set({ globalReserved: false, updatedAt: new Date() })
        .where(
          and(
            eq(demoProvisioningAttempt.id, provisioningAttemptId),
            eq(demoProvisioningAttempt.globalReserved, true),
          ),
        )
        .returning({ id: demoProvisioningAttempt.id });
      if (!tracked) throw new Error("Demo provisioning attempt has no global reservation");
    }
    const [released] = await transaction
      .update(demoGlobalUsage)
      .set({
        activeEnvironmentCount: sql`${demoGlobalUsage.activeEnvironmentCount} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(demoGlobalUsage.id, "demo-global"), gte(demoGlobalUsage.activeEnvironmentCount, 1)),
      )
      .returning({ id: demoGlobalUsage.id });
    if (!released) throw new Error("Cannot release an unreserved Demo Environment");
    return { released: true as const };
  });
}

type ReleasableReservationKind =
  | "document"
  | "uploadedDocument"
  | "vault"
  | "link"
  | "pendingUpload"
  | "confirmation"
  | "uploadBytes"
  | "confirmedBytes";

const releaseCounters = {
  document: ["documentCount"],
  uploadedDocument: ["uploadedDocumentCount", "documentCount"],
  vault: ["vaultCount"],
  link: ["linkCount"],
  pendingUpload: ["pendingUploadCount"],
  confirmation: ["confirmationCount"],
  uploadBytes: ["reservedUploadBytes"],
  confirmedBytes: ["environmentConfirmedBytes"],
} as const satisfies Record<ReleasableReservationKind, ReadonlyArray<DemoUsageCounter>>;

export async function releaseDemoBudget(
  environmentId: string,
  kind: ReleasableReservationKind,
  amount: number,
) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Release amount must be a positive safe integer");
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const globalFields = isGlobalReservation(kind) ? globalReservation[kind] : undefined;
    if (globalFields) {
      const globalColumn = demoGlobalUsage[globalFields.usage];
      const [releasedGlobal] = await transaction
        .update(demoGlobalUsage)
        .set({
          [globalFields.usage]: sql`${globalColumn} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(and(eq(demoGlobalUsage.id, "demo-global"), gte(globalColumn, amount)))
        .returning({ id: demoGlobalUsage.id });
      if (!releasedGlobal) throw new Error(`Cannot release more global ${kind} than reserved`);
    }

    const counters = releaseCounters[kind];
    const changes: Record<string, SQL> = {};
    for (const counter of counters) {
      changes[usageProperties[counter]] = sql`${usageColumns[counter]} - ${amount}`;
    }
    const [releasedEnvironment] = await transaction
      .update(demoEnvironment)
      .set(changes)
      .where(
        and(
          eq(demoEnvironment.id, environmentId),
          ...counters.map((counter) => gte(usageColumns[counter], amount)),
        ),
      )
      .returning({ id: demoEnvironment.id });

    if (!releasedEnvironment) {
      throw new Error(`Cannot release more ${kind} than reserved`);
    }

    return { released: true as const };
  });
}

export async function confirmDemoUploadBytes(
  environmentId: string,
  reservedAmount: number,
  confirmedAmount: number,
) {
  if (
    !Number.isSafeInteger(reservedAmount) ||
    reservedAmount < 1 ||
    !Number.isSafeInteger(confirmedAmount) ||
    confirmedAmount < 1 ||
    confirmedAmount > reservedAmount
  ) {
    throw new Error("Confirmed bytes must be a positive value within the reservation");
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const unusedBytes = reservedAmount - confirmedAmount;
    if (unusedBytes > 0) {
      const [reconciledGlobal] = await transaction
        .update(demoGlobalUsage)
        .set({
          confirmedBytes: sql`${demoGlobalUsage.confirmedBytes} - ${unusedBytes}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(demoGlobalUsage.id, "demo-global"),
            gte(demoGlobalUsage.confirmedBytes, unusedBytes),
          ),
        )
        .returning({ id: demoGlobalUsage.id });
      if (!reconciledGlobal) throw new Error("Global byte reservation is unavailable");
    }

    const [confirmed] = await transaction
      .update(demoEnvironment)
      .set({
        reservedUploadBytes: sql`${demoEnvironment.reservedUploadBytes} - ${reservedAmount}`,
        confirmedBytes: sql`${demoEnvironment.confirmedBytes} + ${confirmedAmount}`,
      })
      .where(
        and(
          eq(demoEnvironment.id, environmentId),
          inArray(demoEnvironment.state, ["active", "global_paused", "report_paused"]),
          gte(demoEnvironment.reservedUploadBytes, reservedAmount),
        ),
      )
      .returning({ id: demoEnvironment.id });
    if (!confirmed) throw new Error("Upload byte reservation is unavailable");
    return { confirmed: true as const };
  });
}

export async function transitionPersistedDemoState(environmentId: string, requestedState: string) {
  const requested = demoEnvironmentStateSchema.parse(requestedState);
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${demoEnvironment} WHERE id = ${environmentId} FOR UPDATE`,
    );
    const [environment] = await transaction
      .select()
      .from(demoEnvironment)
      .where(eq(demoEnvironment.id, environmentId))
      .limit(1);
    if (!environment) throw new Error("Demo Environment not found");

    const current = demoEnvironmentStateSchema.parse(environment.state);
    const next = transitionDemoState(current, requested);
    if (next === current) return environment;

    const [updated] = await transaction
      .update(demoEnvironment)
      .set({ state: next, stateVersion: environment.stateVersion + 1 })
      .where(eq(demoEnvironment.id, environmentId))
      .returning();
    return updated!;
  });
}

export async function markDemoAnalyticsIncomplete(environmentId: string) {
  await db
    .update(demoEnvironment)
    .set({ analyticsIncomplete: true })
    .where(eq(demoEnvironment.id, environmentId));
}
