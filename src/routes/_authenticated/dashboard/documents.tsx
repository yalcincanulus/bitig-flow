import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  return <h1>Documents</h1>;
}
