import { useRouter } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleAlertIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { fleetDeletionConfirmation } from "#/lib/operations";

type BatchResult = Readonly<{
  processedCount: number;
  remainingCount: number;
  completed: boolean;
  error?: string;
}>;

async function deleteFleetBatch(confirmation: string): Promise<BatchResult> {
  const response = await fetch("/api/operations/demo-environments", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
  const result = (await response.json()) as BatchResult;
  if (!response.ok) throw new Error(result.error ?? "Fleet deletion failed");
  if (!result.completed && result.processedCount === 0) {
    throw new Error("Fleet deletion made no progress");
  }
  return result;
}

export function FleetDeletionControl() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    Readonly<{ kind: "success" | "failure"; title: string; message: string }> | undefined
  >();
  const confirmed = confirmation === fleetDeletionConfirmation;

  async function deleteFleet() {
    if (!confirmed) return;
    setPending(true);
    setFeedback(undefined);
    let processedCount = 0;
    try {
      while (true) {
        const result = await deleteFleetBatch(confirmation);
        processedCount += result.processedCount;
        setFeedback({
          kind: "success",
          title: result.completed ? "Fleet deletion completed" : "Fleet deletion in progress",
          message: `Terminated ${processedCount} demo environments; ${result.remainingCount} remain. Admission is closed.`,
        });
        if (result.completed) break;
      }
      setConfirmation("");
      setOpen(false);
    } catch {
      setFeedback({
        kind: "failure",
        title: "Fleet deletion interrupted",
        message:
          "Admission remains closed after the first accepted batch. Type the confirmation again to resume safely.",
      });
      setOpen(false);
    }
    setPending(false);
    await router.invalidate({ sync: true });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete all demo environments</CardTitle>
        <CardDescription>
          This stops new demos and deletes all existing demos. Anonymous usage summaries are kept.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="fleet-deletion-confirmation">
            Type {fleetDeletionConfirmation}
          </FieldLabel>
          <Input
            id="fleet-deletion-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <FieldDescription>
            Keep this page open until deletion finishes. If interrupted, run this action again to
            continue.
          </FieldDescription>
        </Field>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            disabled={!confirmed || pending}
            render={<Button type="button" variant="destructive" disabled={!confirmed || pending} />}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2Icon data-icon="inline-start" />
            )}
            Delete all demo environments
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start fleet deletion?</AlertDialogTitle>
              <AlertDialogDescription>
                New demos stop immediately. All existing demos and their shared links are
                permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => void deleteFleet()}
              >
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Start deletion
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {feedback ? (
          <Alert
            variant={feedback.kind === "failure" ? "destructive" : "default"}
            aria-live="polite"
          >
            {feedback.kind === "failure" ? <CircleAlertIcon /> : <CheckCircle2Icon />}
            <AlertTitle>{feedback.title}</AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
