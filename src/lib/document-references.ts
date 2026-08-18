import { documentIdSchema, type DocumentId } from "#/server/ids";

const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const imageReferencePattern = new RegExp(
  `!\\[[^\\]]*\\]\\(\\s*doc/(${uuidPattern})(?:\\s+"[^"]*")?\\s*\\)`,
  "g",
);
const fencedCodePattern = /```[\s\S]*?```/g;
const inlineCodePattern = /`[^`]*`/g;
const remoteMarkdownImagePattern = /!\[[^\]]*\]\(\s*https?:\/\//i;
const remoteImageUrlPattern = /^https?:\/\/\S+\.(?:gif|jpe?g|png|webp)(?:\?.*)?$/i;

function markdownWithoutCode(source: string) {
  return source.replace(fencedCodePattern, "").replace(inlineCodePattern, "");
}

export function extractDocumentReferences(source: string) {
  const ids: DocumentId[] = [];
  const seen = new Set<string>();

  for (const match of markdownWithoutCode(source).matchAll(imageReferencePattern)) {
    const parsed = documentIdSchema.safeParse(match[1]);
    if (!parsed.success || seen.has(parsed.data)) continue;
    seen.add(parsed.data);
    ids.push(parsed.data);
  }

  return ids;
}

export function imageReferenceMarkdown(alt: string, documentId: string) {
  const safeAlt = alt.replaceAll("]", "");
  return `![${safeAlt}](doc/${documentId})`;
}

export function clipboardLooksLikeRemoteImage(clipboard: string) {
  const trimmed = clipboard.trim();
  if (remoteMarkdownImagePattern.test(trimmed)) return true;
  return remoteImageUrlPattern.test(trimmed);
}
