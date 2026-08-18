import { buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { viewerSenderFirstName, viewerSenderLine } from "#/lib/viewer-sender";
import { cn } from "#/lib/utils";
import type { VisitorGate } from "#/server/viewer/visitor-gate";

export function ViewerGatePage({ gate }: { gate: VisitorGate }) {
  const firstName = viewerSenderFirstName(gate.senderName, gate.organizationName);

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">
        {gate.senderName ? (
          <>
            <span className="text-foreground">{gate.senderName}</span> at {gate.organizationName}
          </>
        ) : (
          <span className="text-foreground">
            {viewerSenderLine(gate.senderName, gate.organizationName)}
          </span>
        )}
      </p>
      {gate.requiresPassword ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
            {firstName} shared something with you.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Enter the password they gave you to open it.
          </p>
          <Input
            type="password"
            autoFocus
            aria-label="Password"
            className="mt-7 h-14 rounded-lg text-base"
          />
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-4 h-14 w-full rounded-lg text-base",
            )}
          >
            Continue
          </button>
        </form>
      ) : null}
    </>
  );
}
