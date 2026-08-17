import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { createCookieClient, createFixtureUser, createOrganizationFixture } from "../fixtures";
import { mailpitBaseUrl } from "./environment";
import { test } from "./http";

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(location);
}

test("an anonymous User at / is sent to sign in and sign up", async () => {
  const response = await createCookieClient().http(new URL("/", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(">Sign in</a>");
  expect(html).toContain(">Sign up</a>");
  expect(html).not.toContain(">Go to Dashboard</a>");
  expect(html).not.toContain(">Continue setup</a>");
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

async function postAuth(http: typeof fetch, path: string, body: unknown) {
  return http(new URL(path, process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.BETTER_AUTH_URL!,
    },
    body: JSON.stringify(body),
  });
}

async function waitForVerificationOtp(email: string) {
  const mailpitUrl = mailpitBaseUrl(process.env);
  const query = `to:${email}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const searchResponse = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(query)}`,
    );
    if (searchResponse.ok) {
      const { messages } = (await searchResponse.json()) as {
        messages: Array<{ ID: string; Subject: string }>;
      };
      const verification = messages.find((message) =>
        message.Subject.includes("verification code"),
      );
      if (verification) {
        const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${verification.ID}`);
        const message = (await messageResponse.json()) as { Text: string };
        const match = /Your verification code is (\d{6})/.exec(message.Text);
        if (match?.[1]) return match[1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No verification OTP arrived for ${email}`);
}

test("sign-up, OTP, sign-in, and a named Organization open the Dashboard", async () => {
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
  expect(html).toContain(">Sign out</");
});
