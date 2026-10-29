import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tous les paiements passent par le solde du portefeuille (wallet_purchase côté base).
// L'ancien flux « capture d'écran + lecture IA » et le flux Transcode SMS ont été retirés :
// aucune commande ne les utilisait plus depuis le 18/10/2026.

const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
"Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
Deno.env.get("SUPABASE_URL")!,
Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const MODE = Deno.env.get("AUTO_VALIDATE_MODE") || "DRY_RUN";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_SECRET") || "";
// Si vide, l'alerte email est simplement ignorée
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "";

const MAX_COMMANDES_1H = 3;
const FACTEUR_MONTANT_INHABITUEL = 3;
const FRAUDES_POUR_SUSPECT = 2;
const TOLERANCE_HTG = 1;
const TOLERANCE_TAUX_PCT = Number(Deno.env.get("TOLERANCE_TAUX_PCT") || "1");
const LOCK_SECONDS = 120;
const FRAUD_TYPES = ["receipt_reused", "image_reused"];

// ───────────────────────── Helpers ─────────────────────────

function json(body: unknown, status = 200) {
return new Response(JSON.stringify(body), {
status, headers: { ...corsHeaders, "content-type": "application/json" },
});
}

function safeEqual(a: string, b: string): boolean {
const ea = new TextEncoder().encode(a);
const eb = new TextEncoder().encode(b);
if (ea.length !== eb.length) return false;
let diff = 0;
for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
return diff === 0;
}

async function majOrder(orderId: string, patch: Record<string, unknown>): Promise<boolean> {
const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
if (error) console.error(`[verify-receipt] update order ${orderId}:`, error.message);
return !error;
}

async function alerterAdmin(service: string, amount: string) {
if (!ADMIN_EMAIL) {
console.warn("[verify-receipt] ADMIN_EMAIL non défini : alerte non envoyée");
return;
}
try {
await supabase.functions.invoke("notify-email", {
body: { to: ADMIN_EMAIL, service, amount },
headers: { "x-internal-secret": INTERNAL_SECRET },
});
} catch (e) { console.error("Échec alerte email:", e); }
}

// Envoi des USDT. Tout passe par send-usdt-bnb (liste de services autorisés + plafond).
// En cas d'échec la commande repasse « en attente ».
async function envoyerUsdt(
orderId: string,
order: any,
): Promise<{ ok: boolean; envoi: string; userMessage: string }> {
const { data: sendResult, error: sendErr } = await supabase.functions.invoke("send-usdt-bnb", {
body: { orderId },
headers: { "x-internal-secret": INTERNAL_SECRET },
});

if (sendErr || (!sendResult?.tx && !sendResult?.skipped && !sendResult?.ok)) {
let msg = sendErr?.message || sendResult?.error || "inconnu";
if (sendErr && (sendErr as any).context?.json) {
try {
const b = await (sendErr as any).context.json();
msg = b?.error || msg;
} catch (_) {}
}
const updateOk = await majOrder(orderId, {
status: "en attente",
auto_validated: false,
auto_validation_reason: `Envoi USDT non confirmé (${msg}) · rapprochement manuel requis avant tout nouvel envoi ou remboursement`,
});
if (!updateOk) {
  console.error(`[verify-receipt] impossible de marquer la commande ${orderId} pour rapprochement manuel`);
}
// Ne pas déclencher le remboursement automatique sur une erreur ambiguë :
// le transfert peut avoir été diffusé même si l'appel a retourné une erreur.
if (/insuffisant|solde/i.test(msg)) {
await alerterAdmin(
"ALERTE WALLET",
`Wallet USDT vide ! Commande ${String(orderId).slice(0, 8)} · ${order.amount_usd} USD en attente`,
);
}
return {
ok: false,
envoi: `echec:${msg}`,
userMessage: "Le paiement est enregistré. L'état du transfert doit être vérifié manuellement avant tout remboursement ou nouvel envoi.",
};
}
if (sendResult?.pending && sendResult?.tx) {
return { ok: true, envoi: `broadcast:${sendResult.tx}`, userMessage: "Paiement vérifié. Tes USDT sont en route." };
}
if (sendResult?.tx) {
return { ok: true, envoi: `envoye:${sendResult.tx}`, userMessage: "Paiement vérifié. Tes USDT ont été envoyés." };
}
// "skipped" ne prouve pas qu'un transfert a été confirmé. Garder la commande
// en attente de rapprochement manuel et ne déclencher aucun remboursement automatique.
if (sendResult?.skipped) {
  const reason = String(sendResult?.reason || "état non confirmé");
  await majOrder(orderId, {
    status: "en attente",
    auto_validated: false,
    auto_validation_reason: `Envoi USDT non confirmé (${reason}) · vérification manuelle requise, ne pas relancer avant vérification blockchain`,
  });
  return {
    ok: false,
    envoi: `a_verifier:${reason}`,
    userMessage: "Commande en vérification manuelle. Aucun nouvel envoi ni remboursement automatique ne doit être lancé avant vérification de la transaction.",
  };
}
return {
  ok: false,
  envoi: "etat_inattendu",
  userMessage: "État de l'envoi non confirmé. Vérification manuelle requise.",
};
}

