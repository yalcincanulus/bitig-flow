import { createFileRoute } from "@tanstack/react-router";

// The list the Vault detail route hangs from. Its pane arrives with the screens that fill it.
export const Route = createFileRoute("/_authenticated/dashboard/vaults/")({
  component: VaultsPage,
});

function VaultsPage() {
  return <p>Vaults</p>;
}
