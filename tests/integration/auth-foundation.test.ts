import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  createCookieClient,
  createFixtureUser,
  createOrganizationFixture,
  currentTotpCode,
} from "../fixtures";
import {
  deploymentPolicy,
  operatorAuditRecord,
  platformOperator,
  twoFactor,
  user,
} from "#/server/db/schema";
import {
  bootstrapPlatformOperator,
  recoverPlatformOperator,
} from "#/server/repositories/platform-operator";
import { database } from "../fixtures/services";
import { postAuth, waitForPasswordResetUrl } from "./auth-journey";
import { test } from "./http";

test("direct signup fails closed when Deployment Policy is missing", async () => {
  const nonce = randomUUID();
  const response = await postAuth(createCookieClient().http, "/api/auth/sign-up/email", {
    name: `Disabled Signup ${nonce}`,
    email: `disabled-${nonce}@example.com`,
    password: `disabled-password-${nonce}`,
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ message: "Signup is not available" });
});

test("Deployment Policy can enable signup only when runtime recovery capability is ready", async () => {
  await database.insert(deploymentPolicy).values({ signUpEnabled: true });
  const nonce = randomUUID();
  const response = await postAuth(createCookieClient().http, "/api/auth/sign-up/email", {
    name: `Enabled Signup ${nonce}`,
    email: `enabled-${nonce}@example.com`,
    password: `enabled-password-${nonce}`,
  });

  expect(response.ok).toBe(true);
});

test("direct anonymous sign-in stays closed until the server-owned Demo entry exists", async () => {
  const response = await postAuth(createCookieClient().http, "/api/auth/sign-in/anonymous", {});

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ message: "Demo entry is not available" });
});

