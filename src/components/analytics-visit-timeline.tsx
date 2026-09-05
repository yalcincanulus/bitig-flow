import { ChartNoAxesCombinedIcon, ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { dwellPagesWithZeros, type AnalyticsLinkPayload } from "#/lib/analytics-fold";
import {
  analyticsNumberFormat,
  formatAnalyticsInstant,
  formatDownloadCount,
  formatTotalTime,
  unidentifiedVisitorLabel,
} from "#/lib/analytics-format";

type TimelineIdentity = AnalyticsLinkPayload["identities"][number];
type TimelineVisit = TimelineIdentity["visits"][number];
type TimelineDocument = TimelineVisit["documents"][number];
type DocumentRecord = {
  title: string;
  kind: "markdown" | "pdf" | "image";
  pageCount: number | null;
};

export function AnalyticsVisitTimeline({
  identities,
  documents,
}: Readonly<{
  identities: AnalyticsLinkPayload["identities"];
  documents: ReadonlyMap<string, DocumentRecord>;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visits</CardTitle>
        <CardDescription>
          Newest first. Visits with and without an email address can appear as separate visitors.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {identities.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartNoAxesCombinedIcon />
              </EmptyMedia>
              <EmptyTitle>No visits in this range</EmptyTitle>
              <EmptyDescription>No visits in the selected date range.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          identities.map((identity) => (
            <IdentityGroup
              key={identity.email ?? identity.visitorId}
              identity={identity}
              documents={documents}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function IdentityGroup({
  identity,
  documents,
}: Readonly<{
  identity: TimelineIdentity;
  documents: ReadonlyMap<string, DocumentRecord>;
}>) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <IdentityLabel identity={identity} />
        <span className="text-xs text-muted-foreground tabular-nums">
          {analyticsNumberFormat.format(identity.visitCount)} Visits
        </span>
      </header>
      <div className="flex flex-col gap-4">
        {identity.visits.map((visit) => (
          <VisitBlock key={visit.visitId} visit={visit} documents={documents} />
        ))}
      </div>
    </section>
  );
}

function IdentityLabel({ identity }: Readonly<{ identity: TimelineIdentity }>) {
  if (identity.email !== null) {
    return <h2 className="text-sm font-medium">{identity.email}</h2>;
  }

  return (
    <Tooltip>
      <TooltipTrigger className="font-mono text-sm font-medium">
        {unidentifiedVisitorLabel(identity.visitorId)}
      </TooltipTrigger>
      <TooltipContent>{identity.visitorId}</TooltipContent>
    </Tooltip>
  );
}

function VisitBlock({
  visit,
  documents,
}: Readonly<{
  visit: TimelineVisit;
  documents: ReadonlyMap<string, DocumentRecord>;
}>) {
  const started = formatAnalyticsInstant(visit.startedAt);
  const lastSeen = formatAnalyticsInstant(visit.lastSeenAt);

  return (
    <article className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Started <time dateTime={started.dateTime}>{started.label}</time>
        {" · "}
        Last seen <time dateTime={lastSeen.dateTime}>{lastSeen.label}</time>
      </p>
      {visit.documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No views.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Total time</TableHead>
              <TableHead>Pages read</TableHead>
              <TableHead>Downloads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visit.documents.map((row, index) => (
              <DocumentViewRow
                key={`${visit.visitId}:${row.documentId}:${index}`}
                row={row}
                document={documents.get(row.documentId)}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </article>
  );
}

function DocumentViewRow({
  row,
  document,
}: Readonly<{
  row: TimelineDocument;
  document: DocumentRecord | undefined;
}>) {
  const [open, setOpen] = useState(false);
  const pagesId = useId();
  const showPages = document?.kind === "pdf";
  const pages = showPages ? dwellPagesWithZeros(document.pageCount ?? null, row.pages) : [];

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            {showPages ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Time per page"
                aria-expanded={open}
                aria-controls={pagesId}
                onClick={() => setOpen((current) => !current)}
              >
                <ChevronRightIcon
                  data-icon="inline-start"
                  className="transition-transform group-aria-expanded/button:rotate-90"
                />
              </Button>
            ) : null}
            {document?.title || "Document"}
          </div>
        </TableCell>
        <TableCell className="tabular-nums">{formatTotalTime(row.totalMs)}</TableCell>
        <TableCell className="tabular-nums">
          {analyticsNumberFormat.format(row.pagesRead)}
        </TableCell>
        <TableCell className="tabular-nums">{formatDownloadCount(row.downloads)}</TableCell>
      </TableRow>
      {showPages && open ? (
        <TableRow id={pagesId}>
          <TableCell colSpan={4}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Total time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => (
                  <TableRow key={page.page}>
                    <TableCell>Page {page.page}</TableCell>
                    <TableCell className="tabular-nums">{formatTotalTime(page.ms)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
