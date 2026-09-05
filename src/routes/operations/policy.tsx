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
        <PageTitle>Deployment policy</PageTitle>
        <PageDescription>Set access and usage limits.</PageDescription>
      </PageHeader>
      <DeploymentPolicyForm initialView={policy} />
      <section aria-labelledby="danger-zone-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="danger-zone-heading" className="text-lg font-medium text-destructive">
            Danger zone
          </h2>
          <p className="text-sm text-muted-foreground">
            Deleting demos permanently removes their content.
          </p>
        </div>
        <FleetDeletionControl />
      </section>
    </Page>
  );
}
