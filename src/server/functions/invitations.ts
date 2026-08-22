import { createServerFn } from "@tanstack/react-start";

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
