import { createFileRoute } from "@tanstack/react-router";

import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";

export const Route = createFileRoute("/_authenticated/dashboard/links/$linkId")({
  loader: ({ context: { organization, queryClient }, params: { linkId } }) => {
    const { links } = getCollections(queryClient, organization.id);

    return resolveRow(links, linkId);
  },
  component: LinkPage,
});

function LinkPage() {
  const link = Route.useLoaderData();

  return <p>{link.slug}</p>;
}
