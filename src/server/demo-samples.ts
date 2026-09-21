import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function readSampleAsset(name: string) {
  const besideModule = fileURLToPath(new URL(`./demo-sample-assets/${name}`, import.meta.url));
  if (existsSync(besideModule)) return readFileSync(besideModule);
  // The production bundle's import.meta.url is dist/server/assets/*.js. Vite does
  // not copy these binaries beside that chunk. The image keeps the source tree.
  const inSourceTree = join(process.cwd(), "src/server/demo-sample-assets", name);
  if (existsSync(inSourceTree)) return readFileSync(inSourceTree);
  throw new Error(`Demo sample asset not found: ${name}`);
}

const welcomeMarkdown = `# Welcome to Bitig Flow

Bitig Flow is a document sharing app. You write or upload documents, group them in vaults, and share them through links.

Each link can require a password or an email. Then Bitig Flow records how visitors open and read the documents.

Bitig Flow is an alternative to Papermark and DocSend.

## Try the demo

1. Edit this document.
2. Open the sample PDF and the sample image.
3. Share the vault.

Do not upload confidential, personal, or unlawful material.

This demo environment ends after 24 hours. The demo then deletes the work.
`;

// Washington Irving, 1820. Public domain in the United States.
const samplePdf = new Uint8Array(readSampleAsset("the-legend-of-sleepy-hollow.pdf"));

// NASA / Bill Anders, 1968. U.S. government work, public domain.
const sampleImage = new Uint8Array(readSampleAsset("earthrise.jpg"));

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export const demoSamples = {
  welcome: {
    title: "Welcome to Bitig Flow",
    content: welcomeMarkdown,
  },
  pdf: {
    title: "The Legend of Sleepy Hollow",
    fileName: "the-legend-of-sleepy-hollow.pdf",
    mimeType: "application/pdf",
    bytes: samplePdf,
    checksum: checksum(samplePdf),
    pageCount: 39,
  },
  image: {
    title: "Earthrise",
    fileName: "earthrise.jpg",
    mimeType: "image/jpeg",
    bytes: sampleImage,
    checksum: checksum(sampleImage),
    pageCount: null,
  },
  vault: {
    name: "Product tour",
    description: "Sample documents to try sharing.",
  },
  link: {
    name: "Product tour",
  },
} as const;

export const demoSampleByteSize =
  demoSamples.pdf.bytes.byteLength + demoSamples.image.bytes.byteLength;
