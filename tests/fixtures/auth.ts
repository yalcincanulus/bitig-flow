import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { eq } from "drizzle-orm";

import { organizationPluginOptions } from "#/lib/access-control";
import {
  account,
  invitation,
  member,
  organization as organizationTable,
  session,
  user,
  verification,
} from "#/server/db/schema";

import { createCookieClient } from "./http";
import { database } from "./services";

const authSchema = {
  account,
  invitation,
  member,
  organization: organizationTable,
  session,
  user,
  verification,
};

const fixtureAuth = betterAuth({
  database: drizzleAdapter(database, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
  rateLimit: { enabled: false },
  plugins: [
    emailOTP({
      otpLength: 6,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP() {},
    }),
    organization(organizationPluginOptions),
  ],
});

export async function createFixtureUser() {
  const nonce = randomUUID();
  const name = `Fixture User ${nonce}`;
  const email = `fixture-${nonce}@example.com`;
  const password = `fixture-password-${nonce}`;
  const signedUp = await fixtureAuth.api.signUpEmail({
    body: { name, email, password },
  });

  // Deliberate fixture exception: verification is not under test, so skip the Mailpit OTP round-trip.
  await database.update(user).set({ emailVerified: true }).where(eq(user.id, signedUp.user.id));

  const signedIn = await fixtureAuth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const client = createCookieClient();

  await Promise.all(
    signedIn.headers
      .getSetCookie()
      .map((cookie) => client.jar.setCookie(cookie, process.env.BETTER_AUTH_URL!)),
  );

  return {
    user: signedIn.response.user,
    ...client,
  };
}

async function sessionHeaders(fixture: Awaited<ReturnType<typeof createFixtureUser>>) {
  return new Headers({
    cookie: await fixture.jar.getCookieString(process.env.BETTER_AUTH_URL!),
  });
}

export async function createOrganizationFixture() {
  const [owner, admin, memberUser] = await Promise.all([
    createFixtureUser(),
    createFixtureUser(),
    createFixtureUser(),
  ]);
  const nonce = randomUUID();
  const fixtureOrganization = await fixtureAuth.api.createOrganization({
    body: {
      name: `Fixture Organization ${nonce}`,
      slug: `fixture-${nonce}`,
      userId: owner.user.id,
    },
  });

  await Promise.all([
    fixtureAuth.api.addMember({
      body: {
        organizationId: fixtureOrganization.id,
        userId: admin.user.id,
        role: "admin",
      },
    }),
    fixtureAuth.api.addMember({
      body: {
        organizationId: fixtureOrganization.id,
        userId: memberUser.user.id,
        role: "member",
      },
    }),
  ]);

  await Promise.all(
    [owner, admin, memberUser].map(async (fixture) =>
      fixtureAuth.api.setActiveOrganization({
        body: { organizationId: fixtureOrganization.id },
        headers: await sessionHeaders(fixture),
      }),
    ),
  );

  return {
    organization: fixtureOrganization,
    owner: { ...owner, role: "owner" as const },
    admin: { ...admin, role: "admin" as const },
    member: { ...memberUser, role: "member" as const },
  };
}

export async function createOrganizationForFixtureUser(userId: string) {
  const nonce = randomUUID();

  return fixtureAuth.api.createOrganization({
    body: {
      name: `Fixture Organization ${nonce}`,
      slug: `fixture-${nonce}`,
      userId,
    },
  });
}
