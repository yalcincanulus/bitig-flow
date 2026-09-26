import { createFileRoute } from "@tanstack/react-router";

import { DeploymentPolicyForm } from "#/components/deployment-policy-form";
import { FleetDeletionControl } from "#/components/fleet-deletion-control";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { operationsPolicy } from "#/server/functions/operators";

export const Route = createFileRoute("/operations/policy")({
  loader: () => operationsPolicy(),
  component: OperationsPolicyPage,
});

function OperationsPolicyPage() {
  const policy = Route.useLoaderData();
  return (
    <Page>
      <PageHeader>
        <PageTitle>Deployment policy</PageTitle>
        <PageDescription>
          Who can get in, and how much each demo and the whole fleet may use.
        </PageDescription>
      </PageHeader>
      <DeploymentPolicyForm initialView={policy} />
      <section aria-labelledby="danger-zone-heading" className="flex flex-col gap-3 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="danger-zone-heading" className="text-sm font-medium text-destructive">
            Danger zone
          </h2>
          <p className="text-xs text-muted-foreground">These actions cannot be undone.</p>
        </div>
        <FleetDeletionControl />
      </section>
    </Page>
  );
}
