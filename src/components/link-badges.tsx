import { AtSignIcon, GlobeIcon, KeyRoundIcon, MailCheckIcon, ShieldAlertIcon } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import {
  analyticsTrustworthy,
  gateRequirements,
  type GateRequirementId,
  type LinkRequirements,
} from "#/lib/link-trust";
import { cn } from "#/lib/utils";

const requirementIcons: Record<GateRequirementId, typeof KeyRoundIcon> = {
  password: KeyRoundIcon,
  email: AtSignIcon,
  verifiedEmail: MailCheckIcon,
};

/**
 * A Link's Gate, as one badge per Requirement — or a single Public badge when it imposes nothing.
 *
 * A Gate is what an owner scans a list of Links for, so it is shown rather than spelled out in the
 * description line where it used to hide among the other clauses.
 */
export function GateBadges({
  link,
  className,
}: Readonly<{ link: LinkRequirements; className?: string }>) {
  const requirements = gateRequirements(link);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {requirements.length === 0 ? (
        <Badge variant="outline">
          <GlobeIcon data-icon="inline-start" />
          Public
        </Badge>
      ) : (
        requirements.map((requirement) => {
          const Icon = requirementIcons[requirement.id];

          return (
            <Badge key={requirement.id} variant="secondary">
              <Icon data-icon="inline-start" />
              {requirement.label}
            </Badge>
          );
        })
      )}
    </span>
  );
}

/** Whether the Link is serving. An inactive Link is the exception, so only it is coloured. */
export function LinkStatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return isActive ? (
    <Badge variant="outline" className="text-muted-foreground">
      Active
    </Badge>
  ) : (
    <Badge variant="destructive">Inactive</Badge>
  );
}

/**
 * The ADR-0042 caveat, shrunk to a mark beside the numbers it qualifies.
 *
 * It used to be a full Alert repeated once per Link, which turned a caveat into the loudest thing
 * on the page. Beside the figure it questions, it says the same thing and costs one line.
 */
export function AnalyticsTrustMark({ link }: Readonly<{ link: LinkRequirements | undefined }>) {
  if (!link || analyticsTrustworthy(link)) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex text-muted-foreground"
        aria-label="These analytics are not trustworthy"
      >
        <ShieldAlertIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        This Link has no Requirements, so anyone with the URL can create Visits. Add a password or
        an email Requirement to make its analytics trustworthy.
      </TooltipContent>
    </Tooltip>
  );
}
