import { createFileRoute } from "@tanstack/react-router";
import { CircleAlertIcon } from "lucide-react";

import { MailTestControl } from "#/components/mail-test-control";
import { OperationsTrendChart } from "#/components/operations-trend-chart";
import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { ReaperControl } from "#/components/reaper-control";
import { StatList } from "#/components/stat-list";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { TableFrame } from "#/components/table-frame";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import {
  formatOperationsBytes,
  formatOperationsCount,
  formatOperationsInstant,
} from "#/lib/operations-format";
import { operationsOverview } from "#/server/functions/operators";

export const Route = createFileRoute("/operations/")({
  loader: () => operationsOverview(),
  component: OperationsOverviewPage,
});

const windowLabels = { 24: "24 hours", 168: "7 days", 720: "30 days" } as const;

function OperationsOverviewPage() {
  const overview = Route.useLoaderData();
  const policy = overview.policy.policy;
  const usage = overview.globalUsage;
  const analyticsIncomplete = overview.activity.windows.some(
    (window) => window.analyticsIncomplete,
  );

  return (
    <Page className="px-0">
      <PageHeader>
        <PageTitle>Overview</PageTitle>
        <PageDescription>
          Privacy-safe portfolio usage, capacity, dependencies, and maintenance health.
        </PageDescription>
      </PageHeader>

      <Alert>
        <CircleAlertIcon />
        <AlertTitle>Public analytics are best-effort</AlertTitle>
        <AlertDescription>
          Visits and downloads describe aggregate Viewer activity, not people. Public Links can be
          automated or repeated.
          {analyticsIncomplete
            ? " At least one Demo Environment also exhausted its Visit or Event capacity, so these totals are incomplete."
            : ""}
        </AlertDescription>
      </Alert>

      <section aria-labelledby="cohort-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="cohort-heading" className="text-lg font-medium">
            Trailing cohorts
          </h2>
          <p className="text-sm text-muted-foreground">
            Each window contains Demo Environments created during that exact trailing period. Usage
            is their content-free lifetime total to date.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {overview.activity.windows.map((window) => (
            <Card key={window.hours}>
              <CardHeader>
                <CardTitle>{windowLabels[window.hours]}</CardTitle>
                <CardDescription>
                  {formatOperationsInstant(window.from)} through{" "}
                  {formatOperationsInstant(window.to)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatList
                  className="sm:grid-cols-3 lg:grid-cols-3"
                  stats={[
                    {
                      label: "Demo Environments",
                      value: formatOperationsCount(window.environmentCount),
                    },
                    {
                      label: "Engaged",
                      value: formatOperationsCount(window.engagedEnvironmentCount),
                    },
                    {
                      label: "Published",
                      value: formatOperationsCount(window.publishedEnvironmentCount),
                    },
                    {
                      label: "Best-effort Visits",
                      value: formatOperationsCount(window.visitCount),
                    },
                    { label: "Downloads", value: formatOperationsCount(window.downloadCount) },
                    {
                      label: "Delivered",
                      value: formatOperationsBytes(window.deliveredBytes),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>30-day aggregate trend</CardTitle>
          <CardDescription>
            Bars are Demo Environment starts by UTC date. The line is best-effort public Visits for
            each starting cohort.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperationsTrendChart trend={overview.activity.trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demo Environment funnel</CardTitle>
          <CardDescription>
            Counts are environments that reached each coarse milestone, never unique people.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableFrame>
            <TableHeader>
              <TableRow>
                <TableHead>Window</TableHead>
                <TableHead className="text-right">Ready</TableHead>
                <TableHead className="text-right">Engaged</TableHead>
                <TableHead className="text-right">Organized</TableHead>
                <TableHead className="text-right">Published</TableHead>
                <TableHead className="text-right">Viewed</TableHead>
                <TableHead className="text-right">Downloaded</TableHead>
                <TableHead className="text-right">Limited</TableHead>
                <TableHead className="text-right">Expired</TableHead>
                <TableHead className="text-right">Self-ended</TableHead>
                <TableHead className="text-right">Operator-ended</TableHead>
                <TableHead className="text-right">Reported</TableHead>
                <TableHead className="text-right">Provision failed</TableHead>
                <TableHead className="text-right">Fleet reset</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.activity.windows.map((window) => (
                <TableRow key={window.hours}>
                  <TableCell className="font-medium">{windowLabels[window.hours]}</TableCell>
                  {[
                    window.readyEnvironmentCount,
                    window.engagedEnvironmentCount,
                    window.organizedEnvironmentCount,
                    window.publishedEnvironmentCount,
                    window.viewedEnvironmentCount,
                    window.downloadedEnvironmentCount,
                    window.limitedEnvironmentCount,
                    window.endReasonCounts.expired,
                    window.endReasonCounts.ended_by_demo_user,
                    window.endReasonCounts.operator_terminated,
                    window.endReasonCounts.reported,
                    window.endReasonCounts.provisioning_failed,
                    window.endReasonCounts.fleet_deleted,
                  ].map((value, index) => (
                    <TableCell key={index} className="text-right tabular-nums">
                      {formatOperationsCount(value)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </TableFrame>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Capacity and policy</CardTitle>
            <CardDescription>
              Current fleet use against requested hard-bounded limits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatList
              className="sm:grid-cols-2 lg:grid-cols-2"
              stats={[
                {
                  label: "Active environments",
                  value: `${formatOperationsCount(usage?.activeEnvironmentCount ?? 0)} / ${formatOperationsCount(policy?.activeEnvironmentCount ?? 0)}`,
                },
                {
                  label: "Confirmed storage",
                  value: `${formatOperationsBytes(usage?.confirmedBytes ?? 0)} / ${formatOperationsBytes(policy?.globalConfirmedBytes ?? 0)}`,
                },
                {
                  label: "Pending uploads",
                  value: `${formatOperationsCount(usage?.pendingUploadCount ?? 0)} / ${formatOperationsCount(policy?.globalPendingUploadCount ?? 0)}`,
                },
                {
                  label: "Confirmations",
                  value: `${formatOperationsCount(usage?.confirmationCount ?? 0)} / ${formatOperationsCount(policy?.globalConfirmationCount ?? 0)}`,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime readiness</CardTitle>
            <CardDescription>
              Requested policy cannot make an unavailable runtime dependency ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(
              [
                ["database", "Database"],
                ["redis", "Redis"],
                ["storage", "Storage"],
                ["mail", "Mail"],
                ["reaperFresh", "Reaper freshness"],
                ["sweepFresh", "Sweep freshness"],
              ] as const
            ).map(([key, label]) => (
              <Badge key={key} variant={overview.policy.capability[key] ? "secondary" : "outline"}>
                {label}: {overview.policy.capability[key] ? "Ready" : "Unavailable"}
              </Badge>
            ))}
            <Badge variant={overview.policy.effectiveAvailability.demos ? "default" : "outline"}>
              Effective demo entry:{" "}
              {overview.policy.effectiveAvailability.demos ? "Open" : "Closed"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="maintenance-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="maintenance-heading" className="text-lg font-medium">
            Maintenance and mail
          </h2>
          <p className="text-sm text-muted-foreground">
            Last-run and heartbeat records are logical application health, not host monitoring.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <MaintenanceCard label="Reaper" status={overview.maintenance.reaper} />
          <MaintenanceCard label="Sweep" status={overview.maintenance.sweep} />
          <Card>
            <CardHeader>
              <CardTitle>Mail</CardTitle>
              <CardDescription>
                SMTP is {overview.policy.capability.mail ? "ready" : "unavailable"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MailTestControl
                available={overview.policy.capability.mail}
                operatorEmail={overview.operatorEmail}
              />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Bounded Reaper run</CardTitle>
            <CardDescription>
              Run one lock-protected batch now. Scheduled runs continue every 15 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReaperControl />
          </CardContent>
        </Card>
      </section>
    </Page>
  );
}

type MaintenanceStatus = Awaited<ReturnType<typeof operationsOverview>>["maintenance"]["reaper"];

function MaintenanceCard({
  label,
  status,
}: Readonly<{ label: string; status: MaintenanceStatus }>) {
  const statusLabel = status.current ? "running" : (status.last?.status ?? "No runs");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {label}
          <Badge variant={status.last?.status === "succeeded" ? "secondary" : "outline"}>
            {statusLabel}
          </Badge>
        </CardTitle>
        <CardDescription>Current heartbeat and the most recent completed run.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          Current heartbeat:{" "}
          {status.current ? formatOperationsInstant(status.current.heartbeatAt) : "No active run"}
        </p>
        <p className="text-muted-foreground">
          Last finished:{" "}
          {status.last?.finishedAt
            ? formatOperationsInstant(status.last.finishedAt)
            : "No completed run"}
        </p>
        {status.last?.failure ? <p className="text-destructive">{status.last.failure}</p> : null}
      </CardContent>
    </Card>
  );
}
