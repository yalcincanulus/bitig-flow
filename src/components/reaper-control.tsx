import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

type ReaperResult = Readonly<{
  acquired: boolean;
  completedEnvironmentCount?: number;
  deferredStorageCount?: number;
}>;

export function ReaperControl() {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    Readonly<{ kind: "success" | "failure"; message: string }> | undefined
  >();

  async function runReaper() {
    setPending(true);
    setFeedback(undefined);
    try {
      const response = await fetch("/api/operations/reaper", { method: "POST" });
      if (response.ok) {
        const result = (await response.json()) as ReaperResult;
        setFeedback({
          kind: "success",
          message: result.acquired
            ? `Completed ${result.completedEnvironmentCount ?? 0} environment cleanups; deferred ${result.deferredStorageCount ?? 0} storage cleanups.`
            : "Another Reaper already holds the maintenance lock.",
        });
      } else {
        setFeedback({
          kind: "failure",
          message:
            "The Reaper could not run. Demo admission remains closed if cleanup is unhealthy.",
        });
      }
    } catch {
      setFeedback({
        kind: "failure",
        message: "The Reaper could not run. Demo admission remains closed if cleanup is unhealthy.",
      });
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button type="button" variant="outline" disabled={pending} onClick={() => void runReaper()}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Run Reaper now
      </Button>
      {feedback ? (
        <Alert variant={feedback.kind === "failure" ? "destructive" : "default"}>
          <AlertTitle>
            {feedback.kind === "failure" ? "Reaper failed" : "Reaper finished"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
