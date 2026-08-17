import { createFileRoute } from "@tanstack/react-router";

// The list the Link detail route hangs from. Its search parameters and pane arrive with #36.
export const Route = createFileRoute("/_authenticated/dashboard/links/")({
  component: LinksPage,
});

function LinksPage() {
  return <p>Links</p>;
}
