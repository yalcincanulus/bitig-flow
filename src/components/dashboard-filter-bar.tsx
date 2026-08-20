import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

/**
 * The strip of filters and switches that sits between a Page's header and its content.
 *
 * It is a bar rather than a Card on purpose: a Card announces content, and a filter is not
 * content — it is the frame around it. Giving filters their own Card is what made every Dashboard
 * screen open with a box that says nothing.
 */
function FilterBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3",
        className,
      )}
      {...props}
    />
  );
}

function FilterBarLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="filter-bar-label"
      className={cn("text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Pushes whatever follows it to the far end of the bar. */
function FilterBarSpacer({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="filter-bar-spacer" className={cn("ml-auto", className)} {...props} />;
}

export { FilterBar, FilterBarLabel, FilterBarSpacer };
