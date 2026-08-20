import { useNavigate } from "@tanstack/react-router";
import { CalendarIcon } from "lucide-react";
import type { FormEvent } from "react";

import { Button } from "#/components/ui/button";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";

type AnalyticsRangeControlsProps = Readonly<{
  from: string;
  to: string;
}> &
  (
    | { linkId: string; documentId?: never }
    | { documentId: string; linkId?: never }
    | { linkId?: never; documentId?: never }
  );

/**
 * The active analytics window, and the two dates that move it.
 *
 * It is a bar rather than a Card. Every analytics screen opened with a box titled "Date range"
 * above the numbers it framed, which gave a control the same weight as a finding. Here the range
 * reads as a caption on the page and the inputs sit beside it.
 */
export function AnalyticsRangeControls({
  from,
  to,
  linkId,
  documentId,
}: AnalyticsRangeControlsProps) {
  const navigate = useNavigate();

  function goToRange(search: { from?: string; to?: string }) {
    if (documentId) {
      void navigate({ to: "/dashboard/documents/$documentId", params: { documentId }, search });
      return;
    }

    if (linkId) {
      void navigate({ to: "/dashboard/analytics/$linkId", params: { linkId }, search });
      return;
    }

    void navigate({ to: "/dashboard/analytics", search });
  }

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const nextFrom = values.get("from");
    const nextTo = values.get("to");
    if (typeof nextFrom !== "string" || typeof nextTo !== "string") return;
    goToRange({ from: nextFrom, to: nextTo });
  }

  return (
    <form
      key={`${from}:${to}`}
      onSubmit={applyRange}
      className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-border pb-3"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarIcon className="size-3.5" />
        <time dateTime={from}>{from}</time> to <time dateTime={to}>{to}</time>, UTC
      </p>
      <div className="ml-auto flex flex-wrap items-end gap-2">
        <Field className="w-36">
          <FieldLabel htmlFor="analytics-from" className="text-[0.625rem] text-muted-foreground">
            From
          </FieldLabel>
          <Input id="analytics-from" name="from" type="date" defaultValue={from} required />
        </Field>
        <Field className="w-36">
          <FieldLabel htmlFor="analytics-to" className="text-[0.625rem] text-muted-foreground">
            To
          </FieldLabel>
          <Input id="analytics-to" name="to" type="date" defaultValue={to} required />
        </Field>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <Button type="button" variant="ghost" onClick={() => goToRange({})}>
          Last 30 days
        </Button>
      </div>
    </form>
  );
}
