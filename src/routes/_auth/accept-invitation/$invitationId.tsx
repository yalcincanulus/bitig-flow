import { createFileRoute } from "@tanstack/react-router";

import { InvitationPage } from "#/components/invitation-page";
import { prepareInvitationAcceptance, readInvitation } from "#/server/functions/invitations";

export const Route = createFileRoute("/_auth/accept-invitation/$invitationId")({
  loader: async ({ params, context }) => {
    const [page, acceptance] = await Promise.all([
      readInvitation({ data: { invitationId: params.invitationId } }),
      context.sessionUser
        ? prepareInvitationAcceptance({ data: { invitationId: params.invitationId } })
        : null,
    ]);
    return { page, acceptance };
  },
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { sessionUser } = Route.useRouteContext();
  const { invitationId } = Route.useParams();
  const { page, acceptance } = Route.useLoaderData();

  return (
    <InvitationPage
      page={page}
      acceptance={acceptance}
      sessionEmail={sessionUser?.email ?? null}
      invitationId={invitationId}
    />
  );
}
