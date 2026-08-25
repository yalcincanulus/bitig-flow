import { describe, expect, test } from "vitest";

import { initialDeploymentPolicy, type RuntimeCapabilities } from "#/lib/deployment-policy";
import { publicPortfolioAvailability } from "#/lib/public-portfolio";

const readyCapabilities: RuntimeCapabilities = {
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
};

const openPolicy = { ...initialDeploymentPolicy, acceptNewDemos: true, signUpEnabled: true };
const emptyUsage = { activeEnvironmentCount: 0, confirmedBytes: 0 };

describe("public portfolio availability", () => {
  test("global pause is more specific than closed admission", () => {
    expect(
      publicPortfolioAvailability(
        { ...initialDeploymentPolicy, pauseAllDemoAccess: true },
        readyCapabilities,
        emptyUsage,
        128,
      ).demo,
    ).toBe("paused");
  });

  test("offers Demo entry and sign-up only when policy and capability allow them", () => {
    expect(publicPortfolioAvailability(openPolicy, readyCapabilities, emptyUsage, 128)).toEqual({
      demo: "available",
      signUp: true,
    });
  });

  test("distinguishes policy closure, emergency pause, and maintenance", () => {
    expect(
      publicPortfolioAvailability(initialDeploymentPolicy, readyCapabilities, emptyUsage, 128),
    ).toEqual({ demo: "unavailable", signUp: false });
    expect(
      publicPortfolioAvailability(
        { ...openPolicy, pauseAllDemoAccess: true },
        readyCapabilities,
        emptyUsage,
        128,
      ),
    ).toEqual({ demo: "paused", signUp: true });
    expect(
      publicPortfolioAvailability(
        openPolicy,
        { ...readyCapabilities, reaperFresh: false },
        emptyUsage,
        128,
      ),
    ).toEqual({ demo: "maintenance", signUp: true });
  });

  test("reports saturation when a new Sample baseline cannot fit", () => {
    expect(
      publicPortfolioAvailability(
        openPolicy,
        readyCapabilities,
        { ...emptyUsage, activeEnvironmentCount: openPolicy.activeEnvironmentCount },
        128,
      ),
    ).toEqual({ demo: "saturated", signUp: true });
    expect(
      publicPortfolioAvailability(
        openPolicy,
        readyCapabilities,
        { ...emptyUsage, confirmedBytes: openPolicy.globalConfirmedBytes - 127 },
        128,
      ),
    ).toEqual({ demo: "saturated", signUp: true });
  });

  test("fails closed when policy, usage, or a non-maintenance capability is unavailable", () => {
    expect(publicPortfolioAvailability(undefined, readyCapabilities, emptyUsage, 128)).toEqual({
      demo: "unavailable",
      signUp: false,
    });
    expect(publicPortfolioAvailability(openPolicy, readyCapabilities, undefined, 128)).toEqual({
      demo: "unavailable",
      signUp: true,
    });
    expect(
      publicPortfolioAvailability(
        openPolicy,
        { ...readyCapabilities, redis: false },
        emptyUsage,
        128,
      ),
    ).toEqual({ demo: "unavailable", signUp: true });
  });
});
