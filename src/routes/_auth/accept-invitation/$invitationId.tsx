import { createFileRoute } from "@tanstack/react-router";

import { InvitationPage } from "#/components/invitation-page";
import { readInvitation } from "#/server/functions/invitations";

export const Route = createFileRoute("/_auth/accept-invitation/$invitationId")({
  loader: ({ params }) => readInvitation({ data: { invitationId: params.invitationId } }),
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  return <InvitationPage page={Route.useLoaderData()} />;
}
