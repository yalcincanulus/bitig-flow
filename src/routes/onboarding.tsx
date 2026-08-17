import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { AuthPage } from "#/components/auth-page";
import { SignOutButton } from "#/components/sign-out-button";
import { Button } from "#/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { formText } from "#/lib/form-text";
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
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const name = formText(new FormData(event.currentTarget), "name").trim();
    if (!name) {
      setError("Name your Organization");
      return;
    }

    setPending(true);
    setError(undefined);

    try {
      const baseSlug = organizationSlugFromName(name);
      let created = false;

      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 40)}-${uuidv7().slice(0, 8)}`;
        const result = await authClient.organization.create({ name, slug });
        if (!result.error) {
          if (result.data?.id) {
            await authClient.organization.setActive({ organizationId: result.data.id });
          }
          created = true;
          break;
        }
        setError(result.error.message ?? "Could not create Organization");
      }

      if (!created) return;
      await navigate({ to: "/dashboard/documents" });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthPage title="Create your Organization">
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="organization-name">Name</FieldLabel>
            <Input id="organization-name" name="name" required autoComplete="organization" />
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          Continue
        </Button>
      </form>
      <SignOutButton />
    </AuthPage>
  );
}
