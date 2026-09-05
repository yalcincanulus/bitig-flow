import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { SignOutButton } from "#/components/sign-out-button";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { operationsHeader, platformOperatorRouteAccess } from "#/server/functions/operators";

export const Route = createFileRoute("/operations")({
  beforeLoad: async ({ location }) => {
    const access = await platformOperatorRouteAccess();
    if (!access.isOperator) throw notFound();
    if (!access.twoFactorEnrolled && location.pathname !== "/operations/enroll") {
      throw redirect({ href: "/operations/enroll" });
    }
  },
  loader: ({ location }) =>
    location.pathname === "/operations/enroll" ? null : operationsHeader(),
  component: OperationsRoute,
});

const operationsDestinations = [
  { to: "/operations", label: "Overview", exact: true },
  { to: "/operations/environments", label: "Environments", exact: false },
  { to: "/operations/policy", label: "Policy", exact: false },
] as const;

function OperationsRoute() {
  const location = useLocation();
  const operator = Route.useLoaderData();
  if (location.pathname === "/operations/enroll") return <Outlet />;
  if (!operator) return null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground">Platform operator</p>
            <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
            <p className="text-xs text-muted-foreground">{operator.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link to="/dashboard" />}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Dashboard
            </Button>
            <SignOutButton />
          </div>
        </div>
        <nav aria-label="Operations" className="flex flex-wrap gap-1">
          {operationsDestinations.map((destination) => (
            <Button
              key={destination.to}
              nativeButton={false}
              size="sm"
              variant={
                destination.exact
                  ? location.pathname === destination.to
                    ? "secondary"
                    : "ghost"
                  : location.pathname.startsWith(destination.to)
                    ? "secondary"
                    : "ghost"
              }
              render={<Link to={destination.to} />}
            >
              {destination.label}
            </Button>
          ))}
        </nav>
      </header>
      <Separator className="mt-4" />
      <Outlet />
    </main>
  );
}
