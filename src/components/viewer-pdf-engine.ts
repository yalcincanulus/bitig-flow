import "#/lib/map-get-or-insert";
import {
  getDocument,
  GlobalWorkerOptions,
  OutputScale,
  RenderingCancelledException,
  TextLayer,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export { getDocument, OutputScale, RenderingCancelledException, TextLayer };
