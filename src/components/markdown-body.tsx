import { cn } from "#/lib/utils";

import "./markdown-body.css";

/**
 * The one place rendered Markdown HTML enters the page, so the Preview an owner checks and the
 * Viewer a Visitor gets read the same.
 */
export function MarkdownBody({ html, className }: { html: string; className?: string }) {
  return (
    <article
      className={cn("markdown-body", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
