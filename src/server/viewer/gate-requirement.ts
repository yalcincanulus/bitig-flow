import type { GateProgressRecord } from "#/server/viewer/gate-progress";

export type GateRequirement = "password" | "email" | "code";

export type GateReceiptItem = Readonly<{ kind: "password" } | { kind: "email"; address: string }>;

export function capturedEmail(progress: Pick<GateProgressRecord, "email"> | null) {
  return typeof progress?.email === "string" && progress.email.length > 0 ? progress.email : null;
}

export function currentGateRequirement(
  link: {
    requiresPassword: boolean;
    requiresEmail: boolean;
    requiresVerification: boolean;
  },
  progress: Pick<GateProgressRecord, "password" | "email"> | null,
): GateRequirement | "satisfied" {
  const password = progress?.password === true;
  const email = capturedEmail(progress) !== null;
  if (link.requiresPassword && !password) return "password";
  if (link.requiresEmail && !email) return "email";
  if (link.requiresVerification) return "code";
  return "satisfied";
}

export function gateReceipt(
  progress: Pick<GateProgressRecord, "password" | "email"> | null,
): GateReceiptItem[] {
  const receipt: GateReceiptItem[] = [];
  if (progress?.password === true) receipt.push({ kind: "password" });
  const address = capturedEmail(progress);
  if (address) receipt.push({ kind: "email", address });
  return receipt;
}
