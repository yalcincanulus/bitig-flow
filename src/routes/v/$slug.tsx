import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v/$slug")({
  component: () => <Outlet />,
});
