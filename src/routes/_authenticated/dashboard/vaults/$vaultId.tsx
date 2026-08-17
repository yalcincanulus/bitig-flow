import { createFileRoute } from "@tanstack/react-router";

import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";

export const Route = createFileRoute("/_authenticated/dashboard/vaults/$vaultId")({
  loader: ({ context: { organization, queryClient }, params: { vaultId } }) => {
    const { vaults } = getCollections(queryClient, organization.id);

    return resolveRow(vaults, vaultId);
  },
  component: VaultPage,
});

function VaultPage() {
  const vault = Route.useLoaderData();

  return <p>{vault.name}</p>;
}
