import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { AuthPage } from "#/components/auth-page";
import { CreateOrganizationForm } from "#/components/create-organization-form";
import { SignOutButton } from "#/components/sign-out-button";
import { hasAuthenticatedSession, listOrganizations } from "#/server/functions/auth";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    await hasAuthenticatedSession();
    const organizations = (await listOrganizations()) ?? [];
    if (organizations.length > 0) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <AuthPage title="Create your Organization">
      <CreateOrganizationForm
        submitLabel="Continue"
        onCreated={() => navigate({ to: "/dashboard" })}
      />
      <SignOutButton />
    </AuthPage>
  );
}
