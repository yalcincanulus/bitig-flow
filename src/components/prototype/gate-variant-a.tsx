// PROTOTYPE — Variant A "Envelope".
// Premise: this is *mail*. A person sent you something. Lead with the person and the
// title, keep everything on one warm centred card, and treat the gate as a formality
// between you and a thing you were already invited to see.
import { FileText, ImageIcon, Lock, Mail, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { LINK, MASKED_EMAIL, VAULT_ITEMS, stepOf, type Scenario } from './gate-scenarios'
import { useCountdown } from './use-countdown'

export function GateVariantA({ scenario }: { scenario: Scenario }) {
  const step = stepOf(scenario)

  return (
    <div className="min-h-dvh bg-gradient-to-b from-muted/60 to-background px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        {scenario === 'unavailable' ? (
          <Unavailable />
        ) : step === null ? (
          <Passed empty={scenario === 'passed-vault-empty'} />
        ) : (
          <Envelope scenario={scenario} step={step} />
        )}
        <p className="mt-8 text-center text-[11px] text-muted-foreground/70">
          Shared with bitig
        </p>
      </div>
    </div>
  )
}

function Envelope({
  scenario,
  step,
}: {
  scenario: Scenario
  step: 'password' | 'email' | 'code'
}) {
  const order: Array<'password' | 'email' | 'code'> = ['password', 'email', 'code']
  const current = order.indexOf(step)

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Sender header — the emotional anchor of this variant */}
      <div className="flex items-center gap-3 border-b bg-muted/40 px-6 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {LINK.senderInitials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{LINK.senderName}</p>
          <p className="truncate text-xs text-muted-foreground">{LINK.orgName}</p>
        </div>
      </div>

      <div className="px-6 pt-6">
        <p className="text-sm text-muted-foreground">shared a set of documents with you</p>
        <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight">
          {LINK.targetTitle}
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {LINK.itemCount} documents · opens in your browser
        </p>
      </div>

      {/* Redacted peek — you can see there is something, not what */}
      <div className="mt-5 px-6">
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 select-none">
          {[92, 78, 85, 60].map((w, i) => (
            <div key={i} className="h-2.5 rounded bg-foreground/10" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>

      <div className="px-6 pt-6 pb-6">
        {step === 'password' && <PasswordStep wrong={scenario === 'password-wrong'} />}
        {step === 'email' && <EmailStep />}
        {step === 'code' && <CodeStep scenario={scenario} />}
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t bg-muted/20 px-6 py-3">
        {order.map((s, i) => (
          <span
            key={s}
            className={
              'h-1.5 rounded-full transition-all ' +
              (i === current
                ? 'w-5 bg-primary'
                : i < current
                  ? 'w-1.5 bg-primary/40'
                  : 'w-1.5 bg-foreground/15')
            }
          />
        ))}
      </div>
    </div>
  )
}

function PasswordStep({ wrong }: { wrong: boolean }) {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <label htmlFor="a-pw" className="flex items-center gap-1.5 text-sm font-medium">
        <Lock className="size-3.5 text-muted-foreground" />
        This one needs a password
      </label>
      <Input
        id="a-pw"
        type="password"
        autoFocus
        placeholder="Password"
        aria-invalid={wrong}
        className="h-11 text-base"
      />
      {wrong && (
        <p className="text-xs text-destructive">
          That password didn’t work. Check the message it came in.
        </p>
      )}
      <Button type="submit" className="h-11 w-full text-sm">
        Continue
      </Button>
    </form>
  )
}

function EmailStep() {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <label htmlFor="a-em" className="flex items-center gap-1.5 text-sm font-medium">
        <Mail className="size-3.5 text-muted-foreground" />
        Who should we say is reading?
      </label>
      <Input
        id="a-em"
        type="email"
        inputMode="email"
        autoFocus
        placeholder="you@company.com"
        className="h-11 text-base"
      />
      <p className="text-xs text-muted-foreground">
        {LINK.senderName.split(' ')[0]} sees this next to your visit. You’re not making an
        account and there’s nothing to sign into.
      </p>
      <Button type="submit" className="h-11 w-full text-sm">
        Continue
      </Button>
    </form>
  )
}

function CodeStep({ scenario }: { scenario: Scenario }) {
  const [cooldown, reset] = useCountdown(60)
  const [retry] = useCountdown(scenario === 'rate-limited' ? 247 : 0)
  const locked = scenario === 'code-locked'
  const limited = scenario === 'rate-limited'

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck className="size-3.5 text-muted-foreground" />
        We sent a 6-digit code to {MASKED_EMAIL}
      </label>
      <InputOTP maxLength={6} disabled={locked || limited} containerClassName="justify-center">
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
          ))}
        </InputOTPGroup>
      </InputOTP>

      {scenario === 'code-wrong' && (
        <p className="text-center text-xs text-destructive">
          That code isn’t right. 3 tries left.
        </p>
      )}
      {scenario === 'code-expired' && (
        <p className="text-center text-xs text-destructive">
          That code has expired. Send yourself a new one.
        </p>
      )}
      {locked && (
        <p className="text-center text-xs text-destructive">
          Too many wrong codes. Request a new code to try again.
        </p>
      )}
      {limited && (
        <p className="text-center text-xs text-destructive">
          Too many attempts. Try again in about {Math.ceil(retry / 60)} minutes.
        </p>
      )}

      <Button type="submit" disabled={locked || limited} className="h-11 w-full text-sm">
        Open {LINK.targetTitle}
      </Button>
      <button
        type="button"
        disabled={cooldown > 0 || limited}
        onClick={reset}
        className="w-full py-1 text-center text-xs text-muted-foreground underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
      >
        {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
      </button>
    </form>
  )
}

function Unavailable() {
  return (
    <div className="rounded-2xl border bg-card px-6 py-10 text-center shadow-sm">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">This link isn’t available</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        It may have expired or been turned off. The person who sent it to you can share a new
        one.
      </p>
    </div>
  )
}

function Passed({ empty }: { empty: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-6 py-5">
        <p className="text-xs text-muted-foreground">
          {LINK.senderName} · {LINK.orgName}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{LINK.targetTitle}</h1>
      </div>
      {empty ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium">Nothing here yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            {LINK.senderName.split(' ')[0]} hasn’t added any documents to this one. Check back,
            or let them know.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {VAULT_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex items-center gap-3 px-6 py-4 hover:bg-muted/40"
              >
                {item.kind === 'image' ? (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.meta}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
