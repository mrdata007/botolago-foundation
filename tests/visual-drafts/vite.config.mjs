import { createReadStream } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  plugins: [
    react(),
    tailwind(),
    {
      name: "qa-image",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/qa/source.png") return next();
          res.setHeader("content-type", "image/png");
          createReadStream(
            fileURLToPath(
              new URL("../../test-results/match-visual-drafts/source.png", import.meta.url),
            ),
          ).pipe(res);
        });
      },
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 4390,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
