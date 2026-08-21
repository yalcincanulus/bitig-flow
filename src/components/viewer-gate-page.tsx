import { buttonVariants } from "#/components/ui/button-variants";
import { Input } from "#/components/ui/input";
import { ViewerSenderLine } from "#/components/viewer-sender-line";
import { cn } from "#/lib/utils";
import { viewerSenderFirstName } from "#/lib/viewer-sender";
import type {
  GateReceiptItem,
  VisitorGatePage,
  VisitorRateLimitedPage,
} from "#/server/viewer/visitor-gate";

function Receipt({ receipt }: { receipt: ReadonlyArray<GateReceiptItem> }) {
  if (receipt.length === 0) return null;
  return (
    <ul className="mb-6 list-none space-y-1 text-sm text-muted-foreground">
      {receipt.map((item) =>
        item.kind === "password" ? (
          <li key="password">Password accepted</li>
        ) : (
          <li key="email">{item.address}</li>
        ),
      )}
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

export function ViewerGatePage({ page }: { page: VisitorGatePage | VisitorRateLimitedPage }) {
  if (page.status === "rate_limited") {
    return (
      <>
        <ViewerSenderLine senderName={page.senderName} organizationName={page.organizationName} />
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
      <ViewerSenderLine senderName={page.senderName} organizationName={page.organizationName} />
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
      {page.currentRequirement === "email" ? (
        <form method="post">
          <input type="hidden" name="step" value="email" />
          <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
            {firstName} wants to know who opened this.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            {page.requiresVerification
              ? "We'll send a 6-digit code here to check it's you."
              : "No account, no password, and we won't email you."}
          </p>
          <Input
            type="email"
            name="email"
            autoFocus={!disabled}
            disabled={disabled}
            aria-label="Email"
            autoComplete="email"
            className="mt-7 h-14 rounded-lg text-base"
          />
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
      {page.currentRequirement === "code" ? (
        <>
          <form method="post">
            <input type="hidden" name="step" value="code" />
            <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
              Enter the 6-digit code we sent.
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              We sent it to {page.maskedEmail}.
            </p>
            <Input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus={!disabled}
              disabled={disabled}
              aria-label="Code"
              className="mt-7 h-14 rounded-lg text-base"
            />
            {page.error === "wrong_code" ? (
              <p className="mt-3 text-sm text-destructive">
                Wrong code. {page.remainingTries} {page.remainingTries === 1 ? "try" : "tries"}{" "}
                left.
              </p>
            ) : null}
            {page.error === "expired_code" ? (
              <p className="mt-3 text-sm text-destructive">That code has expired.</p>
            ) : null}
            {page.error === "locked_code" ? (
              <p className="mt-3 text-sm text-destructive">Too many tries. Request a new code.</p>
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
          <form method="post" className="mt-3">
            <input type="hidden" name="step" value="resend" />
            <button
              type="submit"
              disabled={disabled || (page.resendAfterSeconds ?? 0) > 0}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-14 w-full rounded-lg text-base",
              )}
            >
              Resend code
            </button>
          </form>
        </>
      ) : null}
    </>
  );
}
