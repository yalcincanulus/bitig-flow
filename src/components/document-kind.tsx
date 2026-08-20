import { FileTextIcon, FileTypeIcon, ImageIcon } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { Spinner } from "#/components/ui/spinner";
import { documentBytesUrl } from "#/lib/document-bytes";
import { markdownExcerpt } from "#/lib/document-excerpt";
import { cn } from "#/lib/utils";

export type DocumentKind = "markdown" | "pdf" | "image";

/**
 * The three kinds a Document can be, said once. Every surface that names a kind — the grid tile,
 * the Vault list, the Link target line — reads it from here rather than printing the enum.
 */
const kinds = {
  markdown: { label: "Markdown", icon: FileTextIcon },
  pdf: { label: "PDF", icon: FileTypeIcon },
  image: { label: "Image", icon: ImageIcon },
};

export function documentKindLabel(kind: DocumentKind) {
  return kinds[kind].label;
}

export function DocumentKindIcon({
  kind,
  className,
}: Readonly<{ kind: DocumentKind; className?: string }>) {
  const Icon = kinds[kind].icon;
  return <Icon className={className} />;
}

export function DocumentKindBadge({ kind }: Readonly<{ kind: DocumentKind }>) {
  const Icon = kinds[kind].icon;

  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" />
      {kinds[kind].label}
    </Badge>
  );
}

type ThumbnailDocument = Readonly<{
  id: string;
  kind: DocumentKind;
  status: "pending" | "ready";
  content: string | null;
  pageCount: number | null;
}>;

/**
 * A Document at a glance, as a sheet of paper on a desk — the same metaphor the Viewer lays a
 * Document out with, shrunk to a tile.
 *
 * Every tile is the same shape whatever the kind, which is the whole point: an image no longer
 * makes its neighbours ragged. Images fill the tile because they are their own preview; markdown
 * shows its first words; a PDF shows its glyph and its length.
 */
export function DocumentThumbnail({
  document,
  compact = false,
  className,
}: Readonly<{
  document: ThumbnailDocument;
  /** For the list rows, where a sheet of paper is a few pixels across and its words are noise. */
  compact?: boolean;
  className?: string;
}>) {
  const excerpt = document.kind === "markdown" && !compact ? markdownExcerpt(document.content) : "";

  if (compact) {
    return (
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden bg-muted text-muted-foreground",
          className,
        )}
      >
        {document.status === "ready" && document.kind === "image" ? (
          <img
            src={documentBytesUrl(document.id)}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <DocumentKindIcon kind={document.kind} className="size-4" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative isolate aspect-4/3 overflow-hidden bg-viewer-desk",
        // A hair of inner shading, so the desk reads as a surface rather than a flat swatch.
        "after:pointer-events-none after:absolute after:inset-0 after:shadow-[inset_0_-1px_0_0_var(--color-border)]",
        className,
      )}
    >
      {document.status === "pending" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : document.kind === "image" ? (
        <img
          src={documentBytesUrl(document.id)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <div className="absolute inset-x-[16%] top-4 bottom-0 overflow-hidden rounded-t-sm bg-viewer-paper px-3 pt-3 ring-1 shadow-sm ring-foreground/10">
          {excerpt ? (
            <p className="text-[0.5rem]/[0.8rem] text-muted-foreground">{excerpt}</p>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 pb-6">
              <DocumentKindIcon kind={document.kind} className="size-6 text-muted-foreground/60" />
              {document.kind === "pdf" && document.pageCount ? (
                <span className="text-[0.625rem] text-muted-foreground">
                  {document.pageCount} {document.pageCount === 1 ? "page" : "pages"}
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
