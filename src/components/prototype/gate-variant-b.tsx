// PROTOTYPE — Variant B "Counter".
// Premise: this is a *transaction*. Tell the Visitor exactly what they're getting, how
// many steps stand between them and it, and which one they're on. A persistent context
// rail carries the facts; the right pane carries one question at a time. Stacks on mobile
// with the rail collapsed to a header strip.
import { AlertCircle, Files, FileText, ImageIcon, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LINK, MASKED_EMAIL, VAULT_ITEMS, stepOf, type Scenario } from './gate-scenarios'
import { useCountdown } from './use-countdown'

const STEPS = [
  { key: 'password', label: 'Password' },
  { key: 'email', label: 'Your email' },
  { key: 'code', label: 'Verify email' },
] as const

export function GateVariantB({ scenario }: { scenario: Scenario }) {
  const step = stepOf(scenario)

  if (scenario === 'unavailable') return <Unavailable />
  if (step === null) return <Passed empty={scenario === 'passed-vault-empty'} />

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[22rem_1fr] lg:grid-rows-1">
      <ContextRail />
      <main className="flex items-start justify-center px-5 py-8 lg:items-center lg:py-0">
        <div className="w-full max-w-sm">
          <Stepper current={step} />
          <div className="mt-6">
            {step === 'password' && <PasswordStep wrong={scenario === 'password-wrong'} />}
            {step === 'email' && <EmailStep />}
            {step === 'code' && <CodeStep scenario={scenario} />}
          </div>
        </div>
      </main>
    </div>
  )
}

function ContextRail() {
  return (
    <aside className="border-b bg-foreground px-5 py-5 text-background lg:border-r lg:border-b-0 lg:px-7 lg:py-8">
      <div className="flex items-start justify-between gap-4 lg:block">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-background/50 uppercase">
            Shared with you
          </p>
          <h1 className="mt-1.5 truncate text-lg leading-tight font-semibold lg:text-xl lg:whitespace-normal">
            {LINK.targetTitle}
          </h1>
        </div>
        <div className="hidden h-px bg-background/15 lg:my-6 lg:block" />
        <dl className="shrink-0 space-y-1 text-right text-xs text-background/60 lg:space-y-3 lg:text-left lg:text-[13px]">
          <div className="lg:flex lg:items-center lg:gap-2">
            <Files className="hidden size-3.5 lg:block" />
            <span>{LINK.itemCount} documents</span>
          </div>
          <div className="lg:flex lg:items-center lg:gap-2">
            <Clock className="hidden size-3.5 lg:block" />
            <span>Access expires 30 Sep</span>
          </div>
        </dl>
      </div>
      <p className="mt-4 hidden text-[13px] text-background/60 lg:block">
        Sent by <span className="text-background">{LINK.senderName}</span> at {LINK.orgName}.
      </p>
    </aside>
  )
}

function Stepper({ current }: { current: 'password' | 'email' | 'code' }) {
  const i = STEPS.findIndex((s) => s.key === current)
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        Step {i + 1} of {STEPS.length}
      </p>
      <ol className="mt-2 flex gap-1.5">
        {STEPS.map((s, n) => (
          <li key={s.key} className="flex-1">
            <div
              className={
                'h-1 rounded-full ' +
                (n < i ? 'bg-primary/40' : n === i ? 'bg-primary' : 'bg-border')
              }
            />
            <span
              className={
                'mt-1.5 block text-[11px] ' +
                (n === i ? 'font-medium text-foreground' : 'text-muted-foreground')
              }
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Field({ children }: { children: React.ReactNode }) {
  return <form onSubmit={(e) => e.preventDefault()} className="space-y-3.5">{children}</form>
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function PasswordStep({ wrong }: { wrong: boolean }) {
  return (
    <Field>
      <div>
        <h2 className="text-lg font-semibold">Enter the password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          It was sent separately from this link.
        </p>
      </div>
      <Input
        type="password"
        autoFocus
        placeholder="••••••••"
        aria-invalid={wrong}
        className="h-11 text-base"
      />
      {wrong && <ErrorLine>Incorrect password.</ErrorLine>}
      <Button type="submit" className="h-11 w-full text-sm">
        Continue
      </Button>
    </Field>
  )
}

function EmailStep() {
  return (
    <Field>
      <div>
        <h2 className="text-lg font-semibold">Your email address</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {LINK.senderName} asked to know who opens this. It’s recorded against your visit —
          it isn’t a login, and nothing is sent to you.
        </p>
      </div>
      <Input
        type="email"
        inputMode="email"
        autoFocus
        placeholder="you@company.com"
        className="h-11 text-base"
      />
      <Button type="submit" className="h-11 w-full text-sm">
        Continue
      </Button>
    </Field>
  )
}

function CodeStep({ scenario }: { scenario: Scenario }) {
  const [cooldown, reset] = useCountdown(60)
  const [retry] = useCountdown(scenario === 'rate-limited' ? 247 : 0)
  const locked = scenario === 'code-locked'
  const limited = scenario === 'rate-limited'

  return (
    <Field>
      <div>
        <h2 className="text-lg font-semibold">Check your inbox</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="text-foreground">{MASKED_EMAIL}</span>.
        </p>
      </div>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        disabled={locked || limited}
        placeholder="000000"
        aria-invalid={scenario === 'code-wrong' || scenario === 'code-expired'}
        className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
      />
      {scenario === 'code-wrong' && (
        <ErrorLine>Incorrect code — 3 attempts remaining.</ErrorLine>
      )}
      {scenario === 'code-expired' && (
        <ErrorLine>This code has expired. Request a new one below.</ErrorLine>
      )}
      {locked && (
        <ErrorLine>
          Too many incorrect codes. Request a new code to reset your attempts.
        </ErrorLine>
      )}
      {limited && (
        <ErrorLine>
          Too many attempts. Try again in about {Math.ceil(retry / 60)} minutes.
        </ErrorLine>
      )}
      <Button type="submit" disabled={locked || limited} className="h-11 w-full text-sm">
        Verify and continue
      </Button>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Didn’t get it?</span>
        <button
          type="button"
          disabled={cooldown > 0 || limited}
          onClick={reset}
          className="font-medium text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </Field>
  )
}

function Unavailable() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">This link isn’t available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired or been turned off. Contact the person who sent it to you.
        </p>
      </div>
    </div>
  )
}

function Passed({ empty }: { empty: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-foreground px-5 py-4 text-background lg:px-7">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-4">
          <h1 className="truncate text-base font-semibold">{LINK.targetTitle}</h1>
          <p className="shrink-0 text-xs text-background/60">{LINK.senderName}</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-6 lg:px-7">
        {empty ? (
          <div className="rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This share is empty. Nothing has been added to it.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 font-medium">Document</th>
                <th className="py-2 text-right font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {VAULT_ITEMS.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-3">
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="flex items-center gap-2.5 font-medium"
                    >
                      {item.kind === 'image' ? (
                        <ImageIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <FileText className="size-4 text-muted-foreground" />
                      )}
                      {item.title}
                    </a>
                  </td>
                  <td className="py-3 text-right text-xs text-muted-foreground">{item.meta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  )
}
