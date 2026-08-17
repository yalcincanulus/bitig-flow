import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, eq } from "drizzle-orm";

import { organizationPluginOptions } from "#/lib/access-control";
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
import type { OrganizationId } from "#/server/ids";

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
