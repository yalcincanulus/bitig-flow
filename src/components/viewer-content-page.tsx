import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";
import { ViewerImage } from "#/components/viewer-image";
import { ViewerPdfDocument } from "#/components/viewer-pdf-document";
import { ViewerSenderLine } from "#/components/viewer-sender-line";
import { cn } from "#/lib/utils";
import type { VisitorContentPage, VisitorVaultMember } from "#/server/viewer/visitor-gate";

export function ViewerContentPage({ page }: { page: VisitorContentPage }) {
  return (
    <>
      <ViewerSenderLine senderName={page.senderName} organizationName={page.organizationName} />
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        {page.title}
      </h1>
      {page.kind === "markdown" ? (
        <div className="mt-6" dangerouslySetInnerHTML={{ __html: page.html }} />
      ) : null}
      {page.kind === "pdf" ? <ViewerPdfDocument page={page} /> : null}
      {page.kind === "image" ? <ViewerImage page={page} /> : null}
      {page.kind === "vault_index" ? <ViewerVaultIndex page={page} /> : null}
    </>
  );
}

function ViewerVaultIndex({
  page,
}: {
  page: Extract<VisitorContentPage, { kind: "vault_index" }>;
}) {
  if (page.members.length === 0) {
    return <p className="mt-3 text-base text-muted-foreground">There's nothing in here yet.</p>;
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {page.members.map((member) => (
        <li key={member.documentId}>
          <Link
            to="/v/$slug/$documentId"
            params={{ slug: page.slug, documentId: member.documentId }}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 w-full justify-between gap-3 rounded-lg px-3 text-base",
            )}
          >
            <span className="min-w-0 truncate">{member.title}</span>
            <span className="shrink-0 text-muted-foreground">{memberKindLabel(member)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function memberKindLabel(member: VisitorVaultMember) {
  return member.status === "pending" ? `${member.kind} · Uploading` : member.kind;
}
