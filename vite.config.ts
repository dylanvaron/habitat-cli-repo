import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPrefixes = [
  "/health",
  "/registration",
  "/modules",
  "/inventory",
  "/builds",
  "/ticks",
  "/catalog",
  "/solar",
  "/scan",
];

export default defineConfig({
  root: path.resolve(__dirname, "web"),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: Object.fromEntries(
      apiPrefixes.map((prefix) => [
        prefix,
        {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
      ]),
    ),
  },
  test: {
    environment: "jsdom",
    setupFiles: path.resolve(__dirname, "web/src/test/setup.ts"),
    include: ["src/**/*.vitest.tsx"],
  },
});
