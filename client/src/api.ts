// Typed RPC client for the standalone Yego server.
// Same call shape as the original SDK client: api.getDashboard({}) etc.
// Requests go to POST /api/actions as { action, args } and the admin token
// (when set) travels in the x-admin-token header.
//
// Types are imported type-only from server/src/actions, so the client bundle
// never includes server code.
import type { ActionInputs, ActionName, ActionOutputs } from "../../server/src/actions";

export type ApiRequest<_TClient, A extends ActionName> = ActionInputs[A];
export type ApiResponse<_TClient, A extends ActionName> = ActionOutputs[A];

type ApiClient = {
  [A in ActionName]: (args: ApiRequest<unknown, A>) => Promise<ApiResponse<unknown, A>>;
};

const TOKEN_KEY = "yego-admin-token";

export function getAdminToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Storage can be unavailable in an embedded webview. */
  }
}

async function callAction(action: string, args: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = getAdminToken();
  if (token) headers["x-admin-token"] = token;
  let res: Response;
  try {
    res = await fetch("/api/actions", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, args }),
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const message = (payload as { error?: string } | null)?.error ?? `Error ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

export const api = new Proxy({} as ApiClient, {
  get: (_target, action: string) => (args: unknown) => callAction(action, args),
});
