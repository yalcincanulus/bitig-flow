import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { documentsViewSearchSchema } from "#/lib/dashboard-search";

/**
 * The layout every Documents route sits under. It exists for one reason: to own the `view` search
 * param and carry it along.
 *
 * `retainSearchParams` puts the choice back on every navigation inside this subtree, so opening a
 * Document, editing it, and coming back by breadcrumb, back button, or the sidebar all return to
 * the layout the User was reading in.
 */
export const Route = createFileRoute("/_authenticated/dashboard/documents")({
  validateSearch: documentsViewSearchSchema,
  search: { middlewares: [retainSearchParams(["view"])] },
});
