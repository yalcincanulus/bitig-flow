// PROTOTYPE — Variant C "Doorway". *** This variant won — it is the reference. ***
// Premise: the Gate reveals the sender and nothing about the target. The title is often
// the sensitive part ("Series B Term Sheet") and anyone holding the URL is exactly the
// population being gated against — but an unattributed password prompt is a phishing
// page, so the sender is named. No card, no chrome: one left-aligned column identical on
// a phone and a 27" monitor, with a receipt of what you've already answered instead of a
// stepper. The reveal is the reward for passing.
//
// Decisions folded in from issue #15: ADR-0044 (column + receipt), ADR-0045 (sender line,
// never the target), ADR-0046 (two email copies), ADR-0047 (terminal page), ADR-0048
// (44px minimum control height).
import { Check, FileText, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LINK, MASKED_EMAIL, VAULT_ITEMS, stepOf, type Scenario } from "./gate-scenarios";
import { useCountdown } from "./use-countdown";

export function GateVariantC({ scenario }: { scenario: Scenario }) {
  const step = stepOf(scenario);

  return (
    <div className="min-h-dvh px-6 pt-14 pb-24 sm:pt-24">
      <div className="mx-auto w-full max-w-[26rem]">
        <div className="mb-10 font-mono text-xs tracking-tight text-muted-foreground">bitig</div>
        {scenario === "unavailable" ? (
          <Unavailable />
        ) : step === null ? (
          <Passed empty={scenario === "passed-vault-empty"} />
        ) : (
          <>
            <SenderLine />
            <Receipt step={step} />
            {step === "password" && <PasswordStep wrong={scenario === "password-wrong"} />}
            {step === "email" && <EmailStep codeFollows={scenario !== "email-capture-only"} />}
            {step === "code" && <CodeStep scenario={scenario} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * ADR-0045 — the only pre-gate context. The creator plus their organization, never the
 * target. `link.created_by` is SET NULL, so this degrades to the organization alone.
 */
function SenderLine() {
  return (
    <p className="mb-6 text-sm text-muted-foreground">
      {LINK.senderName ? (
        <>
          <span className="text-foreground">{LINK.senderName}</span> at {LINK.orgName}
        </>
      ) : (
        <span className="text-foreground">{LINK.orgName}</span>
      )}
    </p>
  );
}

/** What you've already answered — replaces the stepper, and never previews what's ahead. */
function Receipt({ step }: { step: "password" | "email" | "code" }) {
  const done: Array<string> = [];
  if (step === "email" || step === "code") done.push("Password accepted");
  if (step === "code") done.push("a.ulus@gmail.com");
  if (done.length === 0) return null;
  return (
    <ul className="mb-8 space-y-1.5">
      {done.map((d) => (
        <li key={d} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-3.5 text-foreground/40" />
          {d}
        </li>
      ))}
    </ul>
  );
}

function PasswordStep({ wrong }: { wrong: boolean }) {
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        {LINK.senderName.split(" ")[0]} shared something with you.
      </h1>
      <p className="mt-3 text-base text-muted-foreground">
        Enter the password they gave you to open it.
      </p>
      <Input
        type="password"
        autoFocus
        aria-invalid={wrong}
        aria-label="Password"
        className="mt-7 h-14 rounded-lg text-base"
      />
      {wrong && <p className="mt-2 text-sm text-destructive">Wrong password.</p>}
      <Button type="submit" className="mt-4 h-14 w-full rounded-lg text-base">
        Continue
      </Button>
    </form>
  );
}

/** ADR-0046 — two copies, chosen by the server on `requires_verification`. */
function EmailStep({ codeFollows }: { codeFollows: boolean }) {
  const first = LINK.senderName.split(" ")[0];
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        What’s your email?
      </h1>
      <p className="mt-3 text-base text-muted-foreground">
        {codeFollows
          ? `${first} wants to know who opened this. We’ll send a 6-digit code here to check it’s you.`
          : `${first} wants to know who opened this. No account, no password, and we won’t email you.`}
      </p>
      <Input
        type="email"
        inputMode="email"
        autoFocus
        aria-label="Email address"
        placeholder="you@company.com"
        className="mt-7 h-14 rounded-lg text-base"
      />
      <Button type="submit" className="mt-4 h-14 w-full rounded-lg text-base">
        Continue
      </Button>
    </form>
  );
}

function CodeStep({ scenario }: { scenario: Scenario }) {
  const [cooldown, reset] = useCountdown(60);
  const [retry] = useCountdown(scenario === "rate-limited" ? 247 : 0);
  const locked = scenario === "code-locked";
  const limited = scenario === "rate-limited";

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        Enter the code we emailed you.
      </h1>
      <p className="mt-3 text-base text-muted-foreground">Sent to {MASKED_EMAIL}.</p>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        disabled={locked || limited}
        aria-label="Verification code"
        aria-invalid={scenario === "code-wrong" || scenario === "code-expired"}
        className="mt-7 h-16 rounded-lg text-center font-mono text-3xl tracking-[0.4em]"
      />
      {scenario === "code-wrong" && (
        <p className="mt-2 text-sm text-destructive">Wrong code. 3 tries left.</p>
      )}
      {scenario === "code-expired" && (
        <p className="mt-2 text-sm text-destructive">That code expired.</p>
      )}
      {locked && (
        <p className="mt-2 text-sm text-destructive">
          Too many wrong codes. Get a new one to keep going.
        </p>
      )}
      {limited && (
        <p className="mt-2 text-sm text-destructive">
          Too many tries. Wait about {Math.ceil(retry / 60)} minutes.
        </p>
      )}
      <Button
        type="submit"
        disabled={locked || limited}
        className="mt-4 h-14 w-full rounded-lg text-base"
      >
        Continue
      </Button>
      <button
        type="button"
        disabled={cooldown > 0 || limited}
        onClick={reset}
        className="mt-6 text-base text-muted-foreground underline underline-offset-4 disabled:no-underline disabled:opacity-60"
      >
        {cooldown > 0 ? `New code in ${cooldown}s` : "Email me a new code"}
      </button>
    </form>
  );
}

function Unavailable() {
  return (
    <div>
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        This link isn’t available.
      </h1>
      <p className="mt-3 text-base text-muted-foreground">
        Ask whoever sent it to you for a new one.
      </p>
    </div>
  );
}

function Passed({ empty }: { empty: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {LINK.senderName} · {LINK.orgName}
      </p>
      <h1 className="mt-1 text-2xl leading-snug font-medium tracking-tight text-balance">
        {LINK.targetTitle}
      </h1>
      {empty ? (
        <p className="mt-8 text-base text-muted-foreground">There’s nothing in here yet.</p>
      ) : (
        <ul className="mt-8 -mx-3">
          {VAULT_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex items-center gap-3 rounded-lg px-3 py-4 active:bg-muted sm:hover:bg-muted"
              >
                {item.kind === "image" ? (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{item.title}</span>
                  <span className="block text-sm text-muted-foreground">{item.meta}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
