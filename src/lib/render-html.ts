import type { MarkdownExtension } from "@tanstack/markdown";
import { renderHtml as renderMarkdownToHtml } from "@tanstack/markdown/html";

const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export type ResolveImage = (src: string) => string | undefined;

function policyExtension(resolveImage: ResolveImage): MarkdownExtension {
  return {
    name: "bitig-render-policy",
    renderHtml(node, context) {
      if (node.type === "link") {
        const title = node.title === undefined ? "" : ` title="${escapeAttr(node.title)}"`;
        const children = node.children.map((child) => context.renderInline(child)).join("");
        return `<a href="${escapeAttr(node.href)}" rel="noopener noreferrer" target="_blank"${title}>${children}</a>`;
      }

      if (node.type === "image") {
        const resolved = resolveImage(node.src);
        if (!resolved) return escapeHtml(node.alt);
        const title = node.title === undefined ? "" : ` title="${escapeAttr(node.title)}"`;
        return `<img src="${escapeAttr(resolved)}" alt="${escapeAttr(node.alt)}"${title}>`;
      }

      return undefined;
    },
  };
}

/**
 * Markdown becomes HTML in this module and nowhere else. `allowHtml` is policy, not a default
 * (ADR-0007). Parser options, URL sanitization, and the remote-image block are internal and are
 * never arguments — the only parameter besides the source is `resolveImage` (ADR-0058, ADR-0059).
 */
export function renderHtml(markdown: string, resolveImage: ResolveImage): string {
  // allowHtml: false is a stored-XSS prohibition, not a library default we happen to inherit.
  return renderMarkdownToHtml(markdown, {
    allowHtml: false,
    extensions: [policyExtension(resolveImage)],
  });
}
