import { useRouter } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
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
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { Spinner } from "#/components/ui/spinner";
import { hasPermission, type OrganizationRole } from "#/lib/access-control";
import { authClient } from "#/lib/auth-client";
import { recoverActiveOrganization } from "#/lib/organization-recovery";

const deletionWarning =
  "This permanently deletes the Organization, its Memberships and Invitations, all Documents, Vaults, and Links, and all analytics history. Public Links will stop working. This cannot be undone.";

type OrganizationDangerZoneProps = Readonly<{
  organization: Readonly<{ id: string; name: string }>;
  role: OrganizationRole;
}>;

type DeleteFailure = Readonly<{
  message: string;
  recovery?: "organization" | "route";
}>;

function interpretDeleteFailure(code: string | undefined): DeleteFailure {
  switch (code) {
    case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION":
      return {
        message: "Your Role can no longer delete this Organization.",
        recovery: "route",
      };
    case "ORGANIZATION_NOT_FOUND":
    case "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION":
      return {
        message: "This Organization is no longer available.",
        recovery: "organization",
      };
    default:
      return { message: "Could not delete this Organization." };
  }
}

export function OrganizationDangerZone({ organization, role }: OrganizationDangerZoneProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [failure, setFailure] = useState<string>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const confirmed = confirmation.trim() === organization.name;

  if (!hasPermission(role, { organization: ["delete"] })) return null;

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    setConfirmation("");
    setFailure(undefined);
  }

  async function handleDelete() {
    if (!confirmed || pending) return;

    setFailure(undefined);
    setPending(true);

    let result: Awaited<ReturnType<typeof authClient.organization.delete>>;
    try {
      result = await authClient.organization.delete({ organizationId: organization.id });
    } catch {
      setFailure("Could not delete this Organization.");
      setPending(false);
      return;
    }

    if (result.error) {
      const interpreted = interpretDeleteFailure(result.error.code);
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
          <SettingsSectionTitle className="text-destructive">
            Delete Organization
          </SettingsSectionTitle>
          <SettingsSectionDescription>
            Permanently delete this Organization and everything it owns.
          </SettingsSectionDescription>
        </SettingsSectionHeader>
        <SettingsSectionContent>
          <p className="max-w-prose text-sm text-muted-foreground">{deletionWarning}</p>

          <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogTrigger render={<Button variant="destructive" />}>
              <Trash2Icon data-icon="inline-start" />
              Delete Organization
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {organization.name}?</AlertDialogTitle>
                <AlertDialogDescription>{deletionWarning}</AlertDialogDescription>
              </AlertDialogHeader>

              <FieldGroup>
                <Field data-disabled={pending}>
                  <FieldLabel htmlFor="delete-organization-name">Organization name</FieldLabel>
                  <Input
                    id="delete-organization-name"
                    name="organizationName"
                    autoComplete="off"
                    spellCheck={false}
                    value={confirmation}
                    onChange={(event) => {
                      setConfirmation(event.target.value);
                      setFailure(undefined);
                    }}
                    disabled={pending}
                  />
                  <FieldDescription>
                    Enter <strong>{organization.name}</strong> exactly to confirm.
                  </FieldDescription>
                </Field>
              </FieldGroup>

              {failure ? (
                <Alert variant="destructive" aria-live="polite">
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              ) : null}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Keep Organization</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={!confirmed || pending}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleDelete();
                  }}
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  Delete Organization
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsSectionContent>
      </SettingsSection>
    </Fragment>
  );
}
