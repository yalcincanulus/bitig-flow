import { expect, test } from "vitest";

import { sniffUploadMimeType } from "#/lib/upload";
import { countPdfPages } from "#/server/pdf-page-count";
import { demoSamples } from "#/server/demo-samples";

test("demo samples are a real public-domain PDF and image, not empty placeholders", async () => {
  expect(sniffUploadMimeType(demoSamples.pdf.bytes)).toBe("application/pdf");
  expect(await countPdfPages(demoSamples.pdf.bytes)).toBe(demoSamples.pdf.pageCount);
  expect(demoSamples.pdf.pageCount).toBeGreaterThanOrEqual(30);
  expect(demoSamples.pdf.pageCount).toBeLessThanOrEqual(50);
  expect(demoSamples.pdf.bytes.byteLength).toBeGreaterThan(50_000);

  expect(sniffUploadMimeType(demoSamples.image.bytes)).toBe("image/jpeg");
  expect(demoSamples.image.bytes.byteLength).toBeGreaterThan(50_000);
});
