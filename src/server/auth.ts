import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { anonymous } from "better-auth/plugins/anonymous";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins/two-factor";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, count, eq } from "drizzle-orm";

import { organizationPluginOptions } from "#/lib/access-control";
import { redisSecondaryStorage } from "#/server/auth-redis-storage";
import { db } from "#/server/db/client";
import { signUpAvailable } from "#/server/repositories/deployment-policy";
import { findPlatformOperatorBindingForUser } from "#/server/repositories/platform-operator-binding";
import { rateLimitsEnabled } from "#/server/rate-limits-enabled";
import {
  account,
  invitation,
  member,
  organization,
  session,
  twoFactor,
  user,
  verification,
} from "#/server/db/schema";
import type { OrganizationId } from "#/server/ids";

import { createSmtpEmailTransport } from "./email";
import { mailCapabilityAvailable } from "./email-config";

const emailTransport = mailCapabilityAvailable() ? createSmtpEmailTransport() : undefined;

const ownedOrganizationLimit = 5;

export async function userHasReachedOwnedOrganizationLimit(userId: string) {
  const [row] = await db
    .select({ owned: count() })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));

  return (row?.owned ?? 0) >= ownedOrganizationLimit;
}

const authSchema = {
  account,
  invitation,
  member,
  organization,
  session,
  twoFactor,
  user,
  verification,
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  secondaryStorage: redisSecondaryStorage(),
  rateLimit: {
    enabled: rateLimitsEnabled(),
  },
  // Redis secondary storage would otherwise own sessions and skip Postgres. Fixtures still write
  // sessions to the database, so keep a database copy and a Redis-miss fallback.
  session: {
    storeSessionInDatabase: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user: passwordUser, url }) {
      // Keep the direct endpoint enumeration-safe when mail is unavailable: Better Auth still
      // performs the same generic response, but there is no transport on which to deliver a link.
      if (!emailTransport) return;
      await emailTransport.send({
        to: passwordUser.email,
        subject: "Reset your password on bitig-flow",
        text: `Reset your password: ${url}`,
      });
    },
  },
  account: {
    accountLinking: { enabled: false },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path === "/sign-up/email" && !(await signUpAvailable())) {
        throw new APIError("FORBIDDEN", { message: "Signup is not available" });
      }
      if (context.path === "/sign-in/anonymous") {
        throw new APIError("FORBIDDEN", { message: "Demo entry is not available" });
      }
      if (
        [
          "/two-factor/verify-totp",
          "/two-factor/verify-otp",
          "/two-factor/verify-backup-code",
        ].includes(context.path) &&
        context.body &&
        "trustDevice" in context.body &&
        context.body.trustDevice === true
      ) {
        throw new APIError("BAD_REQUEST", { message: "Trusted devices are disabled" });
      }
    }),
    after: createAuthMiddleware(async (context) => {
      if (context.path !== "/two-factor/verify-totp") return;
      const previousSession = context.context.session;
      const currentSession = context.context.newSession;
      if (previousSession?.user.twoFactorEnabled !== false || !currentSession) return;
      if (!(await findPlatformOperatorBindingForUser(currentSession.user.id))) return;

      const sessions = await context.context.internalAdapter.listSessions(currentSession.user.id);
      const staleTokens = sessions
        .filter((candidate) => candidate.token !== currentSession.session.token)
        .map((candidate) => candidate.token);
      if (staleTokens.length > 0) {
        await context.context.internalAdapter.deleteSessions(staleTokens);
      }
    }),
  },
  advanced: {
    database: {
      generateId: false,
    },
    backgroundTasks: {
      handler(task) {
        void task;
      },
    },
  },
  experimental: {
    joins: false,
  },
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => "Demo User",
    }),
    twoFactorPlugin({
      issuer: "bitig-flow",
      trustDeviceMaxAge: 0,
    }),
    emailOTP({
      otpLength: 6,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp }) {
        if (!emailTransport) return;
        void emailTransport.send({
          to: email,
          subject: "Your bitig-flow verification code",
          text: `Your verification code is ${otp}.`,
        });
      },
    }),
    organizationPlugin({
      ...organizationPluginOptions,
      organizationLimit: (sessionUser) => userHasReachedOwnedOrganizationLimit(sessionUser.id),
      async sendInvitationEmail({ email, id, organization }) {
        if (!emailTransport) throw new Error("Mail is unavailable");
        const invitationUrl = new URL(
          `/accept-invitation/${encodeURIComponent(id)}`,
          process.env.BETTER_AUTH_URL,
        );

        void emailTransport.send({
          to: email,
          subject: `Join ${organization.name} on bitig-flow`,
          text: `Accept your invitation: ${invitationUrl}`,
        });
      },
    }),
    tanstackStartCookies(),
  ],
});

export async function findOrganizationMembership(orgId: OrganizationId, userId: string) {
  const [membership] = await db
    .select({ organization, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1);

  return membership;
}
