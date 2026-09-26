import { createFileRoute } from "@tanstack/react-router";
import { CircleAlertIcon, CirclePauseIcon, TriangleAlertIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DeploymentReadinessList } from "#/components/deployment-readiness-list";
import { MailTestControl } from "#/components/mail-test-control";
import { ReachBars, UsageMeter } from "#/components/operations-parts";
import { OperationsTrendChart } from "#/components/operations-trend-chart";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { ReaperControl } from "#/components/reaper-control";
import { StatList } from "#/components/stat-list";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import {
  formatOperationsBytes,
  formatOperationsCount,
  formatOperationsInstant,
} from "#/lib/operations-format";
import { cn } from "#/lib/utils";
import { operationsOverview } from "#/server/functions/operators";

export const Route = createFileRoute("/operations/")({
  loader: () => operationsOverview(),
  component: OperationsOverviewPage,
});

type Overview = Awaited<ReturnType<typeof operationsOverview>>;
type ActivityWindow = Overview["activity"]["windows"][number];
type MaintenanceStatus = Overview["maintenance"]["reaper"];

const windowOptions = [
  { hours: 24, short: "24h", label: "last 24 hours" },
  { hours: 168, short: "7d", label: "last 7 days" },
  { hours: 720, short: "30d", label: "last 30 days" },
] as const;

function share(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}% of started` : undefined;
}

function OperationsOverviewPage() {
  const overview = Route.useLoaderData();
  const [hours, setHours] = useState<ActivityWindow["hours"]>(168);
  const cohort =
    overview.activity.windows.find((candidate) => candidate.hours === hours) ??
    overview.activity.windows[0]!;
  const windowLabel = windowOptions.find((option) => option.hours === hours)?.label ?? "";
  const { policy: policyView } = overview;
  const blocking = policyView.readiness.checks.filter((check) => !check.ready);

  return (
    <Page>
      <PageHeader>
        <PageTitle>Overview</PageTitle>
        <PageDescription>Health, usage and capacity of the demo fleet.</PageDescription>
        <PageActions>
          <AvailabilityBadge label="Demo entry" open={policyView.effectiveAvailability.demos} />
          <AvailabilityBadge label="Signup" open={policyView.effectiveAvailability.signUp} />
        </PageActions>
      </PageHeader>

      {blocking.length > 0 ? (
        <Alert className="border-warning/40 bg-warning/5">
          <TriangleAlertIcon className="text-warning" />
          <AlertTitle>
            {blocking.length === 1
              ? `${blocking[0]!.label} needs attention`
              : `${blocking.length} checks need attention`}
          </AlertTitle>
          <AlertDescription>
            {policyView.effectiveAvailability.demos
              ? "Some runtime checks are failing."
              : "Demo entry stays closed until every required check is ready."}{" "}
            See System health below.
          </AlertDescription>
        </Alert>
      ) : null}
      {policyView.policy?.pauseAllDemoAccess ? (
        <Alert>
          <CirclePauseIcon />
          <AlertTitle>All demo access is paused</AlertTitle>
          <AlertDescription>
            Existing demos cannot be opened until the pause is lifted on the Policy page.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="activity-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="activity-heading" className="text-sm font-medium">
              Activity
            </h2>
            <p className="text-xs text-muted-foreground">
              Demos created in the {windowLabel} and everything they have done since.
            </p>
          </div>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[String(hours)]}
            onValueChange={(value) => {
              const next = Number(value[0]);
              if (next === 24 || next === 168 || next === 720) setHours(next);
            }}
            aria-label="Cohort window"
          >
            {windowOptions.map((option) => (
              <ToggleGroupItem
                key={option.hours}
                value={String(option.hours)}
                aria-label={option.label}
              >
                {option.short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <StatList
              className="sm:grid-cols-3 lg:grid-cols-6"
              stats={[
                { label: "Demos started", value: formatOperationsCount(cohort.environmentCount) },
                {
                  label: "Added content",
                  value: formatOperationsCount(cohort.engagedEnvironmentCount),
                  detail: share(cohort.engagedEnvironmentCount, cohort.environmentCount),
                },
                {
                  label: "Published",
                  value: formatOperationsCount(cohort.publishedEnvironmentCount),
                  detail: share(cohort.publishedEnvironmentCount, cohort.environmentCount),
                },
                { label: "Visits", value: formatOperationsCount(cohort.visitCount) },
                { label: "Downloads", value: formatOperationsCount(cohort.downloadCount) },
                { label: "Delivered", value: formatOperationsBytes(cohort.deliveredBytes) },
              ]}
            />
            <p className="flex items-start gap-1.5 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground">
              <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
              <span>
                Visits and downloads are best-effort: they count aggregate viewer activity, not
                people, and public links can be automated or repeated.
                {cohort.analyticsIncomplete
                  ? " At least one demo in this cohort ran out of analytics capacity, so these totals are incomplete."
                  : ""}
              </span>
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Last 30 days</CardTitle>
              <CardDescription>
                Per UTC day. Visits count toward the day their demo started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OperationsTrendChart trend={overview.activity.trend} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Demo journey</CardTitle>
              <CardDescription>
                How far the {formatOperationsCount(cohort.environmentCount)} demos from the{" "}
                {windowLabel} got. Counts are demos, not people.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ReachBars
                base={cohort.environmentCount}
                format={formatOperationsCount}
                rows={[
                  {
                    label: "Ready",
                    hint: "Provisioned successfully",
                    value: cohort.readyEnvironmentCount,
                  },
                  {
                    label: "Added content",
                    hint: "Created or edited a document",
                    value: cohort.engagedEnvironmentCount,
                  },
                  {
                    label: "Organized",
                    hint: "Used a vault",
                    value: cohort.organizedEnvironmentCount,
                  },
                  {
                    label: "Published",
                    hint: "Created or changed a link",
                    value: cohort.publishedEnvironmentCount,
                  },
                  {
                    label: "Viewed",
                    hint: "A link received a visit",
                    value: cohort.viewedEnvironmentCount,
                  },
                  {
                    label: "Downloaded",
                    hint: "A visitor downloaded a file",
                    value: cohort.downloadedEnvironmentCount,
                  },
                ]}
              />
              <EndReasons cohort={cohort} />
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Capacity</CardTitle>
            <CardDescription>Fleet-wide use against the Deployment policy.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <UsageMeter
              label="Active environments"
              used={overview.globalUsage?.activeEnvironmentCount ?? 0}
              limit={policyView.policy?.activeEnvironmentCount ?? 0}
              format={formatOperationsCount}
            />
            <UsageMeter
              label="Confirmed storage"
              used={overview.globalUsage?.confirmedBytes ?? 0}
              limit={policyView.policy?.globalConfirmedBytes ?? 0}
              format={formatOperationsBytes}
            />
            <UsageMeter
              label="Pending uploads"
              used={overview.globalUsage?.pendingUploadCount ?? 0}
              limit={policyView.policy?.globalPendingUploadCount ?? 0}
              format={formatOperationsCount}
            />
            <UsageMeter
              label="Confirmations"
              used={overview.globalUsage?.confirmationCount ?? 0}
              limit={policyView.policy?.globalConfirmationCount ?? 0}
              format={formatOperationsCount}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle id="system-health">System health</CardTitle>
            <CardDescription>
              {blocking.length === 0
                ? `All ${policyView.readiness.checks.length} runtime checks are ready.`
                : `${blocking.length} of ${policyView.readiness.checks.length} runtime checks need action.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeploymentReadinessList checks={policyView.readiness.checks} className="-mx-2" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance and mail</CardTitle>
          <CardDescription>
            Scheduled cleanup runs every 15 minutes. You can also start it by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          <MaintenanceRow
            label="Reaper"
            description="Ends expired demos and deletes their content."
            status={overview.maintenance.reaper}
          >
            <ReaperControl />
          </MaintenanceRow>
          <MaintenanceRow
            label="Sweep"
            description="Removes abandoned uploads and orphaned storage."
            status={overview.maintenance.sweep}
          />
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-3 last:pb-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                Mail
                <StatusDot ok={policyView.capability.mail} />
                <span className="text-xs font-normal text-muted-foreground">
                  SMTP {policyView.capability.mail ? "ready" : "unavailable"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                Sends a test message to {overview.operatorEmail}.
              </span>
            </div>
            <MailTestControl
              available={policyView.capability.mail}
              operatorEmail={overview.operatorEmail}
            />
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}

