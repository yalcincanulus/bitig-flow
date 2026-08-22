import { and, eq, sql } from "drizzle-orm";

import type { InvitationAcceptance } from "#/lib/invitation-acceptance";
import { db } from "#/server/db/client";
import { invitation, member } from "#/server/db/schema";
import { invitationIdSchema } from "#/server/ids";

export async function loadInvitationAcceptance({
  invitationId,
  userId,
  email,
}: {
  invitationId: string;
  userId: string;
  email: string;
}): Promise<InvitationAcceptance> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) return { status: "wrong-account" };

  const [row] = await db
    .select({
      organizationId: invitation.organizationId,
      membershipId: member.id,
    })
    .from(invitation)
    .leftJoin(
      member,
      and(eq(member.organizationId, invitation.organizationId), eq(member.userId, userId)),
    )
    .where(and(eq(invitation.id, parsed.data), sql`lower(${invitation.email}) = lower(${email})`))
    .limit(1);

  if (!row) return { status: "wrong-account" };

  return {
    status: "ready",
    organizationId: row.organizationId,
    alreadyMember: row.membershipId !== null,
  };
}
