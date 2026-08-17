import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  return <h1>Accept invitation</h1>;
}
