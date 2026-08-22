import { ViewerSenderLine } from "#/components/viewer-sender-line";
import type { InvitationPreview } from "#/lib/invitation-page";

const remedy = "Ask the Organization for a new Invitation.";

export function InvitationPage({ page }: { page: InvitationPreview }) {
  if (page.status === "unavailable") {
    return (
      <InvitationFrame>
        <h1 className="text-2xl font-semibold">This Invitation isn't available.</h1>
        <p className="text-muted-foreground">{remedy}</p>
      </InvitationFrame>
    );
  }

  if (page.status === "expired") {
    return (
      <InvitationFrame>
        <ViewerSenderLine senderName={null} organizationName={page.organizationName} />
        <h1 className="text-2xl font-semibold">This Invitation has expired.</h1>
        <p className="text-muted-foreground">{remedy}</p>
      </InvitationFrame>
    );
  }

  return (
    <InvitationFrame>
      <ViewerSenderLine senderName={page.inviterName} organizationName={page.organizationName} />
      <h1 className="text-2xl font-semibold">You've been invited.</h1>
    </InvitationFrame>
  );
}

function InvitationFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-8">
      {children}
    </main>
  );
}
