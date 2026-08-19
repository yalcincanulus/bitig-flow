import { createReadStream, cpSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const cmapsRoot = join(dirname(fileURLToPath(import.meta.url)), "node_modules/pdfjs-dist/cmaps");

export function pdfjsCmaps(): Plugin {
  return {
    name: "pdfjs-cmaps",
    configureServer(server) {
      server.middlewares.use("/pdfjs/cmaps", (request, response, next) => {
        const requestPath = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/").replace(
          /^\/+/,
          "",
        );
        const file = normalize(join(cmapsRoot, requestPath));
        const fromRoot = relative(cmapsRoot, file);
        if (fromRoot.startsWith("..") || fromRoot.includes(`..${sep}`)) {
          response.statusCode = 403;
          response.end();
          return;
        }

        try {
          if (!statSync(file).isFile()) {
            next();
            return;
          }
          response.setHeader("Content-Type", "application/octet-stream");
          createReadStream(file).pipe(response);
        } catch {
          next();
        }
      });
    },
    writeBundle(options) {
      if (options.dir) cpSync(cmapsRoot, join(options.dir, "pdfjs/cmaps"), { recursive: true });
    },
  };
}
