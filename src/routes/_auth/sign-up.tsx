import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { AuthPage } from "#/components/auth-page";
import { Button } from "#/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { formText } from "#/lib/form-text";

export const Route = createFileRoute("/_auth/sign-up")({ component: SignUpPage });

function SignUpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const nextName = formText(form, "name").trim();
    const nextEmail = formText(form, "email").trim();
    const nextPassword = formText(form, "password");

    setPending(true);
    setError(undefined);

    try {
      const result = await authClient.signUp.email({
        name: nextName,
        email: nextEmail,
        password: nextPassword,
      });
      if (result.error) {
        setError(result.error.message ?? "Could not sign up");
        return;
      }

      setEmail(nextEmail);
      setPassword(nextPassword);
      setStep("otp");
    } finally {
      setPending(false);
    }
  }

  async function handleOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const otp = formText(new FormData(event.currentTarget), "otp").trim();
    setPending(true);
    setError(undefined);

    try {
      const verified = await authClient.emailOtp.verifyEmail({ email, otp });
      if (verified.error) {
        setError(verified.error.message ?? "Could not verify email");
        return;
      }

      const signedIn = await authClient.signIn.email({ email, password });
      if (signedIn.error) {
        setError(signedIn.error.message ?? "Email verified. Sign in.");
        await navigate({ to: "/sign-in" });
        return;
      }

      const organizations = await authClient.organization.list();
      if ((organizations.data?.length ?? 0) === 0) {
        await navigate({ href: "/onboarding" });
        return;
      }
      await navigate({ to: "/dashboard/documents" });
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (pending) return;
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

  if (step === "otp") {
    return (
      <AuthPage title="Sign up">
        <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {email}.</p>
        <form className="flex flex-col gap-4" onSubmit={(event) => void handleOtp(event)}>
          <FieldGroup>
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
        <Button type="button" variant="ghost" disabled={pending} onClick={() => void resend()}>
          Resend code
        </Button>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Sign up">
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleDetails(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
          <FieldError>{error}</FieldError>
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          Continue
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </AuthPage>
  );
}
