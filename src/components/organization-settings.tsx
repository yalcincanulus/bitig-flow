import { useRouter } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { Fragment, useState, type FormEvent } from "react";

import {
  SettingsSection,
  SettingsSectionContent,
  SettingsSectionDescription,
  SettingsSectionHeader,
  SettingsSectionTitle,
} from "#/components/settings-section";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { Spinner } from "#/components/ui/spinner";
import { hasPermission, type OrganizationRole } from "#/lib/access-control";
import { createOrganizationSchema } from "#/lib/auth-form-schemas";
import { authClient } from "#/lib/auth-client";

type OrganizationSettingsProps = Readonly<{
  organization: Readonly<{ id: string; name: string }>;
  role: OrganizationRole;
}>;

type Feedback = Readonly<{
  kind: "success" | "failure";
  message: string;
}>;

function renameFailure(code: string | undefined): string {
  switch (code) {
    case "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION":
      return "Your Role can no longer rename this Organization.";
    case "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION":
      return "You no longer belong to this Organization.";
    case "ORGANIZATION_NOT_FOUND":
      return "This Organization is no longer available.";
    default:
      return "Could not rename this Organization.";
  }
}

function ReadOnlyOrganization({ name }: Readonly<{ name: string }>) {
  return (
    <Fragment>
      <Separator />
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionTitle>Name</SettingsSectionTitle>
          <SettingsSectionDescription>
            The Organization that owns this Dashboard's content. Your Role cannot rename it.
          </SettingsSectionDescription>
        </SettingsSectionHeader>
        <SettingsSectionContent>
          <p className="text-sm font-medium">{name}</p>
        </SettingsSectionContent>
      </SettingsSection>
    </Fragment>
  );
}

function OrganizationRenameForm({
  organization,
}: Readonly<{
  organization: OrganizationSettingsProps["organization"];
}>) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [validationError, setValidationError] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, setPending] = useState(false);
  const isNoOp = name.trim() === organization.name;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);

    const validation = createOrganizationSchema.safeParse({ name });
    if (!validation.success) {
      setValidationError(validation.error.issues[0]?.message ?? "Name your Organization");
      return;
    }

    const trimmedName = validation.data.name;
    setValidationError(undefined);
    if (trimmedName === organization.name) return;

    setPending(true);
    let result: Awaited<ReturnType<typeof authClient.organization.update>>;
    try {
      result = await authClient.organization.update({
        organizationId: organization.id,
        data: { name: trimmedName },
      });
    } catch {
      setFeedback({ kind: "failure", message: "Could not rename this Organization." });
      setPending(false);
      return;
    }

    if (result.error) {
      setFeedback({ kind: "failure", message: renameFailure(result.error.code) });
      setPending(false);
      return;
    }

    setName(trimmedName);
    setFeedback({ kind: "success", message: "Organization name updated." });
    try {
      await router.invalidate({ sync: true });
    } catch {
      // The rename has committed. Keep the success truthful and the User on Settings even if the
      // Chrome could not refresh from the authoritative route data this time.
      setFeedback({
        kind: "success",
        message: "Organization name updated. Refresh to update the Dashboard Chrome.",
      });
    }

    setPending(false);
  }

  return (
    <Fragment>
      <Separator />
      <form onSubmit={handleSubmit}>
        <SettingsSection>
          <SettingsSectionHeader>
            <SettingsSectionTitle>Name</SettingsSectionTitle>
            <SettingsSectionDescription>
              The name shown in the Dashboard Chrome and current public Sender lines.
            </SettingsSectionDescription>
          </SettingsSectionHeader>
          <SettingsSectionContent>
            <FieldGroup className="max-w-sm">
              <Field data-invalid={Boolean(validationError)}>
                <FieldLabel htmlFor="organization-name" className="sr-only">
                  Organization name
                </FieldLabel>
                <Input
                  id="organization-name"
                  name="name"
                  autoComplete="organization"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setValidationError(undefined);
                    setFeedback(undefined);
                  }}
                  aria-invalid={Boolean(validationError)}
                />
                {validationError ? <FieldError>{validationError}</FieldError> : null}
                <FieldDescription>
                  Surrounding whitespace is removed. The Organization slug does not change.
                </FieldDescription>
              </Field>
            </FieldGroup>

            {feedback ? (
              <Alert
                variant={feedback.kind === "failure" ? "destructive" : "default"}
                aria-live="polite"
                className="max-w-sm"
              >
                {feedback.kind === "failure" ? <CircleAlertIcon /> : <CheckCircle2Icon />}
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={pending || isNoOp}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save changes
            </Button>
          </SettingsSectionContent>
        </SettingsSection>
      </form>
    </Fragment>
  );
}

export function OrganizationSettings({ organization, role }: OrganizationSettingsProps) {
  if (!hasPermission(role, { organization: ["update"] })) {
    return <ReadOnlyOrganization name={organization.name} />;
  }

  return <OrganizationRenameForm organization={organization} />;
}
