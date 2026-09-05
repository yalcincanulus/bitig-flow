import { Link, useRouter } from "@tanstack/react-router";
import { CircleAlertIcon, LogOutIcon } from "lucide-react";
import { Fragment, useState } from "react";

import {
  SettingsSection,
  SettingsSectionContent,
  SettingsSectionDescription,
  SettingsSectionHeader,
  SettingsSectionTitle,
} from "#/components/settings-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { Spinner } from "#/components/ui/spinner";
import type { OrganizationRole } from "#/lib/access-control";
import { authClient } from "#/lib/auth-client";
import { recoverActiveOrganization } from "#/lib/organization-recovery";
import { roleLabel } from "#/lib/people";

type OrganizationMembershipSettingsProps = Readonly<{
  organizationId: string;
  ownerCount: number;
  role: OrganizationRole;
  demo?: boolean;
}>;

type LeaveFailure = Readonly<{
  message: string;
  recovery?: "organization" | "route";
}>;

function interpretLeaveFailure(code: string | undefined): LeaveFailure {
  switch (code) {
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
      return {
        message: "You are now the only owner. Promote another user to owner before leaving.",
        recovery: "route",
      };
    case "MEMBER_NOT_FOUND":
    case "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION":
      return {
        message: "You no longer belong to this organization.",
        recovery: "organization",
      };
    default:
      return { message: "Could not leave this organization." };
  }
}

export function OrganizationMembershipSettings({
  organizationId,
  ownerCount,
  role,
  demo = false,
}: OrganizationMembershipSettingsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const isSoleOwner = role === "owner" && ownerCount <= 1;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setFailure(undefined);
  }

  async function handleLeave() {
    setFailure(undefined);
    setPending(true);

    let result: Awaited<ReturnType<typeof authClient.organization.leave>>;
    try {
      result = await authClient.organization.leave({ organizationId });
    } catch {
      setFailure("Could not leave this organization.");
      setPending(false);
      return;
    }

    if (result.error) {
      const interpreted = interpretLeaveFailure(result.error.code);
      setFailure(interpreted.message);
      setPending(false);

      if (interpreted.recovery === "organization") {
        await recoverActiveOrganization(router);
      } else if (interpreted.recovery === "route") {
        try {
          await router.invalidate({ sync: true });
        } catch {
          window.location.reload();
        }
      }
      return;
    }

    await recoverActiveOrganization(router);
  }

  return (
    <Fragment>
      <Separator />
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionTitle>Your access</SettingsSectionTitle>
          <SettingsSectionDescription>
            Your role is {roleLabel(role).toLowerCase()}. Leaving ends your access immediately.
          </SettingsSectionDescription>
        </SettingsSectionHeader>
        <SettingsSectionContent>
          {isSoleOwner && !demo ? (
            <Alert className="max-w-md">
              <CircleAlertIcon />
              <AlertTitle>Another owner is required</AlertTitle>
              <AlertDescription>
                Promote another user to owner in <Link to="/dashboard/people">People</Link> before
                leaving this organization.
              </AlertDescription>
            </Alert>
          ) : null}

          {demo ? (
            <Button variant="outline" disabled>
              <LogOutIcon data-icon="inline-start" />
              Disabled in demo
            </Button>
          ) : isSoleOwner ? (
            <Button variant="outline" disabled>
              <LogOutIcon data-icon="inline-start" />
              Leave organization
            </Button>
          ) : (
            <AlertDialog open={open} onOpenChange={handleOpenChange}>
              <AlertDialogTrigger render={<Button variant="outline" />}>
                <LogOutIcon data-icon="inline-start" />
                Leave organization
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave this organization?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will lose access immediately. You will need a new invitation to rejoin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {failure ? (
                  <Alert variant="destructive" aria-live="polite">
                    <AlertDescription>{failure}</AlertDescription>
                  </Alert>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Stay in organization</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleLeave();
                    }}
                  >
                    {pending ? <Spinner data-icon="inline-start" /> : null}
                    Leave organization
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SettingsSectionContent>
      </SettingsSection>
    </Fragment>
  );
}
