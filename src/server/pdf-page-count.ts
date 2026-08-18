import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function countPdfPages(bytes: Uint8Array) {
  const loadingTask = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    verbosity: VerbosityLevel.ERRORS,
  });

  try {
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    await pdf.cleanup();
    return pageCount > 0 ? pageCount : undefined;
  } catch {
    return undefined;
  } finally {
    await loadingTask.destroy();
  }
}
