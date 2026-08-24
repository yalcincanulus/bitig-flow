import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AuthPage } from "#/components/auth-page";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";
import { forgotPasswordSchema } from "#/lib/auth-form-schemas";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: new URL("/reset-password", window.location.origin).toString(),
      });
      if (result.error) {
        setSubmitError("Password recovery is not available. Try again later.");
        return;
      }
      setSubmitted(true);
    },
  });

  return (
    <AuthPage title="Forgot password">
      {submitted ? (
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, a password reset link is on its way.
        </p>
      ) : (
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
            <FieldError>{submitError}</FieldError>
          </FieldGroup>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                Send reset link
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        <Link to="/sign-in">Return to sign in</Link>
      </p>
    </AuthPage>
  );
}
