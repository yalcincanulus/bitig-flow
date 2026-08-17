import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { AuthPage } from "#/components/auth-page";
import { Button } from "#/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { formText } from "#/lib/form-text";
import { verifyEmailSearchSchema } from "#/lib/verify-email-search";

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const nextEmail = formText(form, "email").trim();
    const otp = formText(form, "otp").trim();

    setPending(true);
    setError(undefined);

    try {
      const result = await authClient.emailOtp.verifyEmail({ email: nextEmail, otp });
      if (result.error) {
        setError(result.error.message ?? "Could not verify email");
        return;
      }

      setEmail(nextEmail);
      setVerified(true);
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (pending || !email) return;
    setPending(true);
    setError(undefined);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (result.error) setError(result.error.message ?? "Could not resend the code");
    } finally {
      setPending(false);
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
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="otp">Code</FieldLabel>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
            />
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          Verify
        </Button>
      </form>
      <Button
        type="button"
        variant="ghost"
        disabled={pending || !email}
        onClick={() => void resend()}
      >
        Resend code
      </Button>
    </AuthPage>
  );
}
