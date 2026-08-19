import { createHash } from "node:crypto";

export function hashAnalyticsValue(salt: string, value: string) {
  return createHash("sha256").update(`${salt}${value}`).digest("hex");
}
