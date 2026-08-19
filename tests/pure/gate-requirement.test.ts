import { expect, test } from "vitest";

import { currentGateRequirement, gateReceipt } from "#/server/viewer/gate-requirement";

test("the password Requirement is current until Gate progress records it", () => {
  const link = { requiresPassword: true, requiresEmail: true, requiresVerification: false };

  expect(currentGateRequirement(link, null)).toBe("password");
  expect(currentGateRequirement(link, { password: true })).toBe("email");
  expect(gateReceipt(null)).toEqual([]);
  expect(gateReceipt({ password: true })).toEqual(["password"]);
});

test("a password-only Link is satisfied once the password is accepted", () => {
  expect(
    currentGateRequirement(
      { requiresPassword: true, requiresEmail: false, requiresVerification: false },
      { password: true },
    ),
  ).toBe("satisfied");
});
