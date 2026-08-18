const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const imageReferencePattern = new RegExp(`!\\[[^\\]]*\\]\\(doc/(${uuidPattern})\\)`, "g");
const fencedCodePattern = /```[\s\S]*?```/g;
const inlineCodePattern = /`[^`]*`/g;
const remoteMarkdownImagePattern = /!\[[^\]]*\]\(\s*https?:\/\//i;
const remoteUrlPattern = /^https?:\/\/\S+$/i;

function markdownWithoutCode(source: string) {
  return source.replace(fencedCodePattern, "").replace(inlineCodePattern, "");
}

export function extractDocumentReferences(source: string) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const match of markdownWithoutCode(source).matchAll(imageReferencePattern)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function imageReferenceMarkdown(alt: string, documentId: string) {
  const safeAlt = alt.replaceAll("]", "");
  return `![${safeAlt}](doc/${documentId})`;
}

export function clipboardLooksLikeRemoteImage(clipboard: string) {
  const trimmed = clipboard.trim();
  if (remoteUrlPattern.test(trimmed)) return true;
  return remoteMarkdownImagePattern.test(trimmed);
}
