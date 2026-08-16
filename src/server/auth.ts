import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { organizationPluginOptions, roles, type PermissionRequest } from "#/lib/access-control";
import { db } from "#/server/db/client";
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from "#/server/db/schema";
import { organizationIdSchema } from "#/server/ids";

import { createMailpitEmailTransport } from "./email";

const emailTransport = createMailpitEmailTransport();

const authSchema = {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
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
  experimental: {
    joins: false,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp }) {
        void emailTransport.send({
          to: email,
          subject: "Your bitig-flow verification code",
          text: `Your verification code is ${otp}.`,
        });
      },
    }),
    organizationPlugin({
      ...organizationPluginOptions,
      async sendInvitationEmail({ email, id, organization }) {
        const invitationUrl = new URL(
          `/accept-invitation?id=${encodeURIComponent(id)}`,
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

const roleSchema = z.enum(["owner", "admin", "member"]);

function signInRedirect(): never {
  throw redirect({ href: "/sign-in" });
}

export type ForbiddenError = Readonly<{
  name: "ForbiddenError";
  code: "FORBIDDEN";
}>;

function forbiddenError(): ForbiddenError {
  return { name: "ForbiddenError", code: "FORBIDDEN" };
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "FORBIDDEN"
  );
}

export const authedMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const authSession = await auth.api.getSession({ headers: getRequest().headers });
  if (!authSession) return signInRedirect();

  return next({ context: { authSession, userId: authSession.user.id } });
});

export const orgMiddleware = createMiddleware({ type: "function" })
  .middleware([authedMiddleware])
  .server(async ({ next, context }) => {
    const activeOrganizationId = context.authSession.session.activeOrganizationId;
    if (!activeOrganizationId) return signInRedirect();

    // This is the only application boundary allowed to mint an OrganizationId.
    const orgId = organizationIdSchema.parse(activeOrganizationId);
    const [membership] = await db
      .select({ organization, role: member.role })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, context.userId), eq(member.organizationId, orgId)))
      .limit(1);

    if (!membership) return signInRedirect();

    return next({
      context: {
        orgId,
        organization: membership.organization,
        role: roleSchema.parse(membership.role),
      },
    });
  });

export function permission(request: PermissionRequest) {
  return createMiddleware({ type: "function" })
    .middleware([orgMiddleware])
    .server(async ({ next, context }) => {
      if (!roles[context.role].authorize(request).success) {
        throw forbiddenError();
      }

      return next();
    });
}
