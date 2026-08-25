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
    <Page className="px-0">
      <PageHeader>
        <PageTitle>Deployment Policy</PageTitle>
        <PageDescription>
          Requested admission and resource limits. Runtime integrations remain authoritative and
          every value stays within its hard ceiling.
        </PageDescription>
      </PageHeader>
      <DeploymentPolicyForm initialView={policy} />
      <section aria-labelledby="danger-zone-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="danger-zone-heading" className="text-lg font-medium text-destructive">
            Danger zone
          </h2>
          <p className="text-sm text-muted-foreground">
            Fleet deletion is separate from closing admission and pausing current access.
          </p>
        </div>
        <FleetDeletionControl />
      </section>
    </Page>
  );
}
