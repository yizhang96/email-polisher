import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolve(__dirname, "options.html"), // root file -> dist/options.html
        "background/worker": resolve(__dirname, "src/background/worker.ts"),
        "content/gmail": resolve(__dirname, "src/content/gmail.ts"),
        "styles/panel": resolve(__dirname, "src/styles/panel.css"),

      },
      output: {
        entryFileNames: (chunk) => `${chunk.name}.js`,
        assetFileNames: (asset) => {
          if (asset.name?.endsWith(".css")) return `${asset.name}`;
          return `assets/[name][extname]`;
        },
      },
    },
  },
});
