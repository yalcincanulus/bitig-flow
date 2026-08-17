import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { fieldErrorItems } from "#/lib/form-errors";

type TextFieldApi = {
  name: string;
  state: {
    value: string;
    meta: { isTouched: boolean; isValid: boolean; errors: unknown[] };
  };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

export function TextFormField({
  field,
  label,
  type = "text",
  autoComplete,
}: {
  field: TextFieldApi;
  label: string;
  type?: React.HTMLInputTypeAttribute;
  autoComplete?: string;
}) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        autoComplete={autoComplete}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={isInvalid}
      />
      {isInvalid ? <FieldError errors={fieldErrorItems(field.state.meta.errors)} /> : null}
    </Field>
  );
}
