import { describe, expect, test } from "vitest";

import {
  deploymentPolicySchema,
  effectiveDeploymentAvailability,
  hardDeploymentPolicy,
  initialDeploymentPolicy,
  policyImpact,
} from "#/lib/deployment-policy";

describe("Deployment Policy", () => {
  test("starts fail-closed at the reviewed hard ceilings", () => {
    expect(initialDeploymentPolicy).toEqual({
      acceptNewDemos: false,
      pauseAllDemoAccess: false,
      signUpEnabled: false,
      environmentLifetimeHours: 24,
      environmentConfirmedBytes: 50 * 1024 * 1024,
      uploadBytes: 25 * 1024 * 1024,
      documentCount: 20,
      uploadedDocumentCount: 5,
      vaultCount: 5,
      linkCount: 10,
      pendingUploadCount: 1,
      confirmationCount: 1,
      uploadKeyLifetimeCount: 10,
      deliveredBytes: 250 * 1024 * 1024,
      visitLifetimeCount: 250,
      eventLifetimeCount: 5_000,
      documentLifetimeCount: 40,
      vaultLifetimeCount: 10,
      linkLifetimeCount: 20,
      activeEnvironmentCount: 25,
      globalConfirmedBytes: 1024 * 1024 * 1024,
      globalPendingUploadCount: 10,
      globalConfirmationCount: 2,
    });
    expect(deploymentPolicySchema.parse(initialDeploymentPolicy)).toEqual(initialDeploymentPolicy);
  });

  test("rejects a setting above its immutable hard ceiling", () => {
    expect(() =>
      deploymentPolicySchema.parse({
        ...initialDeploymentPolicy,
        deliveredBytes: hardDeploymentPolicy.deliveredBytes + 1,
      }),
    ).toThrow(/250 MiB or less/);
  });

  test("accepts lower quotas without changing the reviewed hard ceilings", () => {
    const lowered = deploymentPolicySchema.parse({
      ...initialDeploymentPolicy,
      documentCount: 8,
      globalConfirmedBytes: 512 * 1024 * 1024,
    });

    expect(lowered.documentCount).toBe(8);
    expect(lowered.globalConfirmedBytes).toBe(512 * 1024 * 1024);
    expect(hardDeploymentPolicy.documentCount).toBe(20);
    expect(hardDeploymentPolicy.globalConfirmedBytes).toBe(1024 * 1024 * 1024);
  });

  test("reports existing over-limit use without proposing deletion", () => {
    expect(
      policyImpact({ ...initialDeploymentPolicy, documentCount: 8 }, [
        { documentCount: 10 },
        { documentCount: 4 },
        { documentCount: 8 },
      ]),
    ).toEqual({ writeLimitedEnvironmentCount: 1 });
  });
});

describe("runtime capability", () => {
  test("cannot be created by requested policy", () => {
    expect(
      effectiveDeploymentAvailability(
        {
          ...initialDeploymentPolicy,
          acceptNewDemos: true,
          signUpEnabled: true,
        },
        {
          database: true,
          redis: true,
          storage: false,
          reaperFresh: true,
          sweepFresh: true,
          trustedProxy: true,
          secureTransport: true,
          secureCookies: true,
          operatorEnrolled: true,
          mail: false,
          recovery: false,
        },
      ),
    ).toEqual({ demos: false, signUp: false });
  });

  test("global pause wins over healthy capability and open admission", () => {
    expect(
      effectiveDeploymentAvailability(
        { ...initialDeploymentPolicy, acceptNewDemos: true, pauseAllDemoAccess: true },
        {
          database: true,
          redis: true,
          storage: true,
          reaperFresh: true,
          sweepFresh: true,
          trustedProxy: true,
          secureTransport: true,
          secureCookies: true,
          operatorEnrolled: true,
          mail: true,
          recovery: true,
        },
      ),
    ).toEqual({ demos: false, signUp: false });
  });
});
