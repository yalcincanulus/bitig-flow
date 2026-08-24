import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { SignOutButton } from "#/components/sign-out-button";
import { operationsLanding, platformOperatorRouteAccess } from "#/server/functions/operators";

export const Route = createFileRoute("/operations")({
  beforeLoad: async () => {
    const access = await platformOperatorRouteAccess();
    if (!access.isOperator) throw notFound();
    if (!access.twoFactorEnrolled) throw redirect({ href: "/operations/enroll" });
  },
  loader: () => operationsLanding(),
  component: OperationsLanding,
});

function OperationsLanding() {
  const operator = Route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Platform Operator</p>
          <h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
        </div>
        <SignOutButton />
      </header>
      <section className="flex flex-col gap-2 border-t border-border pt-8">
        <h2 className="text-lg font-medium">Authentication ready</h2>
        <p className="text-sm text-muted-foreground">
          Signed in as {operator.email}. Deployment-wide controls will live here without loading an
          Organization.
        </p>
      </section>
    </main>
  );
}
