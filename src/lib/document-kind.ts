import { FileTextIcon, FileTypeIcon, ImageIcon } from "lucide-react";

export type DocumentKind = "markdown" | "pdf" | "image";

/**
 * The three kinds a Document can be, said once. Every surface that names a kind — the grid tile,
 * the Vault list, the Link target line — reads it from here rather than printing the enum.
 */
export const kinds = {
  markdown: { label: "Markdown", icon: FileTextIcon },
  pdf: { label: "PDF", icon: FileTypeIcon },
  image: { label: "Image", icon: ImageIcon },
};

export function documentKindLabel(kind: DocumentKind) {
  return kinds[kind].label;
}
