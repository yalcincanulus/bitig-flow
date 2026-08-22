import { and, eq } from "drizzle-orm";
import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";

import { invitationPageFrom, type InvitationPreview } from "#/lib/invitation-page";
import { db } from "#/server/db/client";
import { invitation, member, organization, user } from "#/server/db/schema";
import { invitationIdSchema } from "#/server/ids";

/**
 * The credential a public **Invitation** read runs on: possession of the id from the emailed
 * URL. The handler never sees the invited address or the **Role** (ADR-0066).
 *
 * The query lives here because this read has no **Organization** in scope — the same reason the
 * Viewer path is fenced off from the repositories (ADR-0011).
 */
export const invitationRecipient = createMiddleware({ type: "function" })
  .validator(z.object({ invitationId: z.string() }))
  .server(async ({ next, data }) => {
    return next({
      context: { invitationPage: await loadInvitationPage(data.invitationId) },
    });
  });

async function loadInvitationPage(invitationId: string): Promise<InvitationPreview> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) return { status: "unavailable" };

  const [row] = await db
    .select({
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationName: organization.name,
      inviterName: user.name,
      inviterMembershipId: member.id,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .leftJoin(
      member,
      and(
        eq(member.userId, invitation.inviterId),
        eq(member.organizationId, invitation.organizationId),
      ),
    )
    .where(eq(invitation.id, parsed.data))
    .limit(1);

  return invitationPageFrom(
    row
      ? {
          status: row.status,
          expiresAt: row.expiresAt,
          organizationName: row.organizationName,
          inviterName: row.inviterName,
          inviterIsMember: row.inviterMembershipId !== null,
        }
      : null,
    new Date(),
  );
}
