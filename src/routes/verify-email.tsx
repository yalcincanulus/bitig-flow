import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AuthPage } from "#/components/auth-page";
import { OtpField } from "#/components/otp-field";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";
import { verifyEmailSchema } from "#/lib/auth-form-schemas";
import { verifyEmailSearchSchema } from "#/lib/verify-email-search";

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const search = Route.useSearch();
  const [verified, setVerified] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: {
      email: search.email ?? "",
      otp: "",
    },
    validators: {
      onSubmit: verifyEmailSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.emailOtp.verifyEmail({
        email: value.email,
        otp: value.otp,
      });
      if (result.error) {
        setSubmitError(result.error.message ?? "Could not verify email");
        return;
      }
      setVerified(true);
    },
  });

  async function resend() {
    const email = form.getFieldValue("email");
    if (!email) return;
    const result = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (result.error) {
      setSubmitError(result.error.message ?? "Could not resend the code");
    }
  }

  if (verified) {
    return (
      <AuthPage title="Verify email">
        <p>Email verified — sign in.</p>
        <Link to="/sign-in">Sign in</Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Verify email">
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
          <form.Field name="otp">{(field) => <OtpField field={field} />}</form.Field>
          <FieldError>{submitError}</FieldError>
        </FieldGroup>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              Verify
            </Button>
          )}
        </form.Subscribe>
      </form>
      <form.Subscribe selector={(state) => [state.isSubmitting, state.values.email] as const}>
        {([isSubmitting, email]) => (
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting || !email}
            onClick={() => void resend()}
          >
            Resend code
          </Button>
        )}
      </form.Subscribe>
    </AuthPage>
  );
}
