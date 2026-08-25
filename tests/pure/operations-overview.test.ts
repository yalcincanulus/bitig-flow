import { describe, expect, test } from "vitest";

import { buildOperationsActivityOverview, policyChangeConfirmation } from "#/lib/operations";
import { initialDeploymentPolicy } from "#/lib/deployment-policy";

describe("Operations activity overview", () => {
  test("defines trailing 24-hour, 7-day, and 30-day Demo Environment cohorts", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const overview = buildOperationsActivityOverview(
      [
        {
          startedAt: "2026-08-25T11:00:00.000Z",
          ready: true,
          documentCreatedCount: 2,
          vaultCreatedCount: 1,
          linkCreatedCount: 1,
          documentActivityCount: 3,
          vaultActivityCount: 2,
          linkActivityCount: 1,
          visitCount: 4,
          downloadCount: 2,
          deliveredBytes: 1_024,
          refusalCount: 1,
          analyticsIncomplete: true,
        },
        {
          startedAt: "2026-08-20T12:00:00.000Z",
          endedAt: "2026-08-20T13:00:00.000Z",
          ready: true,
          endReason: "expired",
          documentCreatedCount: 1,
          vaultCreatedCount: 0,
          linkCreatedCount: 0,
          documentActivityCount: 1,
          vaultActivityCount: 0,
          linkActivityCount: 0,
          visitCount: 0,
          downloadCount: 0,
          deliveredBytes: 256,
          refusalCount: 0,
          analyticsIncomplete: false,
        },
        {
          startedAt: "2026-08-01T12:00:00.000Z",
          endedAt: "2026-08-01T12:30:00.000Z",
          ready: false,
          endReason: "provisioning_failed",
          documentCreatedCount: 2,
          vaultCreatedCount: 1,
          linkCreatedCount: 1,
          documentActivityCount: 0,
          vaultActivityCount: 0,
          linkActivityCount: 0,
          visitCount: 0,
          downloadCount: 0,
          deliveredBytes: 0,
          refusalCount: 0,
          analyticsIncomplete: false,
        },
        {
          startedAt: "2026-07-01T12:00:00.000Z",
          ready: true,
          documentCreatedCount: 10,
          vaultCreatedCount: 10,
          linkCreatedCount: 10,
          documentActivityCount: 10,
          vaultActivityCount: 10,
          linkActivityCount: 10,
          visitCount: 100,
          downloadCount: 50,
          deliveredBytes: 9_999,
          refusalCount: 10,
          analyticsIncomplete: false,
        },
      ],
      now,
    );

    expect(overview.windows).toEqual([
      expect.objectContaining({
        hours: 24,
        environmentCount: 1,
        readyEnvironmentCount: 1,
        engagedEnvironmentCount: 1,
        organizedEnvironmentCount: 1,
        publishedEnvironmentCount: 1,
        viewedEnvironmentCount: 1,
        downloadedEnvironmentCount: 1,
        endedEnvironmentCount: 0,
        visitCount: 4,
        downloadCount: 2,
        deliveredBytes: 1_024,
        limitedEnvironmentCount: 1,
        analyticsIncomplete: true,
      }),
      expect.objectContaining({
        hours: 168,
        environmentCount: 2,
        readyEnvironmentCount: 2,
        endedEnvironmentCount: 1,
        endReasonCounts: expect.objectContaining({ expired: 1, provisioning_failed: 0 }),
      }),
      expect.objectContaining({
        hours: 720,
        environmentCount: 3,
        readyEnvironmentCount: 2,
        engagedEnvironmentCount: 2,
        organizedEnvironmentCount: 1,
        publishedEnvironmentCount: 1,
        endedEnvironmentCount: 2,
        endReasonCounts: expect.objectContaining({ expired: 1, provisioning_failed: 1 }),
      }),
    ]);
  });

  test("fills every UTC date in the 30-day trend and keeps public analytics aggregate", () => {
    const overview = buildOperationsActivityOverview(
      [
        {
          startedAt: "2026-08-25T01:00:00.000Z",
          ready: true,
          documentCreatedCount: 1,
          vaultCreatedCount: 0,
          linkCreatedCount: 1,
          documentActivityCount: 1,
          vaultActivityCount: 0,
          linkActivityCount: 1,
          visitCount: 3,
          downloadCount: 1,
          deliveredBytes: 100,
          refusalCount: 0,
          analyticsIncomplete: false,
        },
      ],
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(overview.trend).toHaveLength(30);
    expect(overview.trend[0]).toMatchObject({ day: "2026-07-27", environmentCount: 0 });
    expect(overview.trend.at(-1)).toEqual({
      day: "2026-08-25",
      environmentCount: 1,
      engagedEnvironmentCount: 1,
      publishedEnvironmentCount: 1,
      visitCount: 3,
      downloadCount: 1,
    });
  });
});

describe("Deployment Policy confirmation", () => {
  test("requires confirmation for a reduced ceiling or a new fleet pause", () => {
    expect(
      policyChangeConfirmation(initialDeploymentPolicy, {
        ...initialDeploymentPolicy,
        documentCount: 8,
        pauseAllDemoAccess: true,
      }),
    ).toEqual({
      required: true,
      reducedFields: ["documentCount"],
      pausesAllDemoAccess: true,
      closesDemoAdmission: false,
      closesSignUp: false,
    });
  });

  test("does not require confirmation when restoring requested capability or ceilings", () => {
    expect(
      policyChangeConfirmation(
        { ...initialDeploymentPolicy, acceptNewDemos: false, documentCount: 8 },
        initialDeploymentPolicy,
      ),
    ).toEqual({
      required: false,
      reducedFields: [],
      pausesAllDemoAccess: false,
      closesDemoAdmission: false,
      closesSignUp: false,
    });
  });
});
