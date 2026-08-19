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

function Receipt({ receipt }: { receipt: ReadonlyArray<"password"> }) {
  if (receipt.length === 0) return null;
  return (
    <ul className="mb-6 list-none space-y-1 text-sm text-muted-foreground">
      {receipt.includes("password") ? <li>Password accepted</li> : null}
    </ul>
  );
}

function retryWaitCopy(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

function retryCopy(retryAfterSeconds: number) {
  return `Too many attempts. ${retryWaitCopy(retryAfterSeconds)}`;
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
    return (
      <>
        <SenderLine senderName={page.senderName} organizationName={page.organizationName} />
        <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
          Too many attempts.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {retryWaitCopy(page.retryAfterSeconds)}
        </p>
      </>
    );
  }

  const firstName = viewerSenderFirstName(page.senderName, page.organizationName);
  const retryAfterSeconds = page.retryAfterSeconds;
  const limited = retryAfterSeconds !== undefined;
  const disabled = limited;

  return (
    <>
      <SenderLine senderName={page.senderName} organizationName={page.organizationName} />
      <Receipt receipt={page.receipt} />
      {page.currentRequirement === "password" ? (
        <form method="post">
          <input type="hidden" name="step" value="password" />
          <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
            {firstName} shared something with you.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Enter the password they gave you to open it.
          </p>
          <Input
            type="password"
            name="password"
            autoFocus={!disabled}
            disabled={disabled}
            aria-label="Password"
            className="mt-7 h-14 rounded-lg text-base"
          />
          {page.error === "wrong_password" ? (
            <p className="mt-3 text-sm text-destructive">Wrong password.</p>
          ) : null}
          {limited ? (
            <p className="mt-3 text-sm text-muted-foreground">{retryCopy(retryAfterSeconds)}</p>
          ) : null}
          <button
            type="submit"
            disabled={disabled}
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
