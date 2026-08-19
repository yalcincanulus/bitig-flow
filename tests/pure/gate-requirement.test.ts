import { expect, test } from "vitest";

import { currentGateRequirement, gateReceipt } from "#/server/viewer/gate-requirement";

test("the password Requirement is current until Gate progress records it", () => {
  const link = { requiresPassword: true, requiresEmail: true, requiresVerification: false };

  expect(currentGateRequirement(link, null)).toBe("password");
  expect(currentGateRequirement(link, { password: true, email: null })).toBe("email");
  expect(gateReceipt(null)).toEqual([]);
  expect(gateReceipt({ password: true, email: null })).toEqual([{ kind: "password" }]);
});

test("a password-only Link is satisfied once the password is accepted", () => {
  expect(
    currentGateRequirement(
      { requiresPassword: true, requiresEmail: false, requiresVerification: false },
      { password: true, email: null },
    ),
  ).toBe("satisfied");
});

test("capture-only email is the current Requirement until the address is stored", () => {
  const link = { requiresPassword: false, requiresEmail: true, requiresVerification: false };

  expect(currentGateRequirement(link, null)).toBe("email");
  expect(currentGateRequirement(link, { password: false, email: "visitor@example.com" })).toBe(
    "satisfied",
  );
  expect(gateReceipt({ password: false, email: "visitor@example.com" })).toEqual([
    { kind: "email", address: "visitor@example.com" },
  ]);
});

test("verification-to-follow moves to the code Requirement after the address is stored", () => {
  expect(
    currentGateRequirement(
      { requiresPassword: true, requiresEmail: true, requiresVerification: true },
      { password: true, email: "visitor@example.com" },
    ),
  ).toBe("code");
});
