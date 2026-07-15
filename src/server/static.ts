import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");
const distRoot = path.join(workspaceRoot, "dist");
const indexHtmlPath = path.join(distRoot, "index.html");
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

function isApiPath(requestPath: string): boolean {
  return apiPrefixes.some(
    (prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`),
  );
}

function resolveStaticAssetPath(requestPath: string): string | null {
  const trimmedPath = requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(distRoot, trimmedPath);

  if (!resolvedPath.startsWith(distRoot)) {
    return null;
  }

  return resolvedPath;
}

export function registerStaticUiRoutes(app: Hono): void {
  app.get("*", (context) => {
    const requestPath = new URL(context.req.url).pathname;

    if (isApiPath(requestPath)) {
      return context.json({ error: "Not found." }, 404);
    }

    if (!existsSync(indexHtmlPath)) {
      return context.text(
        "Dashboard assets are not built yet. Run `bun run dashboard:build`.",
        404,
      );
    }

    const resolvedAssetPath = resolveStaticAssetPath(requestPath);
    const looksLikeAssetRequest = path.extname(requestPath).length > 0;

    if (resolvedAssetPath && looksLikeAssetRequest && existsSync(resolvedAssetPath)) {
      return new Response(Bun.file(resolvedAssetPath));
    }

    if (looksLikeAssetRequest) {
      return context.json({ error: "Asset not found." }, 404);
    }

    return new Response(Bun.file(indexHtmlPath));
  });
}
