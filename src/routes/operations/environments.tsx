import { createFileRoute } from "@tanstack/react-router";
import { BoxesIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Detail } from "#/components/operations-parts";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { TerminateEnvironmentControl } from "#/components/terminate-environment-control";
import { Badge } from "#/components/ui/badge";
import { Card } from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import {
  formatOperationsBytes,
  formatOperationsCount,
  formatOperationsDuration,
  formatOperationsInstant,
  formatOperationsNoun,
} from "#/lib/operations-format";
import { cn } from "#/lib/utils";
import { operationsEnvironments } from "#/server/functions/operators";

export const Route = createFileRoute("/operations/environments")({
  loader: () => operationsEnvironments(),
  component: OperationsEnvironmentsPage,
});

type Environment = Awaited<ReturnType<typeof operationsEnvironments>>["environments"][number];

const stateGroups = [
  { id: "all", label: "All", states: null },
  { id: "active", label: "Active", states: ["active", "provisioning"] },
  { id: "paused", label: "Paused", states: ["global_paused", "report_paused"] },
  { id: "ending", label: "Ending", states: ["terminating", "completed"] },
] as const;

type StateGroupId = (typeof stateGroups)[number]["id"];

const stateLabels: Record<string, string> = {
  provisioning: "Provisioning",
  active: "Active",
  global_paused: "Paused (global)",
  report_paused: "Paused (report)",
  terminating: "Terminating",
  completed: "Completed",
};

function effectiveStateOf(environment: Environment, globalPauseActive: boolean) {
  return globalPauseActive && environment.state === "active" ? "global_paused" : environment.state;
}

function OperationsEnvironmentsPage() {
  const { environments, globalPauseActive, observedAt } = Route.useLoaderData();
  const now = new Date(observedAt).getTime();
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<StateGroupId>("all");
  const normalizedFilter = filter.trim().toLowerCase();

  const withState = environments.map((environment) => ({
    environment,
    state: effectiveStateOf(environment, globalPauseActive),
  }));
  const inGroup = (state: string, id: StateGroupId) => {
    const candidate = stateGroups.find((entry) => entry.id === id);
    return !candidate?.states || (candidate.states as ReadonlyArray<string>).includes(state);
  };
  const shown = withState.filter(({ environment, state }) => {
    if (!inGroup(state, group)) return false;
    if (!normalizedFilter) return true;
    return [environment.anonymousReference, state, stateLabels[state], environment.endReason]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedFilter));
  });

  return (
    <Page>
      <PageHeader>
        <PageTitle>Demo environments</PageTitle>
        <PageDescription>
          Newest first, up to 100. Only anonymous references and usage totals are shown; content,
          titles, links and visitors stay private.
        </PageDescription>
      </PageHeader>

      {environments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>No demo environments</EmptyTitle>
            <EmptyDescription>
              New demos appear here as soon as someone starts one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[group]}
              onValueChange={(value) => {
                const next = stateGroups.find((entry) => entry.id === value[0]);
                if (next) setGroup(next.id);
              }}
              aria-label="Filter by state"
            >
              {stateGroups.map((entry) => (
                <ToggleGroupItem key={entry.id} value={entry.id} className="gap-1.5">
                  {entry.label}
                  <span className="text-muted-foreground tabular-nums">
                    {withState.filter(({ state }) => inGroup(state, entry.id)).length}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Filter demo environments"
                value={filter}
                placeholder="Search reference or state"
                onChange={(event) => setFilter(event.target.value)}
              />
            </InputGroup>
          </div>

          {shown.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BoxesIcon />
                </EmptyMedia>
                <EmptyTitle>No matching demo environments</EmptyTitle>
                <EmptyDescription>Try another reference or state.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map(({ environment, state }) => (
                <EnvironmentCard
                  key={environment.id}
                  environment={environment}
                  state={state}
                  now={now}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}

function EnvironmentCard({
  environment,
  state,
  now,
}: Readonly<{ environment: Environment; state: string; now: number }>) {
  const createdAt = new Date(environment.createdAt).getTime();
  const expiresAt = new Date(environment.expiresAt).getTime();
  const lifetime = Math.max(expiresAt - createdAt, 1);
  const elapsed = Math.min(Math.max((now - createdAt) / lifetime, 0), 1);
  const remaining = expiresAt - now;
  const terminating = environment.state === "terminating";
  const refusals = environment.refusalCount >= 100 ? "100+" : String(environment.refusalCount);

  return (
    <li>
      <Card size="sm" className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3 px-(--card-spacing)">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium">
                {environment.anonymousReference}
              </span>
              <Badge variant={state === "active" ? "secondary" : "outline"}>
                {stateLabels[state] ?? state}
              </Badge>
              {environment.analyticsIncomplete ? (
                <Badge variant="outline">Analytics incomplete</Badge>
              ) : null}
              {environment.reportCount > 0 ? (
                <Badge variant="destructive">
                  {formatOperationsCount(environment.reportCount)}{" "}
                  {environment.reportCount === 1 ? "report" : "reports"}
                </Badge>
              ) : null}
            </div>
            <span className="text-[0.6875rem] text-muted-foreground">
              Started {formatOperationsInstant(environment.createdAt)} · state version{" "}
              {environment.stateVersion}
            </span>
          </div>
          {terminating ? (
            <div className="flex flex-col items-end gap-0.5 text-right">
              <Badge variant="outline">Termination in progress</Badge>
              <span className="text-[0.6875rem] text-muted-foreground">The Reaper resumes it.</span>
            </div>
          ) : (
            <TerminateEnvironmentControl
              environmentId={environment.id}
              reference={environment.anonymousReference}
            />
          )}
        </div>

        <div className="flex flex-col gap-1 px-(--card-spacing)">
          <div className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
            <span className="text-muted-foreground">
              {formatOperationsDuration(now - createdAt)} old
            </span>
            <span className={cn(remaining <= 0 ? "text-muted-foreground" : "text-foreground")}>
              {remaining > 0
                ? `${formatOperationsDuration(remaining)} left · expires ${formatOperationsInstant(environment.expiresAt)}`
                : "Expiry reached"}
            </span>
          </div>
          <div
            role="meter"
            aria-label="Lifetime used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(elapsed * 100)}
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn("h-full rounded-full", elapsed >= 0.9 ? "bg-warning" : "bg-chart-2")}
              style={{ width: `${elapsed * 100}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border px-(--card-spacing) pt-3 sm:grid-cols-3 lg:grid-cols-6">
          <Detail label="Content">
            {formatOperationsNoun(environment.documentCount, "doc", "docs")} ·{" "}
            {formatOperationsNoun(environment.vaultCount, "vault", "vaults")} ·{" "}
            {formatOperationsNoun(environment.linkCount, "link", "links")}
          </Detail>
          <Detail label="Storage">
            {formatOperationsBytes(environment.confirmedBytes)}
            {environment.reservedUploadBytes > 0
              ? ` + ${formatOperationsBytes(environment.reservedUploadBytes)} reserved`
              : ""}
          </Detail>
          <Detail label="Uploads in flight">
            {environment.pendingUploadCount} pending · {environment.confirmationCount} confirming
          </Detail>
          <Detail label="Visits">
            {formatOperationsCount(environment.visitLifetimeCount)} ·{" "}
            {formatOperationsNoun(environment.downloadLifetimeCount, "download", "downloads")}
          </Detail>
          <Detail label="Delivered">{formatOperationsBytes(environment.deliveredBytes)}</Detail>
          <Detail label="Quota refusals">{refusals}</Detail>
        </dl>
      </Card>
    </li>
  );
}