async function calculerTauxOk(order: any): Promise<boolean> {
const { data: svc } = await supabase
.from("services").select("effective_rate, rate_tiers")
.eq("id", order.service).maybeSingle();
if (!svc) return false;

let tiers: any[] = [];
try {
tiers = typeof svc.rate_tiers === "string" ? JSON.parse(svc.rate_tiers) : (svc.rate_tiers || []);
if (!Array.isArray(tiers)) tiers = [];
} catch (_) { tiers = []; }

const montantUsd = Number(order.amount_usd);
let taux = Number(svc.effective_rate);
const tries = [...tiers].sort((a, b) => (Number(b.min) || 0) - (Number(a.min) || 0));
for (const t of tries) {
if (montantUsd >= Number(t.min || 0)) { taux = Number(t.rate) || taux; break; }
}

const attendu = montantUsd * taux;
const ecart = Math.abs(Number(order.total_htg) - attendu);
const marge = Math.max(TOLERANCE_HTG, (attendu * TOLERANCE_TAUX_PCT) / 100);
return Number.isFinite(attendu) && attendu > 0 && ecart <= marge;
}

// ───────────────────────── Flow paiement par solde ─────────────────────────

interface Ctx {
orderId: string;
order: any;
callerIsAdmin: boolean;
estAdmin: boolean;
tauxOk: boolean;
montantInhabituel: boolean;
}

// Le débit du portefeuille est fait côté base par wallet_purchase : ici on vérifie
// qu'il existe vraiment (le navigateur ne peut pas créer de commande « Solde » seul).
async function traiterSolde(ctx: Ctx): Promise<Response> {
const { orderId, order, callerIsAdmin, estAdmin, tauxOk, montantInhabituel } = ctx;
console.log(`[verify-receipt] Paiement par solde · commande ${orderId}`);

const { data: tx } = await supabase
.from("wallet_transactions")
.select("user_id, amount_htg")
.eq("order_id", orderId)
.eq("type", "purchase")
.maybeSingle();

const debite = tx ? -Number(tx.amount_htg) : NaN;
if (!tx || tx.user_id !== order.user_id || !Number.isFinite(debite)
|| Math.abs(debite - Number(order.total_htg)) > TOLERANCE_HTG) {
await majOrder(orderId, {
status: "rejetée",
auto_validated: false,
auto_validation_reason: "Paiement par solde introuvable ou montant différent.",
auto_mode: MODE,
});
return json({
ok: true, auto_validated: false, auto_rejected: true,
user_message: "Paiement par solde introuvable. Contacte le support.",
});
}

const raisonsManuelles: string[] = [];
if (!tauxOk && !callerIsAdmin) raisonsManuelles.push("Total HTG incohérent avec le taux du service");
if (montantInhabituel && !estAdmin && !callerIsAdmin) raisonsManuelles.push("Montant inhabituel pour ce client");
if (raisonsManuelles.length > 0) {
await majOrder(orderId, {
status: "en attente",
auto_validated: false,
auto_validation_reason: `${raisonsManuelles.join(" · ")} · validation manuelle`,
ocr_data: { source: "wallet" },
auto_mode: MODE,
});
return json({
ok: true, auto_validated: false, auto_rejected: false,
user_message: "Ta commande est en cours de vérification. Tu recevras tes USDT rapidement.",
});
}

if (MODE !== "LIVE") {
await majOrder(orderId, {
auto_validated: false,
auto_validation_reason: "[DRY_RUN] Aurait été validé (paiement par solde)",
ocr_data: { source: "wallet" },
auto_mode: MODE,
});
return json({
ok: true, auto_validated: false, envoi: "simule_dry_run",
user_message: "Paiement par solde vérifié (mode test).",
});
}

const okUpdate = await majOrder(orderId, {
status: "complétée",
auto_validated: true,
auto_validation_reason: "Validé automatiquement : payé avec le solde du portefeuille.",
ocr_data: { source: "wallet" },
fraud_type: null,
auto_mode: MODE,
});
if (!okUpdate) return json({ error: "Mise à jour de la commande impossible" }, 500);

const envoi = await envoyerUsdt(orderId, order);
return json({
ok: true,
auto_validated: envoi.ok,
envoi: envoi.envoi,
user_message: envoi.ok ? "Payé avec ton solde. Traitement en cours." : envoi.userMessage,
});
}

// ───────────────────────── Handler principal ─────────────────────────

