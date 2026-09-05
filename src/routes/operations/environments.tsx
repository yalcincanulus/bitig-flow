import { createFileRoute } from "@tanstack/react-router";
import { BoxesIcon } from "lucide-react";
import { useState } from "react";

import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { TableFrame } from "#/components/table-frame";
import { TerminateEnvironmentControl } from "#/components/terminate-environment-control";
import { Badge } from "#/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Input } from "#/components/ui/input";
import {
  formatOperationsBytes,
  formatOperationsCount,
  formatOperationsDuration,
  formatOperationsInstant,
} from "#/lib/operations-format";
import { operationsEnvironments } from "#/server/functions/operators";

export const Route = createFileRoute("/operations/environments")({
  loader: () => operationsEnvironments(),
  component: OperationsEnvironmentsPage,
});

function stateLabel(state: string) {
  return state.replaceAll("_", " ");
}

function OperationsEnvironmentsPage() {
  const { environments, globalPauseActive, observedAt } = Route.useLoaderData();
  const now = new Date(observedAt).getTime();
  const [filter, setFilter] = useState("");
  const normalizedFilter = filter.trim().toLowerCase();
  const filteredEnvironments = environments.filter((environment) => {
    if (!normalizedFilter) return true;
    const effectiveState =
      globalPauseActive && environment.state === "active" ? "global_paused" : environment.state;
    return [environment.anonymousReference, effectiveState, environment.endReason]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedFilter));
  });

  return (
    <Page className="px-0">
      <PageHeader>
        <PageTitle>Demo environments</PageTitle>
        <PageDescription>
          Only anonymous references and usage totals are shown. Document contents, titles,
          filenames, links, and visitor details are private.
        </PageDescription>
      </PageHeader>

      {environments.length > 0 ? (
        <div className="max-w-sm">
          <label className="sr-only" htmlFor="environment-filter">
            Filter demo environments
          </label>
          <Input
            id="environment-filter"
            type="search"
            value={filter}
            placeholder="Filter by reference or state"
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      ) : null}

      {environments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>No demo environments</EmptyTitle>
            <EmptyDescription>No demos to show.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filteredEnvironments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>No matching demo environments</EmptyTitle>
            <EmptyDescription>Try another reference or status filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TableFrame>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Age and expiry</TableHead>
              <TableHead>Aggregate resources</TableHead>
              <TableHead>Best-effort public usage</TableHead>
              <TableHead>Reports and limits</TableHead>
              <TableHead className="text-right">Termination</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEnvironments.map((environment) => {
              const createdAt = new Date(environment.createdAt).getTime();
              const expiresAt = new Date(environment.expiresAt).getTime();
              const terminating = environment.state === "terminating";
              const effectiveState =
                globalPauseActive && environment.state === "active"
                  ? "global_paused"
                  : environment.state;
              return (
                <TableRow key={environment.id}>
                  <TableCell className="font-mono font-medium">
                    {environment.anonymousReference}
                  </TableCell>
                  <TableCell>
                    <Badge variant={effectiveState === "active" ? "secondary" : "outline"}>
                      {stateLabel(effectiveState)}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {environment.stateVersion}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{formatOperationsDuration(now - createdAt)} old</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {formatOperationsInstant(environment.expiresAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {expiresAt > now
                        ? `${formatOperationsDuration(expiresAt - now)} remaining`
                        : "Expiry reached"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>
                      {formatOperationsCount(environment.documentCount)} documents ·{" "}
                      {formatOperationsCount(environment.vaultCount)} vaults ·{" "}
                      {formatOperationsCount(environment.linkCount)} links
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatOperationsBytes(environment.confirmedBytes)} stored ·{" "}
                      {formatOperationsBytes(environment.reservedUploadBytes)} reserved
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {environment.pendingUploadCount} pending · {environment.confirmationCount}{" "}
                      confirming
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{formatOperationsCount(environment.visitLifetimeCount)} visits</p>
                    <p className="text-xs text-muted-foreground">
                      {formatOperationsCount(environment.downloadLifetimeCount)} downloads ·{" "}
                      {formatOperationsBytes(environment.deliveredBytes)} delivered
                    </p>
                    {environment.analyticsIncomplete ? (
                      <Badge variant="outline">Incomplete</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p>{formatOperationsCount(environment.reportCount)} reports</p>
                    <p className="text-xs text-muted-foreground">
                      {environment.refusalCount >= 100 ? "100+" : environment.refusalCount} quota
                      refusals
                    </p>
                    {environment.state === "report_paused" ? (
                      <Badge variant="outline">Permanently report-paused</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {terminating ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline">In progress</Badge>
                        <span className="text-xs text-muted-foreground">
                          Resumes through Reaper
                        </span>
                      </div>
                    ) : (
                      <TerminateEnvironmentControl
                        environmentId={environment.id}
                        reference={environment.anonymousReference}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableFrame>
      )}
    </Page>
  );
}
