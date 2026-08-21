import { Link, useLocation } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { dashboardNotFound } from "#/lib/dashboard-not-found";

/**
 * What a User sees when a Dashboard route has no row. It sits in the content pane so the Chrome
 * stays; the root not-found boundary reuses it when a Dashboard miss bubbles above that pane.
 */
export function DashboardNotFound() {
  const { pathname } = useLocation();
  const notFound = dashboardNotFound(pathname);

  return (
    <div className="flex flex-1 flex-col p-4">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{notFound.title}</EmptyTitle>
          <EmptyDescription>{notFound.description}</EmptyDescription>
        </EmptyHeader>
        {notFound.recovery ? (
          <EmptyContent>
            <Button nativeButton={false} render={<Link {...notFound.recovery.link} />}>
              {notFound.recovery.label}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
}
