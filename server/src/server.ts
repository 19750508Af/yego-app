// Yego — standalone HTTP server (Bun).
// - POST /api/actions { action, args } -> dispatches to actionHandlers
// - GET  /api/health                 -> { ok: true }
// - everything else                  -> static client (public/), SPA fallback
import { readFile } from "node:fs/promises";
import path from "node:path";
import { actionHandlers, actionSchemas, type ActionName } from "./actions";
import { db, type Db } from "./db";
import { migrate } from "./migrate";

const PUBLIC_DIR = path.join(import.meta.dir, "..", "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(urlPath: string): Promise<Response> {
  // Normalize and block path traversal.
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.includes("\0")) return new Response("bad request", { status: 400 });
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, rel === "/" ? "index.html" : rel.slice(1));
  let data: Uint8Array;
  try {
    data = new Uint8Array(await readFile(filePath));
  } catch {
    // SPA fallback: client-side routes (#admin, /admin, etc.)
    try {
      data = new Uint8Array(await readFile(path.join(PUBLIC_DIR, "index.html")));
      filePath = path.join(PUBLIC_DIR, "index.html");
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  return new Response(data as BodyInit, {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    },
  });
}

async function handleAction(database: Db, req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const { action, args } = (body ?? {}) as { action?: unknown; args?: unknown };
  if (typeof action !== "string" || !(action in actionSchemas)) {
    return Response.json({ error: "Acción desconocida." }, { status: 404 });
  }
  const name = action as ActionName;
  const parsed = actionSchemas[name].request.safeParse(args);
  if (!parsed.success) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const adminToken = process.env.ADMIN_TOKEN ?? "";
  const isOwner = adminToken.length > 0 && req.headers.get("x-admin-token") === adminToken;
  try {
    const result = await actionHandlers[name](database, parsed.data as never, { isOwner });
    return Response.json(result);
  } catch (err) {
    console.error(`[actions] ${name} failed:`, err);
    return Response.json({ error: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}

export function createHandler(database: Db) {
  return async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/actions" && req.method === "POST") return handleAction(database, req);
    if (url.pathname === "/api/health" && req.method === "GET") return Response.json({ ok: true });
    if (url.pathname.startsWith("/api/")) return Response.json({ error: "no encontrado" }, { status: 404 });
    return serveStatic(url.pathname);
  };
}

if (import.meta.main) {
  await migrate();
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ port, fetch: createHandler(db) });
  console.log(`Yego escuchando en el puerto ${port}`);
}
