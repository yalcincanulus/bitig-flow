import { and, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";

import {
  applyDemoReservation,
  demoEnvironmentStateSchema,
  demoReservationIncrements,
  demoReservationLimits,
  transitionDemoState,
  type DemoReservationKind,
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

function incrementChanges(kind: DemoReservationKind, amount: number) {
  const changes: Record<string, SQL> = {};
  for (const counter of demoReservationIncrements[kind]) {
    changes[usageProperties[counter]] = sql`${usageColumns[counter]} + ${amount}`;
  }
  return changes;
}

type StoredPolicy = ReturnType<typeof storedDeploymentPolicySchema.parse>;

function reservationConditions(kind: DemoReservationKind, amount: number, policy: StoredPolicy) {
  const increments = demoReservationIncrements[kind] as ReadonlyArray<DemoUsageCounter>;
  return demoReservationLimits(kind).map((check) => {
    const maximum = policy[check.limit];
    if (typeof maximum !== "number") throw new Error("Reservation limit must be numeric");
    if (check.requestOnly) return lte(sql<number>`${amount}`, maximum);

    const current = check.usage.reduce<SQL<number>>(
      (total, counter) => sql<number>`${total} + ${usageColumns[counter]}`,
      sql<number>`0`,
    );
    const increment = increments.filter((counter) => check.usage.includes(counter)).length * amount;
    return lte(sql<number>`${current} + ${increment}`, maximum);
  });
}

export async function reserveDemoBudget(
  environmentId: string,
  kind: DemoReservationKind,
  amount: number,
) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Reservation amount must be a positive safe integer");
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT id FROM ${deploymentPolicy} WHERE id = 'deployment' FOR SHARE`,
    );
    const [policyRow] = await transaction
      .select()
      .from(deploymentPolicy)
      .where(eq(deploymentPolicy.id, "deployment"))
      .limit(1);
    const [environment] = await transaction
      .select()
      .from(demoEnvironment)
      .where(eq(demoEnvironment.id, environmentId))
      .limit(1);
    if (!policyRow || !environment || environment.state !== "active") {
      return { accepted: false as const, limit: "environmentUnavailable" as const };
    }

    const policy = storedDeploymentPolicySchema.parse(policyRow);
    const preliminary = applyDemoReservation(
      environmentUsage(environment),
      { kind, amount },
      policy,
    );
    const recordRefusal = async () => {
      const now = new Date();
      await transaction
        .update(demoEnvironment)
        .set({
          refusalCount: sql`least(100, ${demoEnvironment.refusalCount} + 1)`,
          refusalFirstAt: sql`coalesce(${demoEnvironment.refusalFirstAt}, ${now})`,
          refusalLastAt: now,
        })
        .where(eq(demoEnvironment.id, environmentId));
    };
    if (!preliminary.accepted) {
      await recordRefusal();
      return { accepted: false as const, limit: preliminary.limit };
    }

    let globalFields: (typeof globalReservation)[GlobalReservationKind] | undefined;
    if (isGlobalReservation(kind)) {
      globalFields = globalReservation[kind];
      const globalColumn = demoGlobalUsage[globalFields.usage];
      const [reserved] = await transaction
        .update(demoGlobalUsage)
        .set({
          [globalFields.usage]: sql`${globalColumn} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(demoGlobalUsage.id, "demo-global"),
            lte(sql<number>`${globalColumn} + ${amount}`, policy[globalFields.limit]),
          ),
        )
        .returning({ id: demoGlobalUsage.id });
      if (!reserved) {
        await recordRefusal();
        return { accepted: false as const, limit: globalFields.limit };
      }
    }

    const [reservedEnvironment] = await transaction
      .update(demoEnvironment)
      .set(incrementChanges(kind, amount))
      .where(
        and(
          eq(demoEnvironment.id, environmentId),
          eq(demoEnvironment.state, "active"),
          ...reservationConditions(kind, amount, policy),
        ),
      )
      .returning({ id: demoEnvironment.id });

    if (!reservedEnvironment) {
      if (globalFields) {
        const globalColumn = demoGlobalUsage[globalFields.usage];
        await transaction
          .update(demoGlobalUsage)
          .set({
            [globalFields.usage]: sql`${globalColumn} - ${amount}`,
            updatedAt: new Date(),
          })
          .where(and(eq(demoGlobalUsage.id, "demo-global"), gte(globalColumn, amount)));
      }
      const [current] = await transaction
        .select()
        .from(demoEnvironment)
        .where(eq(demoEnvironment.id, environmentId))
        .limit(1);
      await recordRefusal();
      if (!current || current.state !== "active") {
        return { accepted: false as const, limit: "environmentUnavailable" as const };
      }
      const refusal = applyDemoReservation(environmentUsage(current), { kind, amount }, policy);
      return {
        accepted: false as const,
        limit: refusal.accepted ? "reservationConflict" : refusal.limit,
      };
    }

    return { accepted: true as const };
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