serve(async (req) => {
if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

let lockedOrderId: string | null = null;

try {
let body: any;
try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
const orderId = body?.orderId;
if (!orderId || typeof orderId !== "string" || orderId.length > 64) {
return json({ error: "orderId manquant" }, 400);
}

// ── Authentification AVANT toute lecture de commande
const isInternal = !!INTERNAL_SECRET
&& safeEqual(req.headers.get("x-internal-secret") || "", INTERNAL_SECRET);
let callerIsAdmin = isInternal;
let callerUserId: string | null = null;
if (!isInternal) {
const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
if (!token) return json({ error: "Non authentifié" }, 401);
const { data: u, error: uErr } = await supabase.auth.getUser(token);
if (uErr || !u?.user) return json({ error: "Non authentifié" }, 401);
callerUserId = u.user.id;
const { data: prof } = await supabase
.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
callerIsAdmin = !!prof?.is_admin;
}

let { data: order, error } = await supabase
.from("orders").select("*").eq("id", orderId).single();
if (error || !order) return json({ error: "Commande introuvable" }, 404);
if (!isInternal && callerUserId !== order.user_id && !callerIsAdmin) {
return json({ error: "Accès refusé" }, 403);
}

// ── Verrou
const lockLimit = new Date(Date.now() - LOCK_SECONDS * 1000).toISOString();
const { data: claimed, error: claimErr } = await supabase
.from("orders")
.update({ verifying_at: new Date().toISOString() })
.eq("id", orderId)
.or(`verifying_at.is.null,verifying_at.lt.${lockLimit}`)
.select("id");
if (claimErr) return json({ error: "Verrou impossible" }, 500);
if (!claimed || claimed.length === 0) {
return json({ error: "Vérification déjà en cours pour cette commande" }, 409);
}
lockedOrderId = orderId;

const fresh = await supabase.from("orders").select("*").eq("id", orderId).single();
if (fresh.error || !fresh.data) return json({ error: "Commande introuvable" }, 404);
order = fresh.data;

if (order.service !== "plasma-one" && order.service !== "Plasma One Auto" && order.service !== "pocket-option") {
return json({ error: "Service non automatisé" }, 400);
}

// Déjà validée automatiquement : jamais retraitée (évite le double envoi).
// Le panneau admin passe la commande en « complétée » AVANT d'appeler cette fonction,
// donc un admin doit pouvoir la traiter ; send-usdt-bnb reste le garde-fou contre le double envoi.
if (order.auto_validated === true) {
return json({ ok: true, already_processed: true, auto_validated: true });
}
if (order.status === "complétée" && !callerIsAdmin) {
return json({ ok: true, already_processed: true, auto_validated: false });
}

// Seul le paiement par solde est accepté (plus de capture d'écran ni de Transcode)
if (order.payment_method !== "Solde") {
return json({ error: "Paiement par solde uniquement" }, 400);
}

const totalHtg = Number(order.total_htg);
if (!Number.isFinite(totalHtg) || totalHtg <= 0 || !(Number(order.amount_usd) > 0)) {
return json({ error: "Montants de commande invalides" }, 400);
}

// ── Profil + historique
const { data: profCheck } = await supabase
.from("profiles").select("is_admin").eq("id", order.user_id).maybeSingle();
const estAdmin = !!profCheck?.is_admin;

const { data: clientOrders } = await supabase
.from("orders").select("id, amount_usd, status, created_at, fraud_type")
.eq("user_id", order.user_id);

// On exclut la commande courante de l'historique
const autres = (clientOrders || []).filter((o: any) => o.id !== orderId);
const commandesReussies = autres.filter((o: any) => o.status === "complétée");
const nbReussies = commandesReussies.length;

const fraudes = autres.filter((o: any) => FRAUD_TYPES.includes(String(o.fraud_type || "")));
if (!estAdmin && fraudes.length >= FRAUDES_POUR_SUSPECT) {
await majOrder(orderId, {
status: "rejetée",
auto_validation_reason: `Rejeté : client suspect · ${fraudes.length} fraudes`,
auto_mode: MODE,
});
return json({
ok: true, mode: MODE, auto_validated: false, auto_rejected: true,
user_message: "Ton compte est en cours de vérification. Contacte le support WhatsApp.",
reason: "Client suspect",
});
}

const uneHeureAvant = Date.now() - 3600000;
const autresDerniereHeure = autres.filter(
(o: any) => new Date(o.created_at).getTime() > uneHeureAvant
).length;
if (!estAdmin && autresDerniereHeure >= MAX_COMMANDES_1H) {
await majOrder(orderId, {
status: "rejetée",
auto_validation_reason: `Rejeté : plus de ${MAX_COMMANDES_1H} commandes en 1h`,
auto_mode: MODE,
});
return json({
ok: true, mode: MODE, auto_validated: false, auto_rejected: true,
user_message: "Trop de commandes en peu de temps. Réessaie dans 1 heure.",
reason: "Limite de fréquence",
});
}

let montantInhabituel = false;
if (nbReussies >= 1) {
const montantMax = Math.max(...commandesReussies.map((o: any) => Number(o.amount_usd)));
if (Number(order.amount_usd) > montantMax * FACTEUR_MONTANT_INHABITUEL) montantInhabituel = true;
}

const tauxOk = await calculerTauxOk(order);

return await traiterSolde({
orderId, order, callerIsAdmin, estAdmin, tauxOk, montantInhabituel,
});
} catch (e) {
console.error("[verify-receipt] erreur:", e);
return json({ error: "Erreur interne" }, 500);
} finally {
if (lockedOrderId) {
await supabase.from("orders").update({ verifying_at: null }).eq("id", lockedOrderId);
}
}
});
