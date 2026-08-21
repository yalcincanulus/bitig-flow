import { Link, useLocation } from "@tanstack/react-router";

import { DashboardNotFound } from "#/components/dashboard-not-found";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { ViewerColumn } from "#/components/viewer-column";
import { ViewerShell } from "#/components/viewer-shell";
import { ViewerTerminalPage } from "#/components/viewer-terminal-page";
import { unmatchedNotFoundSurface } from "#/lib/unmatched-not-found";

/**
 * The last not-found boundary: unmatched public URLs, and any miss that bubbled past a surface's
 * own page (a Dashboard route skipped on the server because it is not SSR'd).
 */
export function UnmatchedNotFound() {
  const { pathname } = useLocation();
  const surface = unmatchedNotFoundSurface(pathname);

  if (surface === "viewer") {
    return (
      <ViewerShell>
        <ViewerColumn>
          <ViewerTerminalPage />
        </ViewerColumn>
      </ViewerShell>
    );
  }

  if (surface === "dashboard") {
    return <DashboardNotFound />;
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>This page isn't here</EmptyTitle>
          <EmptyDescription>There's nothing at this address.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link to="/" />}>
            Home
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
