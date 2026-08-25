import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthPage } from "#/components/auth-page";
import { OtpField } from "#/components/otp-field";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { goToDashboardOrOnboarding } from "#/lib/after-authentication";
import { authRedirectSearchSchema } from "#/lib/auth-redirect";
import { authClient } from "#/lib/auth-client";
import { otpSchema, signUpSchema } from "#/lib/auth-form-schemas";
import { publicPortfolioStatus } from "#/server/functions/public-portfolio";

export const Route = createFileRoute("/_auth/sign-up")({
  validateSearch: authRedirectSearchSchema,
  loader: () => publicPortfolioStatus(),
  component: SignUpPage,
});

function SignUpPage() {
  const availability = Route.useLoaderData();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [credentials, setCredentials] = useState<{ email: string; password: string }>();

  if (!availability.signUp) {
    return (
      <AuthPage title="Sign up is unavailable">
        <p className="text-sm text-muted-foreground">
          This deployment is not accepting durable sign-ups. You can return home to check Demo
          availability or sign in with your existing credentials.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link to="/" />}>
            Return home
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/sign-in" search={{ redirect: search.redirect }} />}
          >
            Sign in
          </Button>
        </div>
      </AuthPage>
    );
  }

  if (credentials) {
    return (
      <SignUpOtpForm credentials={credentials} navigate={navigate} redirect={search.redirect} />
    );
  }

  return <SignUpDetailsForm onSignedUp={setCredentials} redirect={search.redirect} />;
}

function SignUpDetailsForm({
  onSignedUp,
  redirect,
}: {
  onSignedUp: (credentials: { email: string; password: string }) => void;
  redirect?: string;
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
        Already have an account?{" "}
        <Link to="/sign-in" search={{ redirect }}>
          Sign in
        </Link>
      </p>
    </AuthPage>
  );
}

function SignUpOtpForm({
  credentials,
  navigate,
  redirect,
}: {
  credentials: { email: string; password: string };
  navigate: ReturnType<typeof useNavigate>;
  redirect?: string;
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

      await goToDashboardOrOnboarding(navigate, redirect);
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
