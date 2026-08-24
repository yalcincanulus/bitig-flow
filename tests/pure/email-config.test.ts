import { expect, test } from "vitest";

import { readSmtpConfiguration } from "#/server/email-config";

test("Mailpit provides mail capability without credentials", () => {
  expect(
    readSmtpConfiguration({
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      SMTP_FROM: "bitig-flow <no-reply@bitig.local>",
      SMTP_SECURE: "false",
    }),
  ).toEqual({
    available: true,
    transport: {
      host: "localhost",
      port: 1025,
      secure: false,
    },
    from: "bitig-flow <no-reply@bitig.local>",
  });
});

test("provider SMTP requires a complete username and password pair", () => {
  expect(
    readSmtpConfiguration({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_FROM: "Bitig Flow <mail@example.com>",
      SMTP_SECURE: "true",
      SMTP_USERNAME: "provider-user",
    }),
  ).toEqual({ available: false, reason: "incomplete" });
});

test("missing required SMTP settings make mail unavailable", () => {
  expect(readSmtpConfiguration({ SMTP_HOST: "localhost" })).toEqual({
    available: false,
    reason: "incomplete",
  });
});

test.each([
  [{ SMTP_HOST: "localhost", SMTP_PORT: "zero", SMTP_FROM: "a@example.com" }, "SMTP_PORT"],
  [
    {
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      SMTP_FROM: "a@example.com",
      SMTP_SECURE: "sometimes",
    },
    "SMTP_SECURE",
  ],
] as const)("malformed supplied SMTP settings fail startup", (environment, setting) => {
  expect(() => readSmtpConfiguration(environment)).toThrow(setting);
});
