import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { AuthPage } from "#/components/auth-page";
import { Button } from "#/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { formText } from "#/lib/form-text";

export const Route = createFileRoute("/_auth/sign-in")({ component: SignInPage });

function SignInPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const email = formText(form, "email").trim();
    const password = formText(form, "password");

    setPending(true);
    setError(undefined);

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        if (result.error.status === 403) {
          await navigate({ to: "/verify-email", search: { email } });
          return;
        }
        setError(result.error.message ?? "Could not sign in");
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

  return (
    <AuthPage title="Sign in">
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
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
              autoComplete="current-password"
              required
            />
          </Field>
          <FieldError>{error}</FieldError>
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          Sign in
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        No account? <Link to="/sign-up">Sign up</Link>
      </p>
    </AuthPage>
  );
}
