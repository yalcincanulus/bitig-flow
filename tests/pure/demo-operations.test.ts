import { describe, expect, test } from "vitest";

import {
  applyDemoReservation,
  createDemoSummary,
  demoReportInputSchema,
  foldDemoSummary,
  maintenanceFreshness,
  transitionDemoState,
} from "#/lib/demo-operations";
import { initialDeploymentPolicy } from "#/lib/deployment-policy";

describe("Demo Environment state", () => {
  test("allows explicit transitions and makes a retry a no-op", () => {
    expect(transitionDemoState("provisioning", "active")).toBe("active");
    expect(transitionDemoState("active", "active")).toBe("active");
    expect(transitionDemoState("active", "report_paused")).toBe("report_paused");
  });

  test("refuses a transition out of a completed environment", () => {
    expect(() => transitionDemoState("completed", "active")).toThrow(
      /completed cannot transition to active/,
    );
  });
});

describe("Demo reservations", () => {
  test("tracks simultaneous and lifetime Document use separately", () => {
    const first = applyDemoReservation(
      { documentCount: 19, documentLifetimeCount: 39, refusalCount: 0 },
      { kind: "document", amount: 1 },
      initialDeploymentPolicy,
    );
    expect(first).toEqual({
      accepted: true,
      usage: { documentCount: 20, documentLifetimeCount: 40, refusalCount: 0 },
    });

    expect(
      applyDemoReservation(first.usage, { kind: "document", amount: 1 }, initialDeploymentPolicy),
    ).toEqual({
      accepted: false,
      limit: "documentCount",
      usage: { documentCount: 20, documentLifetimeCount: 40, refusalCount: 1 },
    });
  });

  test("saturates refusal telemetry at 100", () => {
    expect(
      applyDemoReservation(
        { deliveredBytes: initialDeploymentPolicy.deliveredBytes, refusalCount: 100 },
        { kind: "deliveredBytes", amount: 1 },
        initialDeploymentPolicy,
      ),
    ).toMatchObject({ accepted: false, usage: { refusalCount: 100 } });
  });

  test("reserves declared upload bytes before confirmation", () => {
    const reserved = applyDemoReservation(
      {
        environmentConfirmedBytes: 20 * 1024 * 1024,
        reservedUploadBytes: 4 * 1024 * 1024,
        refusalCount: 0,
      },
      { kind: "uploadBytes", amount: 25 * 1024 * 1024 },
      initialDeploymentPolicy,
    );
    expect(reserved).toMatchObject({
      accepted: true,
      usage: { reservedUploadBytes: 29 * 1024 * 1024 },
    });
    expect(
      applyDemoReservation(
        reserved.usage,
        { kind: "uploadBytes", amount: 2 * 1024 * 1024 },
        initialDeploymentPolicy,
      ),
    ).toMatchObject({ accepted: false, limit: "environmentConfirmedBytes" });
    expect(
      applyDemoReservation(
        { refusalCount: 0 },
        { kind: "uploadBytes", amount: 25 * 1024 * 1024 + 1 },
        initialDeploymentPolicy,
      ),
    ).toMatchObject({ accepted: false, limit: "uploadBytes" });
  });
});

describe("privacy-safe operational records", () => {
  test("creates a content-free Summary and folds it into a daily aggregate", () => {
    const summary = createDemoSummary({
      startedAt: new Date("2026-08-20T10:00:00.000Z"),
      endedAt: new Date("2026-08-20T10:30:00.000Z"),
      endReason: "expired",
      documentCreatedCount: 3,
      vaultCreatedCount: 1,
      linkCreatedCount: 1,
      visitCount: 2,
      eventCount: 9,
      deliveredBytes: 1_024,
      refusalCount: 2,
      analyticsIncomplete: false,
    });

    expect(summary).not.toHaveProperty("userId");
    expect(summary).not.toHaveProperty("organizationId");
    expect(summary).not.toHaveProperty("documentId");
    expect(summary.durationSeconds).toBe(1_800);
    expect(foldDemoSummary(undefined, summary)).toMatchObject({
      day: "2026-08-20",
      environmentCount: 1,
      expiredCount: 1,
      documentCreatedCount: 3,
      deliveredBytes: 1_024,
    });
  });

  test("accepts only fixed report categories and bounded details", () => {
    expect(
      demoReportInputSchema.parse({
        category: "spam_or_phishing",
        details: "The Link asks for banking credentials.",
      }),
    ).toEqual({
      category: "spam_or_phishing",
      details: "The Link asks for banking credentials.",
    });
    expect(() =>
      demoReportInputSchema.parse({ category: "other", details: "x".repeat(281) }),
    ).toThrow();
  });

  test("treats missing, running, and stale maintenance as unhealthy", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    expect(maintenanceFreshness(undefined, now, 30 * 60 * 1_000)).toBe(false);
    expect(
      maintenanceFreshness(
        { status: "running", heartbeatAt: new Date("2026-08-20T11:59:00.000Z") },
        now,
        30 * 60 * 1_000,
      ),
    ).toBe(false);
    expect(
      maintenanceFreshness(
        { status: "succeeded", finishedAt: new Date("2026-08-20T11:20:00.000Z") },
        now,
        30 * 60 * 1_000,
      ),
    ).toBe(false);
    expect(
      maintenanceFreshness(
        { status: "succeeded", finishedAt: new Date("2026-08-20T11:45:00.000Z") },
        now,
        30 * 60 * 1_000,
      ),
    ).toBe(true);
  });
});
