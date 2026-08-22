import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { TextFormField } from "#/components/text-form-field";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { createOrganizationSchema } from "#/lib/auth-form-schemas";
import { createOrganizationFromName } from "#/lib/create-organization";

type CreateOrganizationFormProps = Readonly<{
  submitLabel: string;
  onCreated: () => Promise<void>;
}>;

export function CreateOrganizationForm({ submitLabel, onCreated }: CreateOrganizationFormProps) {
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm({
    defaultValues: { name: "" },
    validators: {
      onSubmit: createOrganizationSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await createOrganizationFromName(value.name);
      if (result.ok) {
        await onCreated();
        return;
      }
      setSubmitError(result.error);
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
        <form.Field name="name">
          {(field) => <TextFormField field={field} label="Name" autoComplete="organization" />}
        </form.Field>
        <FieldError>{submitError}</FieldError>
      </FieldGroup>
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            {submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
