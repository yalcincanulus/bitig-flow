import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
const samplePdf = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL("./demo-sample-assets/the-legend-of-sleepy-hollow.pdf", import.meta.url)),
  ),
);

// NASA / Bill Anders, 1968. U.S. government work, public domain.
const sampleImage = new Uint8Array(
  readFileSync(fileURLToPath(new URL("./demo-sample-assets/earthrise.jpg", import.meta.url))),
);

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
