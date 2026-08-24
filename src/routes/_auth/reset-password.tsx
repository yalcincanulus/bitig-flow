import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthPage } from "#/components/auth-page";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";
import { resetPasswordSchema } from "#/lib/auth-form-schemas";

const resetPasswordSearchSchema = z
  .object({
    token: z.string().min(1).optional(),
    error: z.string().optional(),
  })
  .catch({ token: undefined, error: undefined });

export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const search = Route.useSearch();
  const [complete, setComplete] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { password: "", confirmation: "" },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      if (!search.token) return;
      setSubmitError(undefined);
      const result = await authClient.resetPassword({
        newPassword: value.password,
        token: search.token,
      });
      if (result.error) {
        setSubmitError("This reset link is invalid or has expired.");
        return;
      }
      setComplete(true);
    },
  });

  if (complete) {
    return (
      <AuthPage title="Password reset">
        <p className="text-sm text-muted-foreground">
          Your password has changed. Existing sessions have been signed out.
        </p>
        <Link to="/sign-in">Sign in</Link>
      </AuthPage>
    );
  }

  if (!search.token || search.error) {
    return (
      <AuthPage title="Reset password">
        <p className="text-sm text-muted-foreground">This reset link is invalid or has expired.</p>
        <Link to="/forgot-password">Request another link</Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Reset password">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="password">
            {(field) => (
              <TextFormField
                field={field}
                label="New password"
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.Field>
          <form.Field name="confirmation">
            {(field) => (
              <TextFormField
                field={field}
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.Field>
          <FieldError>{submitError}</FieldError>
        </FieldGroup>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              Reset password
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  );
}
