export const uploadMaxBytes = 25 * 1024 * 1024;

export const allowedUploadMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedUploadMimeType = (typeof allowedUploadMimeTypes)[number];

const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pdfSignature = new TextEncoder().encode("%PDF-");
const gifSignature = new TextEncoder().encode("GIF8");
const riffSignature = new TextEncoder().encode("RIFF");
const webpSignature = new TextEncoder().encode("WEBP");

function startsWith(bytes: Uint8Array, signature: Uint8Array, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function sniffUploadMimeType(bytes: Uint8Array): AllowedUploadMimeType | undefined {
  if (startsWith(bytes, pdfSignature)) return "application/pdf";
  if (startsWith(bytes, pngSignature)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (startsWith(bytes, riffSignature) && startsWith(bytes, webpSignature, 8)) return "image/webp";
  if (startsWith(bytes, gifSignature)) return "image/gif";
  return undefined;
}

export function isAllowedUploadMimeType(value: string): value is AllowedUploadMimeType {
  return (allowedUploadMimeTypes as ReadonlyArray<string>).includes(value);
}

export function documentKindFromMimeType(mimeType: AllowedUploadMimeType) {
  return mimeType === "application/pdf" ? ("pdf" as const) : ("image" as const);
}

export function isUploadOverSizeCap(byteSize: number) {
  return byteSize > uploadMaxBytes;
}

function shouldStripFileNameCharacter(character: string) {
  const code = character.codePointAt(0);
  return code === undefined || code < 32 || code === 127 || character === "/" || character === "\\";
}

export function sanitizeFileName(fileName: string) {
  let sanitized = "";
  for (const character of fileName) {
    if (!shouldStripFileNameCharacter(character)) sanitized += character;
    if (sanitized.length === 255) break;
  }
  return sanitized;
}

const mimeTypeByExtension: Record<string, AllowedUploadMimeType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function mimeTypeFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? mimeTypeByExtension[extension] : undefined;
}

export function storageKeyPrefix() {
  return process.env.S3_KEY_PREFIX ?? "";
}

export function storageKeyForDocument(organizationId: string, documentId: string, prefix = "") {
  return `${prefix}org/${organizationId}/doc/${documentId}/original`;
}
