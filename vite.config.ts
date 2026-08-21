import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { pdfjsCmaps } from "./vite-pdfjs-cmaps.ts";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
  plugins: [
    pdfjsCmaps(),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact({ compiler: true }),
  ],
});

export default config;
