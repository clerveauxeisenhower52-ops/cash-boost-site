// Client FazerCards partagé par les fonctions Free Fire.
const API = "https://api.fzr.cards/api/v2";

export class FzError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function fz(method: string, path: string, body?: unknown, idem?: string): Promise<any> {
  const key = Deno.env.get("FAZERCARDS_API_KEY") || "";
  if (!key) throw new FzError(401, "FAZERCARDS_API_KEY manquante", null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: Record<string, string> = { "X-API-Key": key, "Content-Type": "application/json" };
    if (idem) headers["Idempotency-Key"] = idem;
    const response = await fetch(API + path, {
      method,
      signal: controller.signal,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null;
    try { data = await response.json(); } catch { /* réponse vide */ }
    if (!response.ok || data?.ok === false) {
      throw new FzError(response.status, String(data?.error || ("HTTP " + response.status)), data);
    }
    return data;
  } catch (e) {
    if (e instanceof FzError) throw e;
    throw new FzError(0, String((e as any)?.message || e), null);
  } finally {
    clearTimeout(timeout);
  }
}
