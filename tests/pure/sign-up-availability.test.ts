import { expect, test } from "vitest";

import { effectiveSignUpAvailability } from "#/server/sign-up-availability";

test.each([
  {
    policyAllowsSignUp: false,
    mailAvailable: true,
    recoveryReady: true,
    available: false,
  },
  {
    policyAllowsSignUp: true,
    mailAvailable: false,
    recoveryReady: true,
    available: false,
  },
  {
    policyAllowsSignUp: true,
    mailAvailable: true,
    recoveryReady: false,
    available: false,
  },
  {
    policyAllowsSignUp: true,
    mailAvailable: true,
    recoveryReady: true,
    available: true,
  },
])(
  "signup availability is $available for $policyAllowsSignUp/$mailAvailable/$recoveryReady",
  (input) => {
    expect(effectiveSignUpAvailability(input)).toBe(input.available);
  },
);
