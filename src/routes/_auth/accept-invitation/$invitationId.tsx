import { AuthPage } from "#/components/auth-page";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  return <AuthPage title="Accept invitation" />;
}
