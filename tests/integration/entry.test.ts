import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  createCookieClient,
  createFixtureUser,
  createOrganizationFixture,
  enableFixtureDemoAdmission,
  enterFixtureDemo,
} from "../fixtures";
import { demoGlobalUsage, deploymentPolicy, maintenanceRun } from "#/server/db/schema";
import { initialDeploymentPolicy } from "#/lib/deployment-policy";
import { database } from "../fixtures/services";
import { postAuth, waitForVerificationOtp } from "./auth-journey";
import { test } from "./http";

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(location);
}

test("the closed default explains unavailable Demo entry and hides sign-up", async () => {
  const response = await createCookieClient().http(new URL("/", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain("Demo entry is currently unavailable");
  expect(html).toContain("Demo work is public only when you create a Link");
  expect(html).toContain(">Sign in</a>");
  expect(html).not.toContain(">Try the demo</button>");
  expect(html).not.toContain('href="/sign-up"');
  expect(html).not.toContain(">Go to Dashboard</a>");
  expect(html).not.toContain(">Continue setup</a>");
});

test("available Demo entry is primary and sign-up follows effective capability", async () => {
  await enableFixtureDemoAdmission();
  const closedSignup = await fetch(new URL("/", process.env.BETTER_AUTH_URL));
  const closedSignupHtml = await closedSignup.text();
  expect(closedSignupHtml).toContain(">Try the demo</button>");
  expect(closedSignupHtml).not.toContain('href="/sign-up"');

  await database
    .update(deploymentPolicy)
    .set({ signUpEnabled: true })
    .where(eq(deploymentPolicy.id, "deployment"));
  const openSignup = await fetch(new URL("/", process.env.BETTER_AUTH_URL));
  expect(await openSignup.text()).toContain(">Create account</a>");
});

test("public Demo states distinguish saturation, pause, and maintenance", async () => {
  await enableFixtureDemoAdmission();
  await database
    .update(demoGlobalUsage)
    .set({ activeEnvironmentCount: initialDeploymentPolicy.activeEnvironmentCount })
    .where(eq(demoGlobalUsage.id, "demo-global"));
  expect(await (await fetch(new URL("/", process.env.BETTER_AUTH_URL))).text()).toContain(
    "All Demo Environments are currently in use",
  );

  await database
    .update(demoGlobalUsage)
    .set({ activeEnvironmentCount: 0 })
    .where(eq(demoGlobalUsage.id, "demo-global"));
  await database
    .update(deploymentPolicy)
    .set({ pauseAllDemoAccess: true })
    .where(eq(deploymentPolicy.id, "deployment"));
  expect(await (await fetch(new URL("/", process.env.BETTER_AUTH_URL))).text()).toContain(
    "Demo access is paused",
  );

  await database
    .update(deploymentPolicy)
    .set({ pauseAllDemoAccess: false })
    .where(eq(deploymentPolicy.id, "deployment"));
  await database.delete(maintenanceRun).where(eq(maintenanceRun.kind, "reaper"));
  expect(await (await fetch(new URL("/", process.env.BETTER_AUTH_URL))).text()).toContain(
    "Demo maintenance is in progress",
  );
});

test("a valid Demo Session receives an accurate resume action", async () => {
  const demo = await enterFixtureDemo();
  const response = await demo.http(new URL("/", process.env.BETTER_AUTH_URL));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(">Resume demo</a>");
  expect(html).not.toContain(">Go to Dashboard</a>");
  expect(html).not.toContain(">Try the demo</button>");
});

test("direct sign-up is refused while hidden", async () => {
  const response = await fetch(new URL("/sign-up", process.env.BETTER_AUTH_URL));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain("Sign up is unavailable");
  expect(html).not.toContain(">Continue</button>");
});

test("a signed-in User with no Organization sees continue setup at /", async () => {
  const fixture = await createFixtureUser();
  const response = await fixture.http(new URL("/", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(">Continue setup</a>");
  expect(html).not.toContain(">Go to Dashboard</a>");
});

test("a signed-in User with an Organization sees the Dashboard link at /", async () => {
  const fixture = await createOrganizationFixture();
  const response = await fixture.member.http(new URL("/", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(">Go to Dashboard</a>");
  expect(html).not.toContain(">Continue setup</a>");
});

test("an anonymous User requesting onboarding is sent to sign in", async () => {
  const response = await createCookieClient().http(
    new URL("/onboarding", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );

  expectRedirect(response, "/sign-in");
});

test("a signed-in User with no Organization receives onboarding", async () => {
  const fixture = await createFixtureUser();
  const response = await fixture.http(new URL("/onboarding", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain(">Create your Organization</h1>");
  expect(html).toContain(">Sign out</");
});

test("a signed-in User with an Organization requesting onboarding is sent to the Dashboard", async () => {
  const fixture = await createOrganizationFixture();
  const response = await fixture.member.http(new URL("/onboarding", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expectRedirect(response, "/dashboard/documents");
});

test("sign-up, OTP, sign-in, and a named Organization open the Dashboard", async () => {
  await database.insert(deploymentPolicy).values({ signUpEnabled: true });
  const http = createCookieClient().http;
  const nonce = randomUUID();
  const email = `entry-${nonce}@example.com`;
  const password = `entry-password-${nonce}`;
  const organizationName = `Entry Org ${nonce}`;

  const signUpResponse = await postAuth(http, "/api/auth/sign-up/email", {
    name: `Entry User ${nonce}`,
    email,
    password,
  });
  expect(signUpResponse.ok).toBe(true);

  const otp = await waitForVerificationOtp(email);
  const verifyResponse = await postAuth(http, "/api/auth/email-otp/verify-email", { email, otp });
  expect(verifyResponse.ok).toBe(true);

  const signInResponse = await postAuth(http, "/api/auth/sign-in/email", { email, password });
  expect(signInResponse.ok).toBe(true);

  const onboardingResponse = await http(new URL("/onboarding", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(onboardingResponse.status).toBe(200);
  expect(await onboardingResponse.text()).toContain(">Create your Organization</h1>");

  const slug = `entry-org-${nonce.slice(0, 8)}`;
  const createOrganizationResponse = await postAuth(http, "/api/auth/organization/create", {
    name: organizationName,
    slug,
  });
  expect(createOrganizationResponse.ok).toBe(true);

  const dashboardResponse = await http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const html = await dashboardResponse.text();
  expect(dashboardResponse.status).toBe(200);
  expect(html).toContain(organizationName);
  expect(html).toContain(email);
});
