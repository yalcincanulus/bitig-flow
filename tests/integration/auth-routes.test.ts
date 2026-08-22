import { expect } from "vitest";

import { createCookieClient, createFixtureUser, createOrganizationFixture } from "../fixtures";
import { test } from "./http";

const authRoutes = [
  { path: "/sign-in", heading: "Sign in" },
  { path: "/sign-up", heading: "Sign up" },
  { path: "/forgot-password", heading: "Forgot password" },
  { path: "/reset-password", heading: "Reset password" },
  {
    path: "/accept-invitation/fixture-invitation-id",
    heading: "This Invitation isn't available.",
  },
] as const;

test.each(authRoutes)("an anonymous User receives $path", async ({ path, heading }) => {
  const response = await createCookieClient().http(new URL(path, process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain(`>${heading.replaceAll("'", "&#x27;")}</h1>`);
});

const accountEntryRoutes = authRoutes.filter(({ path }) => !path.startsWith("/accept-invitation/"));

test("an anonymous User receives verify-email", async () => {
  const response = await createCookieClient().http(
    new URL("/verify-email", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );

  expect(response.status).toBe(200);
  expect(await response.text()).toContain(">Verify email</h1>");
});

test.each(accountEntryRoutes)(
  "a signed-in User with no Organization requesting $path is sent to onboarding",
  async ({ path }) => {
    const fixture = await createFixtureUser();
    const response = await fixture.http(new URL(path, process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/onboarding");
    expect(await response.text()).toBe("");
  },
);

test("a signed-in User with an Organization requesting sign-in is sent to the Dashboard", async () => {
  const fixture = await createOrganizationFixture();
  const response = await fixture.member.http(new URL("/sign-in", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/dashboard/documents");
  expect(await response.text()).toBe("");
});
