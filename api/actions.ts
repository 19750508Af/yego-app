// Yego API as a Vercel serverless function (Node runtime).
// POST /api/actions { action, args } -> validates, injects isOwner from the
// admin token, and dispatches to the shared action handlers.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { actionHandlers, actionSchemas, type ActionName } from "../server/src/actions";
import { getDb } from "./_db";
import { ensureMigrated } from "./_migrate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }
  try {
    await ensureMigrated();
  } catch (err) {
    console.error("[migrate] failed:", err);
    res.status(500).json({ error: "Error interno. Intenta de nuevo." });
    return;
  }
  const { action, args } = (req.body ?? {}) as { action?: unknown; args?: unknown };
  if (typeof action !== "string" || !(action in actionSchemas)) {
    res.status(404).json({ error: "Acción desconocida." });
    return;
  }
  const name = action as ActionName;
  const parsed = actionSchemas[name].request.safeParse(args);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos." });
    return;
  }
  const adminToken = process.env.ADMIN_TOKEN ?? "";
  const isOwner =
    adminToken.length > 0 && req.headers["x-admin-token"] === adminToken;
  try {
    const result = await actionHandlers[name](getDb(), parsed.data as never, { isOwner });
    res.status(200).json(result);
  } catch (err) {
    console.error(`[actions] ${name} failed:`, err);
    res.status(500).json({ error: "Error interno. Intenta de nuevo." });
  }
}
