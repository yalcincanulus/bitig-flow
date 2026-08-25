import { Link, createFileRoute, isRedirect } from "@tanstack/react-router";
import { ChartNoAxesCombinedIcon, FolderClosedIcon, LockIcon } from "lucide-react";

import { ThemeToggle } from "#/components/theme-toggle";
import { DemoEntryButton } from "#/components/demo-entry-button";
import { Button } from "#/components/ui/button";
import { hasAuthenticatedSession, listOrganizations } from "#/server/functions/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      await hasAuthenticatedSession();
    } catch (error) {
      if (isRedirect(error)) return { hasSession: false, organizationCount: 0 };
      throw error;
    }

    const organizations = (await listOrganizations()) ?? [];
    return { hasSession: true, organizationCount: organizations.length };
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
    description: "Group documents into a flat set and share the whole set as one unit.",
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
  const { hasSession, organizationCount } = Route.useRouteContext();

  return (
    <main className="relative flex min-h-svh flex-col">
      {/*
        One soft wash of the brand hue at the top of the page. It reads from `--primary`, so it
        follows the theme instead of needing a second colour defined for dark mode.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(75%_100%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_92%),transparent)]"
      />

      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-6">
        <span className="text-base font-medium tracking-tight">Bitig Flow</span>
        <ThemeToggle />
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-14 px-6 py-16">
        <section className="flex flex-col items-start gap-5">
          <h1 className="max-w-2xl text-4xl/tight font-semibold tracking-tight text-balance sm:text-5xl/tight">
            Share documents, choose who can open them, and see how they were read.
          </h1>
          <p className="max-w-xl text-lg/relaxed text-pretty text-muted-foreground">
            Write markdown or upload a PDF, group files into a vault, and publish one link for the
            whole set. Each link can ask for a password or an email address first, and it shows you
            which pages people spent their time on.
          </p>
          <nav className="flex flex-wrap items-center gap-2 pt-1">
            {hasSession ? (
              organizationCount > 0 ? (
                <Button size="lg" nativeButton={false} render={<Link to="/dashboard/documents" />}>
                  Go to Dashboard
                </Button>
              ) : (
                <Button size="lg" nativeButton={false} render={<Link to="/onboarding" />}>
                  Continue setup
                </Button>
              )
            ) : (
              <>
                <DemoEntryButton />
                <Button
                  size="lg"
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/sign-in" />}
                >
                  Sign in
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  nativeButton={false}
                  render={<Link to="/sign-up" />}
                >
                  Create account
                </Button>
              </>
            )}
          </nav>
          {!hasSession && (
            <p className="max-w-xl text-sm/relaxed text-muted-foreground">
              Demo work is public only when you create a Link and is deleted after 24 hours. Do not
              upload confidential, personal, or unlawful material. Anonymous feature-use totals are
              retained after deletion.
            </p>
          )}
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
