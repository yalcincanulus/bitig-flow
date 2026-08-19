import { expect, test } from "vitest";

import {
  analyticsTrustworthy,
  gateRequirementNames,
  gateSummary,
  hasRequirements,
  trustRemedyRequirements,
} from "#/lib/link-trust";

const noRequirements = {
  passwordSet: false,
  requiresEmail: false,
  requiresVerification: false,
};

test("a Link with no Requirements is not trustworthy and reads as Public", () => {
  expect(analyticsTrustworthy(noRequirements)).toBe(false);
  expect(hasRequirements(noRequirements)).toBe(false);
  expect(gateRequirementNames(noRequirements)).toEqual([]);
  expect(gateSummary(noRequirements)).toBe("Public");
});

test("a password makes a Link trustworthy", () => {
  const link = { ...noRequirements, passwordSet: true };
  expect(analyticsTrustworthy(link)).toBe(true);
  expect(gateSummary(link)).toBe("Password");
});

test("an email Requirement makes a Link trustworthy", () => {
  const link = { ...noRequirements, requiresEmail: true };
  expect(analyticsTrustworthy(link)).toBe(true);
  expect(gateSummary(link)).toBe("Email");
});

test("a verified email Requirement makes a Link trustworthy", () => {
  const link = { ...noRequirements, requiresEmail: true, requiresVerification: true };
  expect(analyticsTrustworthy(link)).toBe(true);
  expect(gateSummary(link)).toBe("Verified email");
});

test("verification supersedes the email Requirement it is built on", () => {
  expect(gateRequirementNames({ ...noRequirements, requiresVerification: true })).toEqual([
    "Verified email",
  ]);
});

test("a password alongside an email Requirement is named as both", () => {
  const link = { passwordSet: true, requiresEmail: true, requiresVerification: false };
  expect(gateRequirementNames(link)).toEqual(["Password", "Email"]);
  expect(gateSummary(link)).toBe("Password and Email");
});

test("a password alongside verification is named as both", () => {
  const link = { passwordSet: true, requiresEmail: true, requiresVerification: true };
  expect(gateRequirementNames(link)).toEqual(["Password", "Verified email"]);
  expect(gateSummary(link)).toBe("Password and Verified email");
});

test("the remedy names the Requirements that would make the numbers believable", () => {
  expect(trustRemedyRequirements).toEqual(["Password", "Email"]);
});
