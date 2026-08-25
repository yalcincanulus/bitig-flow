import {
  deploymentReadiness,
  effectiveDeploymentAvailability,
  type DeploymentPolicyValues,
  type RuntimeCapabilities,
} from "#/lib/deployment-policy";

export type PublicDemoAvailability =
  | "available"
  | "maintenance"
  | "paused"
  | "saturated"
  | "unavailable";

type PublicDemoUsage = Readonly<{
  activeEnvironmentCount: number;
  confirmedBytes: number;
}>;

export function publicPortfolioAvailability(
  policy: DeploymentPolicyValues | undefined,
  capability: RuntimeCapabilities,
  usage: PublicDemoUsage | undefined,
  sampleConfirmedBytes: number,
) {
  const effective = effectiveDeploymentAvailability(policy, capability);
  if (policy?.pauseAllDemoAccess) {
    return { demo: "paused", signUp: effective.signUp } as const;
  }
  if (!policy || !policy.acceptNewDemos) {
    return { demo: "unavailable", signUp: effective.signUp } as const;
  }

  const readiness = deploymentReadiness(policy, capability);
  if (!readiness.canEnable.demos) {
    const maintenanceUnavailable = !capability.reaperFresh || !capability.sweepFresh;
    return {
      demo: maintenanceUnavailable ? "maintenance" : "unavailable",
      signUp: effective.signUp,
    } as const;
  }
  if (!usage) return { demo: "unavailable", signUp: effective.signUp } as const;

  const saturated =
    usage.activeEnvironmentCount >= policy.activeEnvironmentCount ||
    usage.confirmedBytes + sampleConfirmedBytes > policy.globalConfirmedBytes;
  return {
    demo: saturated ? "saturated" : "available",
    signUp: effective.signUp,
  } as const;
}
