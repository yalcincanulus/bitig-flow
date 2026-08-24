import { z } from "zod";

const MiB = 1024 * 1024;

export const hardDeploymentPolicy = {
  environmentLifetimeHours: 24,
  environmentConfirmedBytes: 50 * MiB,
  uploadBytes: 25 * MiB,
  documentCount: 20,
  uploadedDocumentCount: 5,
  vaultCount: 5,
  linkCount: 10,
  pendingUploadCount: 1,
  confirmationCount: 1,
  uploadKeyLifetimeCount: 10,
  deliveredBytes: 250 * MiB,
  visitLifetimeCount: 250,
  eventLifetimeCount: 5_000,
  documentLifetimeCount: 40,
  vaultLifetimeCount: 10,
  linkLifetimeCount: 20,
  activeEnvironmentCount: 25,
  globalConfirmedBytes: 1024 * MiB,
  globalPendingUploadCount: 10,
  globalConfirmationCount: 2,
} as const;

export const initialDeploymentPolicy = {
  acceptNewDemos: false,
  pauseAllDemoAccess: false,
  signUpEnabled: false,
  ...hardDeploymentPolicy,
} as const;

function boundedInteger(maximum: number, label: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(maximum, { error: `${label} must be ${label.includes("MiB") ? "" : "at most "}${label}` });
}

const deploymentPolicyObjectSchema = z
  .object({
    acceptNewDemos: z.boolean(),
    pauseAllDemoAccess: z.boolean(),
    signUpEnabled: z.boolean(),
    environmentLifetimeHours: boundedInteger(24, "24 hours"),
    environmentConfirmedBytes: boundedInteger(50 * MiB, "50 MiB or less"),
    uploadBytes: boundedInteger(25 * MiB, "25 MiB or less"),
    documentCount: boundedInteger(20, "20"),
    uploadedDocumentCount: boundedInteger(5, "5"),
    vaultCount: boundedInteger(5, "5"),
    linkCount: boundedInteger(10, "10"),
    pendingUploadCount: boundedInteger(1, "1"),
    confirmationCount: boundedInteger(1, "1"),
    uploadKeyLifetimeCount: boundedInteger(10, "10"),
    deliveredBytes: boundedInteger(250 * MiB, "250 MiB or less"),
    visitLifetimeCount: boundedInteger(250, "250"),
    eventLifetimeCount: boundedInteger(5_000, "5000"),
    documentLifetimeCount: boundedInteger(40, "40"),
    vaultLifetimeCount: boundedInteger(10, "10"),
    linkLifetimeCount: boundedInteger(20, "20"),
    activeEnvironmentCount: boundedInteger(25, "25"),
    globalConfirmedBytes: boundedInteger(1024 * MiB, "1 GiB or less"),
    globalPendingUploadCount: boundedInteger(10, "10"),
    globalConfirmationCount: boundedInteger(2, "2"),
  })
  .refine((policy) => policy.uploadedDocumentCount <= policy.documentCount, {
    error: "Uploaded Documents cannot exceed the Document limit",
    path: ["uploadedDocumentCount"],
  })
  .refine((policy) => policy.uploadBytes <= policy.environmentConfirmedBytes, {
    error: "Per-upload bytes cannot exceed environment storage",
    path: ["uploadBytes"],
  })
  .refine((policy) => policy.documentCount <= policy.documentLifetimeCount, {
    error: "Simultaneous Documents cannot exceed lifetime Documents",
    path: ["documentCount"],
  })
  .refine((policy) => policy.vaultCount <= policy.vaultLifetimeCount, {
    error: "Simultaneous Vaults cannot exceed lifetime Vaults",
    path: ["vaultCount"],
  })
  .refine((policy) => policy.linkCount <= policy.linkLifetimeCount, {
    error: "Simultaneous Links cannot exceed lifetime Links",
    path: ["linkCount"],
  });

export const deploymentPolicySchema = deploymentPolicyObjectSchema.strict();
export const storedDeploymentPolicySchema = deploymentPolicyObjectSchema;

export type DeploymentPolicyValues = z.infer<typeof deploymentPolicySchema>;

export type RuntimeCapabilities = Readonly<{
  database: boolean;
  redis: boolean;
  storage: boolean;
  reaperFresh: boolean;
  sweepFresh: boolean;
  trustedProxy: boolean;
  secureTransport: boolean;
  secureCookies: boolean;
  operatorEnrolled: boolean;
  mail: boolean;
  recovery: boolean;
}>;

export function effectiveDeploymentAvailability(
  policy: DeploymentPolicyValues | undefined,
  capability: RuntimeCapabilities,
) {
  if (!policy) return { demos: false, signUp: false } as const;

  const demos =
    policy.acceptNewDemos &&
    !policy.pauseAllDemoAccess &&
    capability.database &&
    capability.redis &&
    capability.storage &&
    capability.reaperFresh &&
    capability.sweepFresh &&
    capability.trustedProxy &&
    capability.secureTransport &&
    capability.secureCookies &&
    capability.operatorEnrolled;

  const signUp =
    policy.signUpEnabled && capability.database && capability.mail && capability.recovery;

  return { demos, signUp } as const;
}

const usageLimitFields = [
  "environmentConfirmedBytes",
  "documentCount",
  "uploadedDocumentCount",
  "vaultCount",
  "linkCount",
  "pendingUploadCount",
  "confirmationCount",
  "uploadKeyLifetimeCount",
  "deliveredBytes",
  "visitLifetimeCount",
  "eventLifetimeCount",
  "documentLifetimeCount",
  "vaultLifetimeCount",
  "linkLifetimeCount",
] as const;

type EnvironmentUsage = Partial<Record<(typeof usageLimitFields)[number], number>>;

export function policyImpact(
  policy: DeploymentPolicyValues,
  environments: ReadonlyArray<EnvironmentUsage>,
) {
  const writeLimitedEnvironmentCount = environments.filter((usage) =>
    usageLimitFields.some((field) => (usage[field] ?? 0) > policy[field]),
  ).length;

  return { writeLimitedEnvironmentCount };
}
