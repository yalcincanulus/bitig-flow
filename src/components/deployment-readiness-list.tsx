import { Badge } from "#/components/ui/badge";
import type { DeploymentReadinessCheck } from "#/lib/deployment-policy";

function requirementLabel(requiredFor: DeploymentReadinessCheck["requiredFor"]) {
  if (requiredFor.length === 2) return "Required for demo entry and signup";
  return requiredFor[0] === "demos" ? "Required for demo entry" : "Required for signup";
}

export function DeploymentReadinessList({
  checks,
}: Readonly<{ checks: ReadonlyArray<DeploymentReadinessCheck> }>) {
  return (
    <ul className="flex flex-col gap-3">
      {checks.map((check) => (
        <li key={check.id} className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{check.label}</span>
            <span className="text-xs text-muted-foreground">
              {requirementLabel(check.requiredFor)}
            </span>
          </div>
          <Badge variant={check.ready ? "secondary" : "outline"}>
            {check.ready ? "Ready" : "Action needed"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
