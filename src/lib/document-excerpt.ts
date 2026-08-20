/**
 * The opening prose of a markdown Document, for the paper thumbnail on the Documents grid.
 *
 * It is deliberately not a renderer: it drops the syntax nobody can read at thumbnail size —
 * fences, images, link targets, list bullets, emphasis marks — and returns the words that are
 * left. What it produces is text, never HTML, so it can never carry markup into the page.
 */
export function markdownExcerpt(content: string | null | undefined, limit = 400) {
  if (!content) return "";

  const prose = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>+\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, " ")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return prose.length > limit ? `${prose.slice(0, limit).trimEnd()}…` : prose;
}
