import { Link, createFileRoute, isRedirect } from "@tanstack/react-router";

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
  component: Home,
});

function Home() {
  const { hasSession, organizationCount } = Route.useRouteContext();

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">bitig-flow</h1>
      {hasSession ? (
        organizationCount > 0 ? (
          <Link to="/dashboard/documents">Go to Dashboard</Link>
        ) : (
          <Link to="/onboarding">Continue setup</Link>
        )
      ) : (
        <p className="flex gap-4">
          <Link to="/sign-in">Sign in</Link>
          <Link to="/sign-up">Sign up</Link>
        </p>
      )}
    </main>
  );
}
