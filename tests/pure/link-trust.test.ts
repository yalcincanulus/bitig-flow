import { expect, test } from "vitest";

import { linkTrust } from "#/lib/link-trust";

const noRequirements = {
  passwordSet: false,
  requiresEmail: false,
  requiresVerification: false,
};

test("a Link with no Requirements is not trustworthy and reads as Public", () => {
  expect(linkTrust(noRequirements)).toEqual({
    trustworthy: false,
    requirements: [],
    summary: "Public",
  });
});

test("a password makes a Link trustworthy", () => {
  expect(linkTrust({ ...noRequirements, passwordSet: true })).toEqual({
    trustworthy: true,
    requirements: ["Password"],
    summary: "Password",
  });
});

test("an email Requirement makes a Link trustworthy", () => {
  expect(linkTrust({ ...noRequirements, requiresEmail: true })).toEqual({
    trustworthy: true,
    requirements: ["Email"],
    summary: "Email",
  });
});

test("a verified email Requirement makes a Link trustworthy", () => {
  expect(linkTrust({ ...noRequirements, requiresEmail: true, requiresVerification: true })).toEqual(
    {
      trustworthy: true,
      requirements: ["Verified email"],
      summary: "Verified email",
    },
  );
});

test("verification supersedes the email Requirement it is built on", () => {
  expect(linkTrust({ ...noRequirements, requiresVerification: true }).requirements).toEqual([
    "Verified email",
  ]);
});

test("a password alongside an email Requirement is named as both", () => {
  expect(
    linkTrust({ passwordSet: true, requiresEmail: true, requiresVerification: false }),
  ).toEqual({
    trustworthy: true,
    requirements: ["Password", "Email"],
    summary: "Password and Email",
  });
});

test("a password alongside verification is named as both", () => {
  expect(linkTrust({ passwordSet: true, requiresEmail: true, requiresVerification: true })).toEqual(
    {
      trustworthy: true,
      requirements: ["Password", "Verified email"],
      summary: "Password and Verified email",
    },
  );
});
