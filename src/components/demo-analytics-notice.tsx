import { ChartNoAxesCombinedIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";

export function DemoAnalyticsNotice({ incomplete }: Readonly<{ incomplete?: boolean }>) {
  if (!incomplete) return null;

  return (
    <Alert>
      <ChartNoAxesCombinedIcon />
      <AlertTitle>Demo analytics are incomplete</AlertTitle>
      <AlertDescription>
        This demo reached its analytics limit. Your documents are still available, but later visits
        and reading activity are not recorded.
      </AlertDescription>
    </Alert>
  );
}
