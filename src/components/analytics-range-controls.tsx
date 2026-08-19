import { useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
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

  function lastThirtyDays() {
    goToRange({});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Date range</CardTitle>
        <CardDescription>
          Active range: <time dateTime={from}>{from}</time> through <time dateTime={to}>{to}</time>,
          using the UTC clock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={`${from}:${to}`} onSubmit={applyRange}>
          <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="analytics-from">From</FieldLabel>
              <Input id="analytics-from" name="from" type="date" defaultValue={from} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="analytics-to">To</FieldLabel>
              <Input id="analytics-to" name="to" type="date" defaultValue={to} required />
            </Field>
            <Field orientation="horizontal" className="flex-wrap">
              <Button type="submit">Apply range</Button>
              <Button type="button" variant="outline" onClick={lastThirtyDays}>
                Last 30 days
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
