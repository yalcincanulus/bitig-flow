import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const samplesDirectory = fileURLToPath(new URL("./samples", import.meta.url));

export function readUploadSample(name: string) {
  return new Uint8Array(readFileSync(join(samplesDirectory, name)));
}
