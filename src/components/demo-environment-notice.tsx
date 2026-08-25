import { useState } from "react";
import { Clock3Icon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

type DemoEnvironmentNoticeProps = Readonly<{
  expiresAt: Date | string;
}>;

function fixedExpiry(expiresAt: Date | string) {
  return new Date(expiresAt).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function DemoEnvironmentNotice({ expiresAt }: DemoEnvironmentNoticeProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function endDemo() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/demo/end", { method: "POST" });
      if (!response.ok) {
        setError("The Demo Environment could not be ended. Try again.");
        setPending(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setError("The Demo Environment could not be ended. Try again.");
    }
    setPending(false);
  }

  return (
    <Alert className="mx-4 mt-4 w-auto">
      <Clock3Icon />
      <AlertTitle>Temporary Demo Environment</AlertTitle>
      <AlertDescription>
        Deleted at{" "}
        <time dateTime={new Date(expiresAt).toISOString()}>{fixedExpiry(expiresAt)}</time>. Do not
        upload confidential or personal material.
        {error && <span className="block text-destructive"> {error}</span>}
      </AlertDescription>
      <AlertAction>
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
            End demo
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End this demo?</AlertDialogTitle>
              <AlertDialogDescription>
                Access is revoked immediately. The Organization, Documents, Vaults, Links, and Demo
                User are deleted and cannot be recovered.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => void endDemo()}
              >
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? "Ending…" : "End demo"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AlertAction>
    </Alert>
  );
}
