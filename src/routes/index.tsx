import { Link, createFileRoute, isRedirect } from "@tanstack/react-router";
import { ChartNoAxesCombinedIcon, CircleAlertIcon, FolderClosedIcon, LockIcon } from "lucide-react";

import { ThemeToggle } from "#/components/theme-toggle";
import { DemoEntryButton } from "#/components/demo-entry-button";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import type { PublicDemoAvailability } from "#/lib/public-portfolio";
import { hasAuthenticatedSession, listOrganizations } from "#/server/functions/auth";
import { publicPortfolioStatus } from "#/server/functions/public-portfolio";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const availability = await publicPortfolioStatus();
    try {
      const session = await hasAuthenticatedSession();
      const organizations = (await listOrganizations()) ?? [];
      return {
        ...availability,
        hasSession: true,
        isDemoSession: session.isAnonymous,
        organizationCount: organizations.length,
      };
    } catch (error) {
      if (isRedirect(error)) {
        return {
          ...availability,
          hasSession: false,
          isDemoSession: false,
          organizationCount: 0,
        };
      }
      throw error;
    }
  },
  head: () => ({
    meta: [
      { title: "Bitig Flow" },
      {
        name: "description",
        content:
          "Share documents through links that ask for a password or an email, and find out which pages your readers spent their time on.",
      },
    ],
  }),
  component: Home,
});

// The three ideas a first-time reader has to hold to understand the product: how documents are
// grouped, what a link can ask for before it opens, and what comes back afterwards. Said in plain
// words here; the Dashboard introduces its own vocabulary once someone is inside.
const propositions = [
  {
    icon: FolderClosedIcon,
    title: "Vaults",
    description: "Group documents and share them as a single unit.",
  },
  {
    icon: LockIcon,
    title: "Access rules",
    description:
      "A link can ask for a password, an email address, or a verified one before it opens.",
  },
  {
    icon: ChartNoAxesCombinedIcon,
    title: "Analytics",
    description: "Visits, views, time on each page, and downloads, per link and per document.",
  },
] as const;

function Home() {
  const { hasSession, isDemoSession, organizationCount, demo, signUp } = Route.useRouteContext();

  return (
    <main className="relative flex min-h-svh flex-col">
      {/*
        One soft wash of the brand hue at the top of the page. It reads from `--primary`, so it
        follows the theme instead of needing a second colour defined for dark mode.
      */}
      {/* <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(75%_100%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_92%),transparent)]"
      /> */}

      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-6">
        <Link to="/" className="text-base font-medium tracking-tight">
          Bitig Flow
        </Link>
        <ThemeToggle />
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-14 px-6 py-16">
        <section className="flex flex-col items-start gap-5">
          <h1 className="max-w-2xl text-4xl/tight font-semibold tracking-tight text-balance sm:text-5xl/tight">
            Secure document sharing, designed for deals
          </h1>
          <p className="max-w-xl text-lg/relaxed text-pretty text-muted-foreground">
            Securely share documents with password or email protection. Track views, time spent, and
            downloads.
          </p>
          <nav className="flex flex-wrap items-center gap-2 pt-1">
            {hasSession ? (
              isDemoSession ? (
                <Button size="lg" nativeButton={false} render={<Link to="/dashboard" />}>
                  Resume demo
                </Button>
              ) : organizationCount > 0 ? (
                <Button size="lg" nativeButton={false} render={<Link to="/dashboard" />}>
                  Go to dashboard
                </Button>
              ) : (
                <Button size="lg" nativeButton={false} render={<Link to="/onboarding" />}>
                  Continue setup
                </Button>
              )
            ) : (
              <>
                {demo === "available" ? <DemoEntryButton /> : null}
                <Button
                  size="lg"
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/sign-in" />}
                >
                  Sign in
                </Button>
                {signUp ? (
                  <Button
                    size="lg"
                    variant="ghost"
                    nativeButton={false}
                    render={<Link to="/sign-up" />}
                  >
                    Create account
                  </Button>
                ) : null}
              </>
            )}
          </nav>
          {!hasSession && demo !== "available" ? <DemoAvailabilityNotice status={demo} /> : null}
        </section>

        <section className="grid gap-10 border-t border-border pt-10 sm:grid-cols-3">
          {propositions.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col items-start gap-2">
              <Icon className="size-5 text-muted-foreground" />
              <h2 className="font-heading text-base font-medium">{title}</h2>
              <p className="text-base/relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

const demoAvailabilityCopy: Record<
  Exclude<PublicDemoAvailability, "available">,
  Readonly<{ title: string; description: string }>
> = {
  unavailable: {
    title: "Demo entry is currently unavailable",
    description: "The public demo is closed. Sign in with your existing credentials.",
  },
  saturated: {
    title: "All demo environments are currently in use",
    description: "Capacity is released automatically. Try again later.",
  },
  paused: {
    title: "Demo access is paused",
    description: "New entry and existing demo access remain closed until service is restored.",
  },
  maintenance: {
    title: "Demo maintenance is in progress",
    description: "Maintenance checks must finish before a demo environment can be prepared.",
  },
};

function DemoAvailabilityNotice({
  status,
}: Readonly<{ status: Exclude<PublicDemoAvailability, "available"> }>) {
  const copy = demoAvailabilityCopy[status];
  return (
    <Alert className="max-w-xl" role="status">
      <CircleAlertIcon />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
    </Alert>
  );
}
