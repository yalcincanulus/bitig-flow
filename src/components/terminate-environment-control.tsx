import { useRouter } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
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
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

export function TerminateEnvironmentControl({
  environmentId,
  reference,
}: Readonly<{ environmentId: string; reference: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function terminate() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/operations/demo-environments/${encodeURIComponent(environmentId)}/end`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("termination failed");
      }
      setOpen(false);
      await router.invalidate({ sync: true });
    } catch {
      setError("The Demo Environment could not be terminated.");
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
          <Trash2Icon data-icon="inline-start" />
          Terminate
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Demo Environment {reference}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sessions and Links are disabled first. The shared resumable workflow then writes a
              content-free Summary and deletes the isolated Organization and Demo User.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void terminate()}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p className="max-w-48 text-right text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}
