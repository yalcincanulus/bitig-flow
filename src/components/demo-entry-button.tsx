import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

export function DemoEntryButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [entryKey] = useState(() => crypto.randomUUID());

  async function enter() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/demo/entry", {
        method: "POST",
        headers: { "x-demo-entry-key": entryKey },
      });
      const result = (await response.json()) as { redirectTo?: string; error?: string };
      if (!response.ok || !result.redirectTo) {
        setError(result.error ?? "Demo entry is unavailable. Try again later.");
        setPending(false);
        return;
      }
      window.location.assign(result.redirectTo);
    } catch {
      setError("Demo entry is unavailable. Try again later.");
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" disabled={pending} onClick={() => void enter()}>
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Preparing demo…" : "Try the demo"}
      </Button>
      {error && (
        <p className="max-w-sm text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
