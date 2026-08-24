import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthPage } from "#/components/auth-page";
import { OtpField } from "#/components/otp-field";
import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup, FieldSeparator } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";
import { otpSchema } from "#/lib/auth-form-schemas";

const backupCodeSchema = z.object({ code: z.string().trim().min(1, "Enter a backup code") });

export const Route = createFileRoute("/_auth/two-factor")({ component: TwoFactorChallenge });

function TwoFactorChallenge() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string>();
  const totpForm = useForm({
    defaultValues: { otp: "" },
    validators: { onSubmit: otpSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.twoFactor.verifyTotp({
        code: value.otp,
        trustDevice: false,
      });
      if (result.error) {
        setSubmitError("The authenticator code was not accepted.");
        return;
      }
      await navigate({ to: "/operations" });
    },
  });
  const backupForm = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: backupCodeSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await authClient.twoFactor.verifyBackupCode({
        code: value.code,
        trustDevice: false,
      });
      if (result.error) {
        setSubmitError("The backup code was not accepted.");
        return;
      }
      await navigate({ to: "/operations" });
    },
  });

  return (
    <AuthPage title="Two-factor authentication">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void totpForm.handleSubmit();
        }}
      >
        <FieldGroup>
          <totpForm.Field name="otp">
            {(field) => <OtpField field={field} label="Authenticator code" />}
          </totpForm.Field>
          <FieldError>{submitError}</FieldError>
        </FieldGroup>
        <totpForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              Verify
            </Button>
          )}
        </totpForm.Subscribe>
      </form>
      <FieldSeparator>or use a backup code</FieldSeparator>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void backupForm.handleSubmit();
        }}
      >
        <FieldGroup>
          <backupForm.Field name="code">
            {(field) => <TextFormField field={field} label="Backup code" autoComplete="off" />}
          </backupForm.Field>
          <FieldError>{submitError}</FieldError>
        </FieldGroup>
        <backupForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" variant="outline" disabled={!canSubmit || isSubmitting}>
              Use backup code
            </Button>
          )}
        </backupForm.Subscribe>
      </form>
    </AuthPage>
  );
}
