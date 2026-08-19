import type { GateProgressRecord } from "#/server/viewer/gate-progress";

export type GateRequirement = "password" | "email" | "code";

export function currentGateRequirement(
  link: {
    requiresPassword: boolean;
    requiresEmail: boolean;
    requiresVerification: boolean;
  },
  progress: Pick<GateProgressRecord, "password"> | null,
): GateRequirement | "satisfied" {
  const password = progress?.password === true;
  if (link.requiresPassword && !password) return "password";
  if (link.requiresEmail) return "email";
  if (link.requiresVerification) return "code";
  return "satisfied";
}

export function gateReceipt(progress: Pick<GateProgressRecord, "password"> | null) {
  return progress?.password === true ? (["password"] as const) : [];
}
