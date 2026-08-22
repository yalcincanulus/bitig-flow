import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { roleSchema } from "#/lib/access-control";
import { outstandingInvitations } from "#/lib/people";
import { auth } from "#/server/auth";
import { permission } from "#/server/auth-middleware";

/**
 * The **Organization**'s outstanding **Invitations**, for the owners and admins they are for.
 *
 * The **Memberships** beside them on the People surface are read straight from `authClient` as
 * ADR-0013 intends, and this read would be too — except Better Auth's `list-invitations` checks
 * bare membership and consults no statement, so on that endpoint alone a member can read what
 * ADR-0010's amendment says is not theirs. The endpoint is still the one doing the reading; the
 * `permission` tier in front of it is the grant nothing else was applying.
 */
export const listOutstandingInvitations = createServerFn({ method: "GET" })
  .middleware([permission({ invitation: ["create"] })])
  .handler(async ({ context }) => {
    const invitations = await auth.api.listInvitations({
      query: { organizationId: context.orgId },
      headers: getRequest().headers,
    });

    return outstandingInvitations(invitations, new Date()).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: roleSchema.parse(invitation.role),
      // An ISO string rather than a Date, because the surface only prints it and a string means
      // the same thing on both sides of the RPC boundary.
      expiresAt: invitation.expiresAt.toISOString(),
    }));
  });
