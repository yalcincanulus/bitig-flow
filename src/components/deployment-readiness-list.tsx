import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import type { DeploymentReadinessCheck } from "#/lib/deployment-policy";
import { cn } from "#/lib/utils";

function requirementLabel(requiredFor: DeploymentReadinessCheck["requiredFor"]) {
  if (requiredFor.length === 2) return "Demo entry and signup";
  return requiredFor[0] === "demos" ? "Demo entry" : "Signup";
}

/**
 * Every runtime check, failing ones first. A ready check is quiet; one that needs action carries
 * the warning colour, an icon and the words, so the state never rests on colour alone.
 */
export function DeploymentReadinessList({
  checks,
  className,
}: Readonly<{ checks: ReadonlyArray<DeploymentReadinessCheck>; className?: string }>) {
  const ordered = [...checks].sort((first, second) => Number(first.ready) - Number(second.ready));

  return (
    <ul className={cn("grid gap-x-6 gap-y-0.5 sm:grid-cols-2", className)}>
      {ordered.map((check) => (
        <li
          key={check.id}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5",
            !check.ready && "bg-warning/10",
          )}
        >
          {check.ready ? (
            <CircleCheckIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CircleAlertIcon className="size-4 shrink-0 text-warning" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">{check.label}</span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">
              {requirementLabel(check.requiredFor)}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 text-[0.6875rem]",
              check.ready ? "text-muted-foreground" : "font-medium text-foreground",
            )}
          >
            {check.ready ? "Ready" : "Action needed"}
          </span>
        </li>
      ))}
    </ul>
  );
}