test("an anonymous request to Operations is sent to sign in", async () => {
  const response = await createCookieClient().http(
    new URL("/operations", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
});

test("Organization standing grants no access to Operations", async () => {
  const fixture = await createOrganizationFixture();
  const response = await fixture.owner.http(new URL("/operations", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(404);
});

test("the bound Operator is sent to TOTP enrollment without an Organization", async () => {
  const fixture = await createFixtureUser();
  await database.insert(platformOperator).values({ userId: fixture.user.id });

  const response = await fixture.http(new URL("/operations", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/operations/enroll");

  const authEntry = await fixture.http(new URL("/sign-in", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(authEntry.status).toBe(307);
  expect(authEntry.headers.get("location")).toBe("/operations/enroll");
});

test("the configured Operator binding cannot be replaced or removed", async () => {
  const [operator, replacement] = await Promise.all([createFixtureUser(), createFixtureUser()]);
  await database.insert(platformOperator).values({ userId: operator.user.id });

  await expect(
    database
      .update(platformOperator)
      .set({ userId: replacement.user.id })
      .where(eq(platformOperator.id, "platform-operator")),
  ).rejects.toThrow();
  await expect(
    database.delete(platformOperator).where(eq(platformOperator.id, "platform-operator")),
  ).rejects.toThrow();
  await expect(database.select().from(platformOperator)).resolves.toEqual([
    expect.objectContaining({ userId: operator.user.id }),
  ]);
});

test("the TOTP-enrolled Operator receives Organization-blind Operations", async () => {
  const fixture = await createFixtureUser();
  await database.insert(platformOperator).values({ userId: fixture.user.id });
  await database.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, fixture.user.id));

  const response = await fixture.http(new URL("/operations", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(">Operations</h1>");
  expect(html).toContain(fixture.user.email);
  expect(html).not.toContain("Impersonate");
});

test("the Operator enrolls TOTP, receives backup codes, and cannot trust a device", async () => {
  const fixture = await createFixtureUser();
  await database.insert(platformOperator).values({ userId: fixture.user.id });
  const parallelSession = createCookieClient();
  const parallelSignIn = await postAuth(parallelSession.http, "/api/auth/sign-in/email", {
    email: fixture.user.email,
    password: fixture.password,
  });
  expect(parallelSignIn.ok).toBe(true);

  const enabled = await postAuth(fixture.http, "/api/auth/two-factor/enable", {
    password: fixture.password,
  });
  expect(enabled.ok).toBe(true);
  const enrollment = (await enabled.json()) as { totpURI: string; backupCodes: string[] };
  expect(enrollment.backupCodes).toHaveLength(10);

  const trustedAttempt = await postAuth(fixture.http, "/api/auth/two-factor/verify-totp", {
    code: currentTotpCode(enrollment.totpURI),
    trustDevice: true,
  });
  expect(trustedAttempt.status).toBe(400);
  expect(await trustedAttempt.json()).toMatchObject({ message: "Trusted devices are disabled" });

  const verified = await postAuth(fixture.http, "/api/auth/two-factor/verify-totp", {
    code: currentTotpCode(enrollment.totpURI),
    trustDevice: false,
  });
  expect(verified.ok).toBe(true);

  const staleSession = await parallelSession.http(
    new URL("/api/auth/get-session", process.env.BETTER_AUTH_URL),
  );
  expect(await staleSession.json()).toBeNull();

  const signOut = await postAuth(fixture.http, "/api/auth/sign-out", {});
  expect(signOut.ok).toBe(true);
  const passwordSignIn = await postAuth(fixture.http, "/api/auth/sign-in/email", {
    email: fixture.user.email,
    password: fixture.password,
  });
  expect(passwordSignIn.ok).toBe(true);
  expect(await passwordSignIn.json()).toMatchObject({ twoFactorRedirect: true });

  const challengePage = await fixture.http(new URL("/two-factor", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(challengePage.status).toBe(200);
  expect(await challengePage.text()).toContain(">Two-factor authentication</h1>");

  const backupVerified = await postAuth(fixture.http, "/api/auth/two-factor/verify-backup-code", {
    code: enrollment.backupCodes[0],
    trustDevice: false,
  });
  expect(backupVerified.ok).toBe(true);

  const operations = await fixture.http(new URL("/operations", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(operations.status).toBe(200);
});

test("server-side Operator bootstrap and recovery are auditable and force reenrollment", async () => {
  const nonce = randomUUID();
  const email = `operator-${nonce}@example.com`;
  const initialPassword = `operator-password-${nonce}`;
  const created = await bootstrapPlatformOperator({
    name: "Platform Operator",
    email,
    password: initialPassword,
  });
  const client = createCookieClient();
  const signedIn = await postAuth(client.http, "/api/auth/sign-in/email", {
    email,
    password: initialPassword,
  });
  expect(signedIn.ok).toBe(true);

  const enabled = await postAuth(client.http, "/api/auth/two-factor/enable", {
    password: initialPassword,
  });
  const enrollment = (await enabled.json()) as { totpURI: string };
  const verified = await postAuth(client.http, "/api/auth/two-factor/verify-totp", {
    code: currentTotpCode(enrollment.totpURI),
    trustDevice: false,
  });
  expect(verified.ok).toBe(true);

  const newPassword = `recovered-operator-${nonce}`;
  await recoverPlatformOperator(newPassword);

  const oldSession = await client.http(
    new URL("/api/auth/get-session", process.env.BETTER_AUTH_URL),
  );
  expect(await oldSession.json()).toBeNull();
  expect(await database.select().from(twoFactor).where(eq(twoFactor.userId, created.id))).toEqual(
    [],
  );

  const auditRecords = await database
    .select({ kind: operatorAuditRecord.kind })
    .from(operatorAuditRecord)
    .orderBy(asc(operatorAuditRecord.occurredAt));
  expect(auditRecords).toEqual([{ kind: "bootstrap" }, { kind: "recovery" }]);

  const oldPassword = await postAuth(createCookieClient().http, "/api/auth/sign-in/email", {
    email,
    password: initialPassword,
  });
  expect(oldPassword.status).toBe(401);

  const recoveredClient = createCookieClient();
  const recoveredSignIn = await postAuth(recoveredClient.http, "/api/auth/sign-in/email", {
    email,
    password: newPassword,
  });
  expect(recoveredSignIn.ok).toBe(true);
  expect(await recoveredSignIn.json()).not.toHaveProperty("twoFactorRedirect");

  const operations = await recoveredClient.http(
    new URL("/operations", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(operations.status).toBe(307);
  expect(operations.headers.get("location")).toBe("/operations/enroll");
});

test("password recovery is enumeration-safe, changes the credential, and revokes Sessions", async () => {
  const fixture = await createFixtureUser();
  const secondSession = createCookieClient();
  const secondSignIn = await postAuth(secondSession.http, "/api/auth/sign-in/email", {
    email: fixture.user.email,
    password: fixture.password,
  });
  expect(secondSignIn.ok).toBe(true);

  const recoveryClient = createCookieClient();
  const knownResponse = await postAuth(recoveryClient.http, "/api/auth/request-password-reset", {
    email: fixture.user.email,
    redirectTo: new URL("/reset-password", process.env.BETTER_AUTH_URL).toString(),
  });
  const unknownResponse = await postAuth(recoveryClient.http, "/api/auth/request-password-reset", {
    email: `missing-${randomUUID()}@example.com`,
    redirectTo: new URL("/reset-password", process.env.BETTER_AUTH_URL).toString(),
  });

  expect(knownResponse.status).toBe(200);
  expect(unknownResponse.status).toBe(knownResponse.status);
  expect(await unknownResponse.json()).toEqual(await knownResponse.json());

  const resetUrl = await waitForPasswordResetUrl(fixture.user.email);
  const callbackResponse = await recoveryClient.http(resetUrl, { redirect: "manual" });
  expect(callbackResponse.status).toBe(302);
  const resetPageUrl = new URL(callbackResponse.headers.get("location")!);
  expect(resetPageUrl.pathname).toBe("/reset-password");
  const token = resetPageUrl.searchParams.get("token");
  expect(token).toBeTruthy();

  const newPassword = `recovered-password-${randomUUID()}`;
  const resetResponse = await postAuth(recoveryClient.http, "/api/auth/reset-password", {
    newPassword,
    token,
  });
  expect(resetResponse.ok).toBe(true);

  for (const http of [fixture.http, secondSession.http]) {
    const sessionResponse = await http(
      new URL("/api/auth/get-session", process.env.BETTER_AUTH_URL),
    );
    expect(await sessionResponse.json()).toBeNull();
  }

  const oldPasswordResponse = await postAuth(createCookieClient().http, "/api/auth/sign-in/email", {
    email: fixture.user.email,
    password: fixture.password,
  });
  expect(oldPasswordResponse.status).toBe(401);

  const newPasswordResponse = await postAuth(createCookieClient().http, "/api/auth/sign-in/email", {
    email: fixture.user.email,
    password: newPassword,
  });
  expect(newPasswordResponse.ok).toBe(true);
});
