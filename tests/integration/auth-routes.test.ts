import { expect } from "vitest";

import { createCookieClient, createFixtureUser } from "../fixtures";
import { test } from "./http";

const authRoutes = [
  { path: "/sign-in", heading: "Sign in" },
  { path: "/sign-up", heading: "Sign up" },
  { path: "/forgot-password", heading: "Forgot password" },
  { path: "/reset-password", heading: "Reset password" },
  {
    path: "/accept-invitation/fixture-invitation-id",
    heading: "Accept invitation",
  },
] as const;

test.each(authRoutes)("an anonymous User receives $path", async ({ path, heading }) => {
  const response = await createCookieClient().http(new URL(path, process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain(`>${heading}</h1>`);
});

test.each(authRoutes)("a signed-in User requesting $path is redirected", async ({ path }) => {
  const fixture = await createFixtureUser();
  const response = await fixture.http(new URL(path, process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/dashboard/documents");
  expect(await response.text()).toBe("");
});
