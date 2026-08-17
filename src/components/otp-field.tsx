import { REGEXP_ONLY_DIGITS } from "input-otp";

import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "#/components/ui/input-otp";
import { fieldErrorItems } from "#/lib/form-errors";

type OtpFieldApi = {
  name: string;
  state: {
    value: string;
    meta: { isTouched: boolean; isValid: boolean; errors: unknown[] };
  };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

export function OtpField({ field, label = "Code" }: { field: OtpFieldApi; label?: string }) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <InputOTP
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(value) => field.handleChange(value)}
        aria-invalid={isInvalid}
        autoComplete="one-time-code"
      >
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTPSlot key={index} index={index} aria-invalid={isInvalid} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {isInvalid ? <FieldError errors={fieldErrorItems(field.state.meta.errors)} /> : null}
    </Field>
  );
}
