import { buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { viewerSenderFirstName, viewerSenderLine } from "#/lib/viewer-sender";
import { cn } from "#/lib/utils";
import type { VisitorPage } from "#/server/viewer/visitor-gate";

function SenderLine({
  senderName,
  organizationName,
}: {
  senderName: string | null;
  organizationName: string;
}) {
  return (
    <p className="mb-6 text-sm text-muted-foreground">
      {senderName ? (
        <>
          <span className="text-foreground">{senderName}</span> at {organizationName}
        </>
      ) : (
        <span className="text-foreground">{viewerSenderLine(senderName, organizationName)}</span>
      )}
    </p>
  );
}

export function ViewerGatePage({ page }: { page: VisitorPage }) {
  if (page.status === "reveal") {
    return (
      <>
        <SenderLine senderName={page.senderName} organizationName={page.organizationName} />
        <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
          {page.targetTitle}
        </h1>
        {page.emptyVault ? (
          <p className="mt-3 text-base text-muted-foreground">There's nothing in here yet.</p>
        ) : null}
      </>
    );
  }

  if (page.status === "rate_limited") {
    const minutes = Math.max(1, Math.ceil(page.retryAfterSeconds / 60));
    return (
      <>
        <SenderLine senderName={page.senderName} organizationName={page.organizationName} />
        <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
          Too many attempts.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Try again in about {minutes} {minutes === 1 ? "minute" : "minutes"}.
        </p>
      </>
    );
  }

  const firstName = viewerSenderFirstName(page.senderName, page.organizationName);

  return (
    <>
      <SenderLine senderName={page.senderName} organizationName={page.organizationName} />
      {page.requiresPassword ? (
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
