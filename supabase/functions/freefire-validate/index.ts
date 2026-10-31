import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fz } from "./fz.ts";

// Vérification d'un ID Free Fire avant paiement : aucun achat, aucun débit.
// Le fournisseur LATAM est choisi en priorité volontairement ; seul le résultat NA
// est accepté par freefire_purchase pour autoriser un achat.
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Note: conserve le comportement déployé. Les erreurs retournées par supabase-js
// dans { error } ne lèvent pas nécessairement d'exception ; voir le contrôle DB associé.
async function trace(userId: string, playerId: string, status: string, region: string | null, playerName: string | null) {
  try {
    await sb.from("freefire_player_checks").insert({ user_id: userId, player_id: playerId, status, region, player_name: playerName });
    await sb.from("freefire_player_checks").delete().eq("user_id", userId)
      .lt("created_at", new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString());
  } catch (e) {
    console.error("freefire-validate_trace", e instanceof Error ? e.message : "unknown");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let uid = "";
  let pid = "";
  let reachedProvider = false;
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: au, error: ae } = await sb.auth.getUser(token);
    if (ae || !au?.user) return json({ ok: false, error: "unauthorized" }, 401);
    uid = au.user.id;

    const body = await req.json().catch(() => ({}));
    pid = String(body.player_id || "").replace(/\s/g, "");
    if (!/^[0-9]{5,15}$/.test(pid)) return json({ ok: false, error: "invalid_id" }, 400);

    const { data: allowed, error: rlError } = await sb.rpc("freefire_validate_allow_request", { p_user_id: uid });
    if (rlError) return json({ ok: false, error: "unavailable" });
    if (allowed !== true) return json({ ok: false, error: "rate_limited" });

    reachedProvider = true;
    const list = await fz("GET", "/topups/validate-id");
    const items: any[] = (list.items || []).filter((i: any) => /free\s*fire/i.test(i.name || ""));
    // Ordre volontaire : LATAM en priorité, puis premier produit Free Fire disponible.
    const item = items.find((i) => /latam/i.test(i.name || "")) || items[0];
    if (!item) {
      await trace(uid, pid, "unavailable", null, null);
      return json({ ok: false, error: "unsupported" });
    }
    const key = item.fields?.[0]?.key || "player_id";
    const result = await fz("POST", "/topups/validate-id", {
      category_id: item.category_id,
      fields: { [key]: pid },
    });

    const valid = result.valid === true;
    const region = result.region ? String(result.region) : null;
    const name = typeof result.player_name === "string"
      ? result.player_name.replace(/[\r\n]+/g, " ").trim().slice(0, 40)
      : null;
    const status = !valid ? "invalid" : (String(region || "").toUpperCase() === "NA" ? "valid" : "wrong_region");
    await trace(uid, pid, status, region, name);
    return json({ ok: true, valid, player_name: name, region });
  } catch (e) {
    console.error("freefire-validate:", e instanceof Error ? e.message : e);
    if (reachedProvider && uid && pid) await trace(uid, pid, "unavailable", null, null);
    return json({ ok: false, error: "unavailable" });
  }
});
