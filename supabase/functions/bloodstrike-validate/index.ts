import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vérification d'un ID joueur Blood Strike avant paiement (lecture seule, aucune commande, aucun débit).
// Passe par l'API revendeur shop2topup (POST /player/validate). La livraison reste faite par FazerCards.
// Réservée aux clients connectés, avec une limite de demandes par client.
// Le résultat est enregistré dans bloodstrike_player_checks : la fonction SQL blood_strike_purchase l'exige avant tout débit (valable 30 min).
// Secret à définir dans Supabase : SHOP2TOPUP_API_KEY (format keyId.secret).
// Variables optionnelles : SHOP2TOPUP_API_BASE, SHOP2TOPUP_BS_SUB_CATEGORY_ID.
const API = (Deno.env.get("SHOP2TOPUP_API_BASE") || "https://shop2topup.com/api/endpoints/v1").replace(/\/+$/, "");
const SUB_CATEGORY_ID = Number(Deno.env.get("SHOP2TOPUP_BS_SUB_CATEGORY_ID") || "1638");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Les résultats métier (valid, invalid, not_recognized, unavailable...) sont renvoyés en HTTP 200 : le client lit simplement « status ».
const reply = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Enregistre le résultat de la vérification (service_role uniquement). Attendu avant la réponse : l'achat peut suivre immédiatement.
// Les traces de plus de 2 jours du même client sont purgées au passage.
// Pas de trace pour « rate_limited » ni quand le fournisseur n'a pas été interrogé : l'achat reste alors refusé.
async function trace(admin: any, userId: string, playerId: string, status: string) {
  try {
    await admin.from("bloodstrike_player_checks").insert({ user_id: userId, player_id: playerId, status });
    await admin.from("bloodstrike_player_checks").delete().eq("user_id", userId).lt("created_at", new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString());
  } catch (e) {
    console.error("bloodstrike-validate_trace", e instanceof Error ? e.message : "unknown");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let admin: any = null;
  let uid = "";
  let pid = "";
  let reachedProvider = false;
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const key = Deno.env.get("SHOP2TOPUP_API_KEY") || "";
    if (!url || !anon || !service || !key) throw new Error("missing_config");
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return reply({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    pid = String(body?.player_id ?? "").replace(/\s/g, "");
    if (!/^[0-9]{5,20}$/.test(pid)) return reply({ status: "invalid_format" });

    admin = createClient(url, service, { auth: { persistSession: false } });
    uid = user.id;
    const { data: allowed, error: rlError } = await admin.rpc("bloodstrike_validate_allow_request", { p_user_id: user.id });
    if (rlError) return reply({ status: "unavailable" });
    if (allowed !== true) return reply({ status: "rate_limited" });

    reachedProvider = true;
    const res = await fetch(API + "/player/validate", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ sub_category_id: SUB_CATEGORY_ID, player_id: pid }),
    });
    let data: any = null;
    try { data = await res.json(); } catch (_) { /* corps vide */ }

    if (res.ok && data?.success === true) {
      // La doc publique renvoie « player », le panneau de test renvoie « data » : on accepte les deux.
      const p = data?.player ?? data?.data;
      const name = typeof p?.player_name === "string" ? p.player_name.replace(/[\r\n]+/g, " ").trim().slice(0, 40) : "";
      if (!name) { await trace(admin, uid, pid, "unavailable"); return reply({ status: "unavailable" }); }
      await trace(admin, uid, pid, "valid");
      return reply({ status: "valid", player_name: name });
    }

    // Codes d'erreur stables de l'API : on se branche sur error.code, jamais sur le message.
    const code = String(data?.error?.code || "");
    if (code === "PLAYER_NOT_FOUND") { await trace(admin, uid, pid, "invalid"); return reply({ status: "invalid" }); }
    // PLAYER_CHECK_UNAVAILABLE (non documenté par shop2topup) : observé avec un faux ID. Peut signifier ID inexistant ou jeu injoignable :
    // on ne bloque pas, le site signale « ID non reconnu » et propose la double saisie.
    if (code === "PLAYER_CHECK_UNAVAILABLE") {
      console.error("bloodstrike-validate_provider", res.status, code);
      await trace(admin, uid, pid, "not_recognized");
      return reply({ status: "not_recognized" });
    }
    // Tout le reste (quota atteint, clé ou IP refusée, panne, produit désactivé, validation temporairement indisponible) :
    // on ne bloque pas le client, le site bascule sur la double saisie.
    console.error("bloodstrike-validate_provider", res.status, code || "no_code");
    await trace(admin, uid, pid, "unavailable");
    return reply({ status: "unavailable" });
  } catch (e) {
    console.error("bloodstrike-validate_error", e instanceof Error ? e.message : "unknown");
    if (reachedProvider && admin && uid && pid) await trace(admin, uid, pid, "unavailable");
    return reply({ status: "unavailable" });
  }
});