function AvailabilityBadge({ label, open }: Readonly<{ label: string; open: boolean }>) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <StatusDot ok={open} />
      {label} {open ? "open" : "closed"}
    </Badge>
  );
}

function StatusDot({ ok }: Readonly<{ ok: boolean }>) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-chart-2" : "bg-warning")}
    />
  );
}

const endReasonRows = [
  { key: "expired", label: "Expired" },
  { key: "ended_by_demo_user", label: "Ended by the user" },
  { key: "operator_terminated", label: "Ended by an operator" },
  { key: "reported", label: "Ended after a report" },
  { key: "provisioning_failed", label: "Failed to provision" },
  { key: "fleet_deleted", label: "Fleet deletion" },
] as const;

function EndReasons({ cohort }: Readonly<{ cohort: ActivityWindow }>) {
  const running = cohort.environmentCount - cohort.endedEnvironmentCount;
  const rows = [
    { label: "Still running", value: running },
    ...endReasonRows.map((row) => ({ label: row.label, value: cohort.endReasonCounts[row.key] })),
    { label: "Hit a quota at least once", value: cohort.limitedEnvironmentCount },
  ].filter((row, index) => index === 0 || row.value > 0);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-xs font-medium">Outcome</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-muted-foreground">{row.label}</dt>
            <dd className="tabular-nums">{formatOperationsCount(row.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MaintenanceRow({
  label,
  description,
  status,
  children,
}: Readonly<{
  label: string;
  description: string;
  status: MaintenanceStatus;
  children?: ReactNode;
}>) {
  const running = Boolean(status.current);
  const lastStatus = status.last?.status;
  const ok = running || lastStatus === "succeeded";

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-3 first:pt-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          <StatusDot ok={ok} />
          <span className="text-xs font-normal text-muted-foreground">
            {running ? "Running now" : lastStatus ? `Last run ${lastStatus}` : "Never run"}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
        <span className="text-[0.6875rem] text-muted-foreground">
          {status.current
            ? `Heartbeat ${formatOperationsInstant(status.current.heartbeatAt)}`
            : status.last?.finishedAt
              ? `Finished ${formatOperationsInstant(status.last.finishedAt)}`
              : "No completed run yet"}
        </span>
        {status.last?.failure ? (
          <span className="text-xs text-destructive">{status.last.failure}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
