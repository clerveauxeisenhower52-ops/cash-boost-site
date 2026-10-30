import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vérification d'un ID joueur PUBG Mobile avant paiement (lecture seule, aucune commande, aucun débit).
// Réservée aux clients connectés, avec une limite de demandes par client.
const API = "https://api.fzr.cards/api/v2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fz(method: string, path: string, body?: unknown): Promise<any> {
  const key = Deno.env.get("FAZERCARDS_API_KEY") || "";
  if (!key) throw new Error("missing_key");
  const res = await fetch(API + path, {
    method,
    signal: AbortSignal.timeout(12000),
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch (_) { /* corps vide */ }
  if (!res.ok || data?.ok === false) throw new Error("provider_" + res.status);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) throw new Error("missing_config");
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return reply({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const pid = String(body?.player_id ?? "").replace(/\s/g, "");
    if (!/^[0-9]{5,20}$/.test(pid)) return reply({ status: "invalid_format" }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: allowed, error: rlError } = await admin.rpc("pubg_validate_allow_request", { p_user_id: user.id });
    if (rlError) return reply({ status: "unavailable" }, 503);
    if (allowed !== true) return reply({ status: "rate_limited" }, 429);

    const list = await fz("GET", "/topups/validate-id");
    const items: any[] = (list.items || []).filter((i: any) => /pubg/i.test(i.name || "") && /mobile/i.test(i.name || ""));
    const item = items.find((i: any) => /global/i.test(i.name || "")) || items[0];
    if (!item) return reply({ status: "unsupported" });
    const fieldKey = item.fields?.find((f: any) => /player|game|account|uid|id/i.test(String(f.key || "")))?.key || item.fields?.[0]?.key || "player_id";
    const r = await fz("POST", "/topups/validate-id", { category_id: item.category_id, fields: { [fieldKey]: pid } });

    const region = typeof r.region === "string" ? r.region.slice(0, 40) : null;
    const name = typeof r.player_name === "string" ? r.player_name.replace(/[\r\n]+/g, " ").trim().slice(0, 40) : null;
    if (r.valid !== true) return reply({ status: "invalid" });
    if (region && !/global|international/i.test(region)) return reply({ status: "wrong_region", region });
    return reply({ status: "valid", player_name: name || null, region });
  } catch (e) {
    console.error("pubg-validate_error", e instanceof Error ? e.message : "unknown");
    return reply({ status: "unavailable" }, 503);
  }
});
