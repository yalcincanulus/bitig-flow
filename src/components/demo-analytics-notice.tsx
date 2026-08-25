import { ChartNoAxesCombinedIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";

export function DemoAnalyticsNotice({ incomplete }: Readonly<{ incomplete?: boolean }>) {
  if (!incomplete) return null;

  return (
    <Alert>
      <ChartNoAxesCombinedIcon />
      <AlertTitle>Demo analytics are incomplete</AlertTitle>
      <AlertDescription>
        This Demo Environment reached its Visit or Event limit. Content remained available, but
        later activity was not recorded.
      </AlertDescription>
    </Alert>
  );
}
