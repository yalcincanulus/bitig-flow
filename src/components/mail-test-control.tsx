import { CheckCircle2Icon, CircleAlertIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

export function MailTestControl({
  available,
  operatorEmail,
}: Readonly<{ available: boolean; operatorEmail: string }>) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    Readonly<{ kind: "success" | "failure"; message: string }> | undefined
  >();

  async function sendTestEmail() {
    setPending(true);
    setFeedback(undefined);
    try {
      const response = await fetch("/api/operations/mail/test", { method: "POST" });
      const result = (await response.json()) as { sentTo?: string; error?: string };
      setFeedback(
        response.ok
          ? { kind: "success", message: `Test email sent to ${result.sentTo}.` }
          : { kind: "failure", message: result.error ?? "Test email could not be sent." },
      );
    } catch {
      setFeedback({ kind: "failure", message: "Test email could not be sent." });
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={!available || pending}
        onClick={() => void sendTestEmail()}
      >
        {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
        Send test email
      </Button>
      <p className="text-xs text-muted-foreground">
        The recipient is fixed to the Platform Operator address: {operatorEmail}.
      </p>
      {feedback ? (
        <Alert variant={feedback.kind === "failure" ? "destructive" : "default"} aria-live="polite">
          {feedback.kind === "failure" ? <CircleAlertIcon /> : <CheckCircle2Icon />}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
