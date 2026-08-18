import { ChartNoAxesCombinedIcon, LinkIcon, SettingsIcon } from "lucide-react";

import { Page, PageDescription, PageHeader, PageTitle } from "#/components/page";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  dashboardUnimplemented,
  type UnimplementedDashboardDestination,
} from "#/lib/dashboard-unimplemented";

const icons = {
  links: LinkIcon,
  analytics: ChartNoAxesCombinedIcon,
  settings: SettingsIcon,
} as const;

/**
 * The shared scaffold for Dashboard destinations whose features are not built yet: the Page header
 * from #52, and a shadcn Empty that says so honestly.
 */
export function UnimplementedDashboardPage({
  destination,
}: Readonly<{ destination: UnimplementedDashboardDestination }>) {
  const copy = dashboardUnimplemented(destination);
  const Icon = icons[destination];

  return (
    <Page>
      <PageHeader>
        <PageTitle>{copy.title}</PageTitle>
        <PageDescription>{copy.description}</PageDescription>
      </PageHeader>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
          <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
