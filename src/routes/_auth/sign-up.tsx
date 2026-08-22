import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthPage } from "#/components/auth-page";
import { OtpField } from "#/components/otp-field";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { goToDashboardOrOnboarding } from "#/lib/after-authentication";
import { authClient } from "#/lib/auth-client";
import { otpSchema, signUpSchema } from "#/lib/auth-form-schemas";

export const Route = createFileRoute("/_auth/sign-up")({ component: SignUpPage });

function SignUpPage() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<{ email: string; password: string }>();

  if (credentials) {
    return <SignUpOtpForm credentials={credentials} navigate={navigate} />;
  }

  return <SignUpDetailsForm onSignedUp={setCredentials} />;
}

function SignUpDetailsForm({
  onSignedUp,
}: {
  onSignedUp: (credentials: { email: string; password: string }) => void;
}) {
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.signUp.email(value);
      if (result.error) {
        setSubmitError(result.error.message ?? "Could not sign up");
        return;
      }
      onSignedUp({ email: value.email, password: value.password });
    },
  });

  return (
    <AuthPage title="Sign up">
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
            {(field) => <TextFormField field={field} label="Name" autoComplete="name" />}
          </form.Field>
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
                autoComplete="new-password"
              />
            )}
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
      <p className="text-sm text-muted-foreground">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </AuthPage>
  );
}

function SignUpOtpForm({
  credentials,
  navigate,
}: {
  credentials: { email: string; password: string };
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { otp: "" },
    validators: {
      onSubmit: otpSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const verified = await authClient.emailOtp.verifyEmail({
        email: credentials.email,
        otp: value.otp,
      });
      if (verified.error) {
        setSubmitError(verified.error.message ?? "Could not verify email");
        return;
      }

      const signedIn = await authClient.signIn.email(credentials);
      if (signedIn.error) {
        await navigate({ to: "/sign-in" });
        return;
      }

      await goToDashboardOrOnboarding(navigate);
    },
  });

  async function resend() {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: credentials.email,
      type: "email-verification",
    });
    if (result.error) {
      setSubmitError(result.error.message ?? "Could not resend the code");
    }
  }

  return (
    <AuthPage title="Sign up">
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code sent to {credentials.email}.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
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
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => void resend()}
          >
            Resend code
          </Button>
        )}
      </form.Subscribe>
    </AuthPage>
  );
}
