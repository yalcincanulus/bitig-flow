import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthPage } from "#/components/auth-page";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { goToDashboardOrOnboarding } from "#/lib/after-authentication";
import { authClient } from "#/lib/auth-client";
import { signInSchema } from "#/lib/auth-form-schemas";

export const Route = createFileRoute("/_auth/sign-in")({ component: SignInPage });

function SignInPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.signIn.email(value);
      if (result.error) {
        if (result.error.status === 403) {
          await navigate({ to: "/verify-email", search: { email: value.email } });
          return;
        }
        setSubmitError(result.error.message ?? "Could not sign in");
        return;
      }

      await goToDashboardOrOnboarding(navigate);
    },
  });

  return (
    <AuthPage title="Sign in">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => (
              <TextFormField field={field} label="Email" type="email" autoComplete="email" />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <TextFormField
                field={field}
                label="Password"
                type="password"
                autoComplete="current-password"
              />
            )}
          </form.Field>
          <FieldError>{submitError}</FieldError>
        </FieldGroup>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              Sign in
            </Button>
          )}
        </form.Subscribe>
      </form>
      <p className="text-sm text-muted-foreground">
        No account? <Link to="/sign-up">Sign up</Link>
      </p>
    </AuthPage>
  );
}
