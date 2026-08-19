import { Link } from "@tanstack/react-router";
import { ShieldAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { analyticsTrustworthy, type LinkRequirements } from "#/lib/link-trust";
import { cn } from "#/lib/utils";

type AnalyticsLinkRow = LinkRequirements & {
  name: string | null;
  slug: string;
  isActive: boolean;
};

type AnalyticsLinkTotalsCardProps = Readonly<{
  linkId: string;
  range: { from: string; to: string };
  link: AnalyticsLinkRow | undefined;
  metrics: ReadonlyArray<{ label: string; value: string }>;
  metricsClassName?: string;
}>;

export function AnalyticsLinkTotalsCard({
  linkId,
  range,
  link,
  metrics,
  metricsClassName,
}: AnalyticsLinkTotalsCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <Link
            to="/dashboard/analytics/$linkId"
            params={{ linkId }}
            search={range}
            className="hover:underline"
          >
            {link?.name || (link && isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link")}
          </Link>
        </CardTitle>
        <CardDescription>{link?.isActive === false ? "Inactive" : "Active"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {link && !analyticsTrustworthy(link) ? (
          <Alert>
            <ShieldAlertIcon />
            <AlertTitle>Public Link</AlertTitle>
            <AlertDescription>
              This Link has no Requirements. Add a password or email Requirement to make its
              analytics more trustworthy.
            </AlertDescription>
          </Alert>
        ) : null}
        <dl className={cn("grid grid-cols-2 gap-3", metricsClassName)}>
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
