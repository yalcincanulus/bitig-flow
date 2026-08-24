import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthPage } from "#/components/auth-page";
import { OtpField } from "#/components/otp-field";
import { TextFormField } from "#/components/text-form-field";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { buttonVariants } from "#/components/ui/button-variants";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";
import { otpSchema } from "#/lib/auth-form-schemas";
import { platformOperatorRouteAccess } from "#/server/functions/operators";

const passwordSchema = z.object({ password: z.string().min(1, "Enter your password") });

export const Route = createFileRoute("/operations/enroll")({
  beforeLoad: async () => {
    const access = await platformOperatorRouteAccess();
    if (!access.isOperator) throw notFound();
    if (access.twoFactorEnrolled) throw redirect({ to: "/operations" });
  },
  component: OperatorEnrollment,
});

type Enrollment = Readonly<{ totpURI: string; backupCodes: string[] }>;

function OperatorEnrollment() {
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [complete, setComplete] = useState(false);

  if (complete && enrollment) {
    return (
      <AuthPage title="Save your backup codes">
        <Alert>
          <AlertTitle>Two-factor authentication is active</AlertTitle>
          <AlertDescription>
            Store these one-time codes somewhere secure. They will not be shown here again.
          </AlertDescription>
        </Alert>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
          {enrollment.backupCodes.map((code) => (
            <li key={code} className="rounded-md border border-border px-3 py-2">
              {code}
            </li>
          ))}
        </ul>
        <Link to="/operations" className={buttonVariants()}>
          Continue to Operations
        </Link>
      </AuthPage>
    );
  }

  if (enrollment) {
    return (
      <AuthPage title="Add an authenticator">
        <p className="text-sm text-muted-foreground">
          Open this setup link with your authenticator app, then enter its 6-digit code.
        </p>
        <a className="break-all text-sm underline underline-offset-4" href={enrollment.totpURI}>
          Open authenticator setup
        </a>
        <VerifyEnrollmentForm onVerified={() => setComplete(true)} />
      </AuthPage>
    );
  }

  return <BeginEnrollmentForm onEnabled={setEnrollment} />;
}

function BeginEnrollmentForm({ onEnabled }: { onEnabled: (enrollment: Enrollment) => void }) {
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.twoFactor.enable({ password: value.password });
      if (result.error) {
        setSubmitError(result.error.message ?? "Could not start enrollment");
        return;
      }
      onEnabled(result.data);
    },
  });

  return (
    <AuthPage title="Secure Operations">
      <p className="text-sm text-muted-foreground">
        The Platform Operator must enroll an authenticator before Operations can open.
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
              Continue
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  );
}

function VerifyEnrollmentForm({ onVerified }: { onVerified: () => void }) {
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { otp: "" },
    validators: { onSubmit: otpSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.twoFactor.verifyTotp({
        code: value.otp,
        trustDevice: false,
      });
      if (result.error) {
        setSubmitError(result.error.message ?? "Could not verify this code");
        return;
      }
      onVerified();
    },
  });

  return (
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
            Verify authenticator
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
