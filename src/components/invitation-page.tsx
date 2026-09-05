import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "#/components/sign-out-button";
import { ViewerSenderLine } from "#/components/viewer-sender-line";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { invitationRedirectPath } from "#/lib/auth-redirect";
import type { InvitationAcceptance } from "#/lib/invitation-acceptance";
import type { InvitationPreview } from "#/lib/invitation-page";
import { authClient } from "#/lib/auth-client";

const remedy = "Ask the organization for a new invitation.";

export function InvitationPage({
  page,
  acceptance,
  sessionEmail,
  invitationId,
}: {
  page: InvitationPreview;
  acceptance: InvitationAcceptance | null;
  sessionEmail: string | null;
  invitationId: string;
}) {
  if (
    sessionEmail &&
    acceptance?.status === "ready" &&
    (page.status === "valid" || acceptance.alreadyMember)
  ) {
    return (
      <InvitationCompletion
        acceptance={acceptance}
        invitationId={invitationId}
        page={page}
        sessionEmail={sessionEmail}
      />
    );
  }

  if (page.status === "unavailable") {
    return (
      <InvitationFrame>
        <h1 className="text-2xl font-semibold">This invitation isn't available.</h1>
        <p className="text-muted-foreground">{remedy}</p>
      </InvitationFrame>
    );
  }

  if (page.status === "expired") {
    return (
      <InvitationFrame>
        <ViewerSenderLine senderName={null} organizationName={page.organizationName} />
        <h1 className="text-2xl font-semibold">This invitation has expired.</h1>
        <p className="text-muted-foreground">{remedy}</p>
      </InvitationFrame>
    );
  }

  return (
    <InvitationFrame>
      <ViewerSenderLine senderName={page.inviterName} organizationName={page.organizationName} />
      <h1 className="text-2xl font-semibold">
        {acceptance?.status === "wrong-account"
          ? "This account cannot accept the invitation."
          : "You've been invited."}
      </h1>
      {sessionEmail ? (
        <SignedInAccount email={sessionEmail} />
      ) : (
        <p className="flex gap-4">
          <Link to="/sign-in" search={{ redirect: invitationRedirectPath(invitationId) }}>
            Sign in
          </Link>
          <Link to="/sign-up" search={{ redirect: invitationRedirectPath(invitationId) }}>
            Sign up
          </Link>
        </p>
      )}
    </InvitationFrame>
  );
}

function InvitationCompletion({
  acceptance,
  invitationId,
  page,
  sessionEmail,
}: Readonly<{
  acceptance: Extract<InvitationAcceptance, { status: "ready" }>;
  invitationId: string;
  page: InvitationPreview;
  sessionEmail: string;
}>) {
  const navigate = useNavigate();
  const startedInvitation = useRef<string | undefined>(undefined);
  const [failure, setFailure] = useState<"wrong-account" | "error">();

  useEffect(() => {
    if (startedInvitation.current === invitationId) return;
    startedInvitation.current = invitationId;

    void (async () => {
      if (acceptance.alreadyMember) {
        const active = await authClient.organization.setActive({
          organizationId: acceptance.organizationId,
        });
        if (active.error) {
          setFailure("error");
          return;
        }
      } else {
        const accepted = await authClient.organization.acceptInvitation({ invitationId });
        if (accepted.error) {
          setFailure(
            accepted.error.code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"
              ? "wrong-account"
              : "error",
          );
          return;
        }
      }

      await navigate({ to: "/dashboard/documents" });
    })();
  }, [acceptance, invitationId, navigate]);

  const sender =
    page.status === "valid" ? (
      <ViewerSenderLine senderName={page.inviterName} organizationName={page.organizationName} />
    ) : null;

  if (failure === "wrong-account") {
    return (
      <InvitationFrame>
        {sender}
        <h1 className="text-2xl font-semibold">This account cannot accept the invitation.</h1>
        <SignedInAccount email={sessionEmail} />
      </InvitationFrame>
    );
  }

  if (failure === "error") {
    return (
      <InvitationFrame>
        {sender}
        <h1 className="text-2xl font-semibold">The invitation could not be accepted.</h1>
        <SignedInAccount email={sessionEmail} />
      </InvitationFrame>
    );
  }

  return (
    <InvitationFrame>
      {sender}
      <h1 className="text-2xl font-semibold">Joining the organization.</h1>
      <Button disabled>
        <Spinner data-icon="inline-start" />
        Accepting invitation
      </Button>
    </InvitationFrame>
  );
}

function SignedInAccount({ email }: { email: string }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">Signed in as {email}.</p>
      <SignOutButton />
    </>
  );
}

function InvitationFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-8">
      {children}
    </main>
  );
}
