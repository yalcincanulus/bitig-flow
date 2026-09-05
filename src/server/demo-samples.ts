import { createHash } from "node:crypto";

const welcomeMarkdown = `# Welcome to Bitig Flow

Try editing this document, opening the sample files, or sharing the vault.

Demo work is deleted automatically. Do not upload confidential, personal, or unlawful material.
`;

const samplePdf = Uint8Array.from(
  Buffer.from(
    "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNzIgNzJdL1Jlc291cmNlczw8Pj4+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1MiAwMDAwMCBuIAowMDAwMDAwMTAxIDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxNzYKJSVFT0YK",
    "base64",
  ),
);

const sampleImage = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==",
    "base64",
  ),
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
    title: "Sample PDF",
    fileName: "sample.pdf",
    mimeType: "application/pdf",
    bytes: samplePdf,
    checksum: checksum(samplePdf),
    pageCount: 1,
  },
  image: {
    title: "Sample image",
    fileName: "sample.png",
    mimeType: "image/png",
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
