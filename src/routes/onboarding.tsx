import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { AuthPage } from "#/components/auth-page";
import { SignOutButton } from "#/components/sign-out-button";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";
import { onboardingSchema } from "#/lib/auth-form-schemas";
import { organizationSlugFromName } from "#/lib/organization-slug";
import { hasAuthenticatedSession, listOrganizations } from "#/server/functions/auth";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    await hasAuthenticatedSession();
    const organizations = (await listOrganizations()) ?? [];
    if (organizations.length > 0) {
      throw redirect({ to: "/dashboard/documents" });
    }
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { name: "" },
    validators: {
      onSubmit: onboardingSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const baseSlug = organizationSlugFromName(value.name);
      let lastError = "Could not create Organization";

      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 40)}-${uuidv7().slice(0, 8)}`;
        const result = await authClient.organization.create({ name: value.name, slug });
        if (!result.error) {
          if (result.data?.id) {
            await authClient.organization.setActive({ organizationId: result.data.id });
          }
          await navigate({ to: "/dashboard/documents" });
          return;
        }
        lastError = result.error.message ?? lastError;
      }

      setSubmitError(lastError);
    },
  });

  return (
    <AuthPage title="Create your Organization">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="name">
            {(field) => <TextFormField field={field} label="Name" autoComplete="organization" />}
          </form.Field>
          <FieldError>{submitError}</FieldError>
        </FieldGroup>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              Continue
            </Button>
          )}
        </form.Subscribe>
      </form>
      <SignOutButton />
    </AuthPage>
  );
}
