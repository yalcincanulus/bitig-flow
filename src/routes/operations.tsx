import { Outlet, createFileRoute, notFound, redirect, useLocation } from "@tanstack/react-router";

import { DeploymentPolicyForm } from "#/components/deployment-policy-form";
import { ReaperControl } from "#/components/reaper-control";
import { SignOutButton } from "#/components/sign-out-button";
import { operationsLanding, platformOperatorRouteAccess } from "#/server/functions/operators";

export const Route = createFileRoute("/operations")({
  beforeLoad: async ({ location }) => {
    const access = await platformOperatorRouteAccess();
    if (!access.isOperator) throw notFound();
    if (!access.twoFactorEnrolled && location.pathname !== "/operations/enroll") {
      throw redirect({ href: "/operations/enroll" });
    }
  },
  loader: ({ location }) => (location.pathname === "/operations" ? operationsLanding() : null),
  component: OperationsRoute,
});

function OperationsRoute() {
  const location = useLocation();
  const operator = Route.useLoaderData();
  if (location.pathname !== "/operations") return <Outlet />;
  if (!operator) return null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Platform Operator</p>
          <h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
        </div>
        <SignOutButton />
      </header>
      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Demo cleanup</h2>
          <p className="text-sm text-muted-foreground">
            Run the distributed Reaper immediately. Scheduled runs continue every 15 minutes.
          </p>
        </div>
        <ReaperControl />
      </section>
      <section className="flex flex-col gap-6 border-t border-border pt-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Deployment Policy</h2>
          <p className="text-sm text-muted-foreground">
            Signed in as {operator.email}. These controls are deployment-wide and load no
            Organization data.
          </p>
        </div>
        <DeploymentPolicyForm initialView={operator.policy} />
      </section>
    </main>
  );
}
