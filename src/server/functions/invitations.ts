import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { InvitationAcceptance } from "#/lib/invitation-acceptance";
import { authedMiddleware } from "#/server/auth-middleware";
import { loadInvitationAcceptance } from "#/server/viewer/invitation-acceptance.server";
import { invitationRecipient } from "#/server/viewer/invitation-recipient";

/**
 * The public **Invitation** preview: the **Organization** and the inviter, and nothing else.
 *
 * Better Auth's `getInvitation` requires a session whose email already matches, so a signed-out
 * stranger cannot use it. This read is the exception ADR-0066 records.
 */
export const readInvitation = createServerFn({ method: "GET" })
  .middleware([invitationRecipient])
  .handler(({ context }) => context.invitationPage);

/**
 * The signed-in half of the Invitation read: whether this session owns the addressed offer and
 * whether its Membership already exists. It returns no recipient address and performs no mutation.
 */
export const prepareInvitationAcceptance = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .validator(z.object({ invitationId: z.string() }))
  .handler(
    ({ context, data }): Promise<InvitationAcceptance> =>
      loadInvitationAcceptance({
        invitationId: data.invitationId,
        userId: context.userId,
        email: context.authSession.user.email,
      }),
  );
