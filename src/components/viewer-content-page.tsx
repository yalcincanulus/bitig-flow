import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronRightIcon, FolderOpenIcon } from "lucide-react";

import { documentKindLabel, DocumentKindIcon } from "#/components/document-kind";
import { MarkdownBody } from "#/components/markdown-body";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "#/components/ui/item";
import { Spinner } from "#/components/ui/spinner";
import { ViewerImage } from "#/components/viewer-image";
import { viewerPaperSurface, viewerPaperWidth } from "#/components/viewer-paper";
import { ViewerPdfDocument } from "#/components/viewer-pdf-document";
import { ViewerSenderLine } from "#/components/viewer-sender-line";
import { cn } from "#/lib/utils";
import type { VisitorContentPage } from "#/server/viewer/visitor-gate";

export function ViewerContentPage({ page }: { page: VisitorContentPage }) {
  // A Vault index is a list of choices, not a Document, so it stays narrower than the paper.
  const narrow = page.kind === "vault_index";

  return (
    <div className={cn(narrow ? "mx-auto w-full max-w-xl" : viewerPaperWidth)}>
      {page.kind !== "vault_index" && page.vaultTitle ? (
        <ViewerVaultBackLink slug={page.slug} vaultTitle={page.vaultTitle} />
      ) : null}
      <ViewerSenderLine
        senderName={page.senderName}
        organizationName={page.organizationName}
        share={page.kind === "vault_index" ? "vault" : "document"}
      />
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        {page.title}
      </h1>
      {page.kind === "markdown" ? (
        <MarkdownBody
          html={page.html}
          className={cn(viewerPaperSurface, "mt-6 border px-6 py-10 sm:px-14 sm:py-14")}
        />
      ) : null}
      {page.kind === "pdf" ? <ViewerPdfDocument page={page} /> : null}
      {page.kind === "image" ? <ViewerImage page={page} /> : null}
      {page.kind === "vault_index" ? <ViewerVaultIndex page={page} /> : null}
    </div>
  );
}

function ViewerVaultBackLink({ slug, vaultTitle }: { slug: string; vaultTitle: string }) {
  return (
    <Link
      to="/v/$slug"
      params={{ slug }}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "mb-6 h-11 min-w-0 bg-card px-3 text-base",
      )}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      <span className="truncate">Back to {vaultTitle}</span>
    </Link>
  );
}

function ViewerVaultIndex({
  page,
}: {
  page: Extract<VisitorContentPage, { kind: "vault_index" }>;
}) {
  if (page.members.length === 0) {
    return (
      <Empty className="mt-6 border bg-card shadow-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpenIcon />
          </EmptyMedia>
          <EmptyTitle>This Vault is empty</EmptyTitle>
          <EmptyDescription>There's nothing in here yet.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-6">
      <p className="text-base text-muted-foreground">
        {page.members.length} {page.members.length === 1 ? "Document" : "Documents"}
      </p>
      <Card className="py-0 shadow-md">
        <ItemGroup className="gap-0">
          {page.members.map((member, index) => (
            <Fragment key={member.documentId}>
              {index > 0 ? <ItemSeparator className="my-0" /> : null}
              <Item
                render={
                  <Link
                    to="/v/$slug/$documentId"
                    params={{ slug: page.slug, documentId: member.documentId }}
                  />
                }
                className="min-h-11 rounded-none px-4 hover:bg-muted"
              >
                <ItemMedia variant="icon">
                  <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {member.status === "pending" ? (
                      <Spinner />
                    ) : (
                      <DocumentKindIcon kind={member.kind} />
                    )}
                  </span>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="text-base">{member.title}</ItemTitle>
                  {member.status === "pending" ? (
                    <ItemDescription>Uploading</ItemDescription>
                  ) : null}
                </ItemContent>
                <ItemActions>
                  <Badge variant="outline">{documentKindLabel(member.kind)}</Badge>
                  <ChevronRightIcon />
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      </Card>
    </div>
  );
}
