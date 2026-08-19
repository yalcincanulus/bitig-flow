import { randomInt } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

export const gateCodeTtlSeconds = 10 * 60;
export const gateCodeMaxAttempts = 5;
export const gateCodeResendCooldownSeconds = 60;

export function generateGateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashGateCode(code: string) {
  return hash(code);
}

export async function verifyGateCode(codeHash: string, code: string) {
  try {
    return await verify(codeHash, code);
  } catch {
    return false;
  }
}

export function remainingGateCodeTries(attempts: number) {
  return Math.max(gateCodeMaxAttempts - attempts, 0);
}

export function gateCodeResendAfterSeconds(sentAt: number | null, nowSeconds: number) {
  if (sentAt === null) return 0;
  return Math.max(0, gateCodeResendCooldownSeconds - (nowSeconds - sentAt));
}

export function gateCodeIsExpired(expiresAt: number | null, nowSeconds: number) {
  return expiresAt === null || expiresAt <= nowSeconds;
}

export function gateCodeIsLocked(attempts: number) {
  return attempts >= gateCodeMaxAttempts;
}
