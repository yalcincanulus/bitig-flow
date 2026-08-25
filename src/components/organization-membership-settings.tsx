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
        message: "You are now the only Owner. Promote another User to Owner before leaving.",
        recovery: "route",
      };
    case "MEMBER_NOT_FOUND":
    case "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION":
      return {
        message: "You no longer belong to this Organization.",
        recovery: "organization",
      };
    default:
      return { message: "Could not leave this Organization." };
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
      setFailure("Could not leave this Organization.");
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
          <SettingsSectionTitle>Membership</SettingsSectionTitle>
          <SettingsSectionDescription>
            You are in this Organization as {roleLabel(role)}. Leaving ends your access immediately.
          </SettingsSectionDescription>
        </SettingsSectionHeader>
        <SettingsSectionContent>
          {isSoleOwner && !demo ? (
            <Alert className="max-w-md">
              <CircleAlertIcon />
              <AlertTitle>Another Owner is required</AlertTitle>
              <AlertDescription>
                Promote another User to Owner in <Link to="/dashboard/people">People</Link> before
                leaving this Organization.
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
              Leave Organization
            </Button>
          ) : (
            <AlertDialog open={open} onOpenChange={handleOpenChange}>
              <AlertDialogTrigger render={<Button variant="outline" />}>
                <LogOutIcon data-icon="inline-start" />
                Leave Organization
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave this Organization?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your access ends immediately. Returning requires a new Invitation from this
                    Organization.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {failure ? (
                  <Alert variant="destructive" aria-live="polite">
                    <AlertDescription>{failure}</AlertDescription>
                  </Alert>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Keep Membership</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleLeave();
                    }}
                  >
                    {pending ? <Spinner data-icon="inline-start" /> : null}
                    Leave Organization
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
