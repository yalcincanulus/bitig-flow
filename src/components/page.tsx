import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

/**
 * The shallow container a Dashboard page sits in: padding, vertical rhythm, and a header that keeps
 * a title, a description, and the page's actions in the same relationship on every route.
 *
 * It deliberately stops there. A page owns its own content — its cards, dialogs, empty states and
 * forms are its business, and this is not the beginning of a page-building framework.
 */
function Page({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="page"
      className={cn("flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6", className)}
      {...props}
    />
  );
}

function PageHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      // Narrow screens stack the header; from `sm` the actions move up beside the title.
      className={cn("grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]", className)}
      {...props}
    />
  );
}

function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-title"
      className={cn("text-xl font-semibold tracking-tight sm:col-start-1", className)}
      {...props}
    />
  );
}

function PageDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="page-description"
      className={cn("text-sm text-muted-foreground sm:col-start-1", className)}
      {...props}
    />
  );
}

function PageActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="page-actions"
      className={cn(
        "flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1 sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export { Page, PageActions, PageDescription, PageHeader, PageTitle };
