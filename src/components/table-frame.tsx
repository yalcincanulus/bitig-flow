import type { ReactNode } from "react";

import { Table } from "#/components/ui/table";

/**
 * The border a Dashboard table sits inside, so that Links, Analytics, a Document's Visits, and
 * People all read as the same kind of thing rather than four tables that happen to look alike.
 */
export function TableFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <Table>{children}</Table>
    </div>
  );
}
