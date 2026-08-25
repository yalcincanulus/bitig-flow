import { describe, expect, test } from "vitest";

import {
  deploymentReadiness,
  deploymentPolicySchema,
  effectiveDeploymentAvailability,
  hardDeploymentPolicy,
  initialDeploymentPolicy,
  policyImpact,
} from "#/lib/deployment-policy";

const readyCapabilities = {
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
} as const;

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

  test("readiness names every condition required before admission can be enabled", () => {
    const readiness = deploymentReadiness(initialDeploymentPolicy, readyCapabilities);

    expect(
      readiness.checks.map(({ id, ready, requiredFor }) => ({ id, ready, requiredFor })),
    ).toEqual([
      { id: "database", ready: true, requiredFor: ["demos", "signUp"] },
      { id: "redis", ready: true, requiredFor: ["demos"] },
      { id: "storage", ready: true, requiredFor: ["demos"] },
      { id: "sweep", ready: true, requiredFor: ["demos"] },
      { id: "reaper", ready: true, requiredFor: ["demos"] },
      { id: "trustedProxy", ready: true, requiredFor: ["demos"] },
      { id: "secureTransport", ready: true, requiredFor: ["demos"] },
      { id: "secureCookies", ready: true, requiredFor: ["demos"] },
      { id: "operatorTotp", ready: true, requiredFor: ["demos"] },
      { id: "policy", ready: true, requiredFor: ["demos", "signUp"] },
      { id: "mailRecovery", ready: true, requiredFor: ["signUp"] },
    ]);
    expect(readiness.canEnable).toEqual({ demos: true, signUp: true });
  });

  test("Demo and sign-up readiness fail independently", () => {
    expect(
      deploymentReadiness(initialDeploymentPolicy, {
        ...readyCapabilities,
        reaperFresh: false,
      }).canEnable,
    ).toEqual({ demos: false, signUp: true });
    expect(
      deploymentReadiness(initialDeploymentPolicy, {
        ...readyCapabilities,
        mail: false,
        recovery: false,
      }).canEnable,
    ).toEqual({ demos: true, signUp: false });
    expect(deploymentReadiness(undefined, readyCapabilities).canEnable).toEqual({
      demos: false,
      signUp: false,
    });
  });
});
