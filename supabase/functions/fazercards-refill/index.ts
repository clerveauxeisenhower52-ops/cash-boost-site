import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.13.2';

// ─── Configuration (surchargeable via Supabase Secrets) ───
// REFILL_MODE : DRY_RUN (défaut) = on calcule et on journalise, aucun envoi ; LIVE = envoi réel d'USDT
const MODE = (Deno.env.get('REFILL_MODE') || 'DRY_RUN').toUpperCase();
const MAX_REFILL_USD = Number(Deno.env.get('REFILL_MAX_USD') || '90'); // plafond par recharge
const MAX_DAILY_USD = Number(Deno.env.get('REFILL_DAILY_MAX_USD') || '200'); // plafond sur 24 h
const BSC_RPC = Deno.env.get('BSC_RPC_URL') || 'https://bsc-dataseed.binance.org';
const WALLET_KEY = Deno.env.get('FAZERCARDS_WALLET_KEY') || '';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const MIN_BNB_FOR_GAS = 0.0003;
const MARGIN_USD = 0.02; // petite marge d'arrondi sur le manque

const FZ_API = 'https://api.fzr.cards/api/v2';
const ACTIVE = ['creating', 'created', 'sending', 'sent'];
const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET') || '';
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || '';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const nowIso = () => new Date().toISOString();
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

// ─── Masquage des secrets dans tout texte journalisé, enregistré, envoyé par e-mail ou par ntfy ───
// L'URL du RPC privé (BSC_RPC_URL) contient souvent une clé : elle ne doit jamais sortir de la fonction.
function secretFragments(): string[] {
  const frags = new Set<string>();
  const add = (v: string | undefined | null) => { const s = (v || '').trim(); if (s.length >= 8) frags.add(s); };
  add(BSC_RPC);
  add(WALLET_KEY);
  add(WALLET_KEY.replace(/^0x/i, ''));
  add(Deno.env.get('FAZERCARDS_API_KEY'));
  add(INTERNAL_SECRET);
  try {
    const u = new URL(BSC_RPC);
    add(u.hostname);
    add(u.username);
    add(u.password);
    for (const seg of u.pathname.split('/')) add(seg);
    for (const [, v] of u.searchParams) add(v);
  } catch (_) { /* URL non analysable : l'URL complète est déjà masquée ci-dessus */ }
  return [...frags].sort((a, b) => b.length - a.length);
}
function redact(input: unknown): string {
  let s = String(input ?? '');
  for (const f of secretFragments()) s = s.split(f).join('[masqué]');
  // Filet de sécurité : toute autre URL est masquée aussi
  return s.replace(/https?:\/\/[^\s"'<>)\]]+/gi, '[url masquée]');
}
const errMsg = (e: unknown) => redact((e as any)?.message || e);

// ─── Authentification (même secret que les autres fonctions déclenchées par la base) ───
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}
async function isAuthorized(req: Request): Promise<boolean> {
  const provided = req.headers.get('x-webhook-secret') || '';
  if (!provided) return false;
  const { data, error } = await sb.from('internal_secrets').select('value').eq('name', 'webhook_secret').maybeSingle();
  if (error || !data?.value) return false;
  return safeEqual(provided, String(data.value));
}

// ─── Alertes (e-mail + notification téléphone), comme freefire-topup ───
async function emailAdmin(titre: string, texte: string): Promise<boolean> {
  if (!ADMIN_EMAIL || !INTERNAL_SECRET) return false;
  const service = titre.toUpperCase().startsWith('ALERTE') ? titre : 'ALERTE ' + titre;
  try {
    await sb.functions.invoke('notify-email', {
      body: { to: ADMIN_EMAIL, service, amount: texte },
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });
    return true;
  } catch (e) { console.error('Email admin:', errMsg(e)); return false; }
}
function ntfyTopic(): string {
  let topic = (Deno.env.get('NTFY_TOPIC') ?? '').trim();
  if (topic.startsWith('https://') || topic.startsWith('http://')) {
    try { topic = new URL(topic).pathname; } catch { return ''; }
  }
  return topic.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}
async function notifyPhone(title: string, message: string): Promise<boolean> {
  try {
    const topic = ntfyTopic();
    if (!topic) return false;
    const res = await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
      method: 'POST',
      headers: { 'Title': title, 'Priority': '5', 'Tags': 'warning' },
      body: message,
    });
    return res.ok;
  } catch (e) { console.error('notifyPhone:', errMsg(e)); return false; }
}
// Point de passage unique de toutes les alertes : le texte est masqué avant e-mail et ntfy
async function alertAdmin(titre: string, texte: string) {
  const t = redact(titre);
  const x = redact(texte);
  await Promise.all([emailAdmin(t, x), notifyPhone('Cash Boost - ' + t, x)]);
}

// Une seule alerte par cause et par heure (la fonction tourne chaque minute : pas de spam)
async function throttledAlert(key: string, titre: string, texte: string, minutes = 60) {
  const k = 'refill_alert_' + key;
  const { data } = await sb.from('freefire_state').select('updated_at').eq('key', k).maybeSingle();
  if (data?.updated_at && Date.now() - new Date(data.updated_at).getTime() < minutes * 60 * 1000) return;
  await sb.from('freefire_state').upsert({ key: k, value: '1', updated_at: nowIso() });
  await alertAdmin(titre, texte);
}

// ─── Client FazerCards ───
async function fz(method: string, path: string, body?: unknown): Promise<any> {
  const key = Deno.env.get('FAZERCARDS_API_KEY') || '';
  if (!key) throw new Error('FAZERCARDS_API_KEY manquante');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(FZ_API + path, {
      method,
      signal: ctrl.signal,
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null;
    try { data = await res.json(); } catch (_) { /* corps vide */ }
    if (!res.ok || data?.ok === false) {
      throw new Error(`FazerCards ${res.status} : ${String(data?.error || 'erreur')}`);
    }
    return data;
  } finally { clearTimeout(t); }
}

// ─── Wallet BSC ───
function bscWallet() {
  if (!WALLET_KEY) throw new Error('FAZERCARDS_WALLET_KEY manquant');
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const k = WALLET_KEY.trim();
  const key = /^(0x)?[0-9a-fA-F]{64}$/.test(k) ? (k.startsWith('0x') ? k : '0x' + k) : '';
  if (!key) throw new Error('FAZERCARDS_WALLET_KEY invalide : une clé privée fait 64 caractères hexadécimaux (pas la phrase de 12 mots)');
  return { provider, wallet: new ethers.Wallet(key, provider) };
}
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

async function setRow(id: string, patch: Record<string, unknown>) {
  const p: Record<string, unknown> = { ...patch };
  if (typeof p.error === 'string') p.error = redact(p.error); // jamais de secret dans la base
  await sb.from('fazercards_refills').update({ ...p, updated_at: nowIso() }).eq('id', id);
}
async function failRow(row: any, status: 'failed' | 'expired', msg: string, alertTitle?: string) {
  const clean = redact(msg); // on masque AVANT de couper, pour ne pas laisser un morceau d'URL
  await setRow(row.id, { status, error: clean.slice(0, 500) });
  if (alertTitle) await alertAdmin(alertTitle, clean);
}
async function alertOnce(row: any, titre: string, texte: string) {
  if (row.alerted_at) return;
  await setRow(row.id, { alerted_at: nowIso() });
  await alertAdmin(titre, texte);
}

// ─── Garde-fou anti double financement ───
// Une recharge en échec APRÈS l'envoi des USDT (tx_hash présent) bloque toute nouvelle recharge automatique
// tant qu'elle n'a pas été vérifiée à la main. La vérification se confirme en ajoutant la ligne
// « refill_review_ok_<id de la recharge> » dans la table freefire_state.
const reviewKey = (id: string) => 'refill_review_ok_' + id;
async function markReviewed(id: string) {
  await sb.from('freefire_state').upsert({ key: reviewKey(id), value: '1', updated_at: nowIso() });
}
async function findUnreviewedSentFailure(): Promise<{ id: string; tx_hash: string } | null> {
  const { data: rows, error } = await sb.from('fazercards_refills').select('id, tx_hash, updated_at')
    .eq('status', 'failed').not('tx_hash', 'is', null)
    .order('updated_at', { ascending: false }).limit(20);
  // Si la lecture échoue, on bloque par prudence plutôt que de risquer un double paiement
  if (error) return { id: 'lecture_impossible', tx_hash: '' };
  if (!rows || rows.length === 0) return null;
  const keys = rows.map((r: any) => reviewKey(r.id));
  const { data: reviewed, error: revErr } = await sb.from('freefire_state').select('key').in('key', keys);
  if (revErr) return { id: 'lecture_impossible', tx_hash: '' };
  const ok = new Set((reviewed || []).map((r: any) => r.key));
  const hit = rows.find((r: any) => !ok.has(reviewKey(r.id)));
  return hit ? { id: String(hit.id), tx_hash: String(hit.tx_hash) } : null;
}

// ─── Envoi des USDT (jamais deux fois : verrou created → sending) ───
async function sendUsdt(row: any) {
  if (MODE !== 'LIVE') return { ok: true, skipped: 'DRY_RUN' };
  // Verrou atomique
  const { data: claimed } = await sb.from('fazercards_refills')
    .update({ status: 'sending', updated_at: nowIso() })
    .eq('id', row.id).eq('status', 'created').select('*').maybeSingle();
  if (!claimed) return { ok: true, skipped: 'deja_pris' };

  try {
    const { provider, wallet } = bscWallet();
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, wallet);
    const decimals = Number(await usdt.decimals());
    const value = ethers.parseUnits(String(claimed.send_amount), decimals);

    const [usdtBal, bnbBal] = await Promise.all([usdt.balanceOf(wallet.address), provider.getBalance(wallet.address)]);
    if (usdtBal < value) {
      await failRow(claimed, 'failed',
        `USDT insuffisant sur BSC : ${ethers.formatUnits(usdtBal, decimals)} disponibles, ${claimed.send_amount} nécessaires. Aucun envoi effectué.`,
        'FAZERCARDS : RECHARGE IMPOSSIBLE (USDT BSC insuffisant)');
      return { ok: false, error: 'usdt_insuffisant' };
    }
    if (Number(ethers.formatEther(bnbBal)) < MIN_BNB_FOR_GAS) {
      await failRow(claimed, 'failed',
        `BNB insuffisant pour les frais (${ethers.formatEther(bnbBal)} BNB). Aucun envoi effectué.`,
        'FAZERCARDS : RECHARGE IMPOSSIBLE (BNB manquant)');
      return { ok: false, error: 'bnb_insuffisant' };
    }

    const tx = await usdt.transfer(claimed.address, value);
    // On note le hash tout de suite : une fois envoyé, on ne renvoie JAMAIS
    await setRow(claimed.id, { status: 'sent', tx_hash: tx.hash });
    return { ok: true, tx: tx.hash };
  } catch (e) {
    // Statut laissé en « sending » : on ne sait pas si l'envoi est parti, vérification manuelle (évite un double paiement)
    const msg = errMsg(e).slice(0, 300); // masqué avant d'être coupé
    await setRow(claimed.id, { error: 'Erreur pendant l\'envoi : ' + msg });
    await alertOnce(claimed, 'FAZERCARDS : ENVOI USDT A VERIFIER',
      `Erreur pendant l'envoi de ${claimed.send_amount} USDT vers ${claimed.address}. Vérifie sur BscScan avant tout nouvel essai. ${msg}`);
    return { ok: false, error: msg };
  }
}

// ─── Suivi d'une recharge active ───
async function advance(row: any): Promise<any> {
  const age = Date.now() - new Date(row.created_at).getTime();

  if (row.status === 'creating') {
    if (age > 3 * 60 * 1000) {
      await failRow(row, 'failed', 'Création de la recharge interrompue (aucun envoi effectué)', 'FAZERCARDS : recharge interrompue');
    }
    return { id: row.id, status: row.status };
  }

  if (row.status === 'created') {
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await failRow(row, 'expired', 'Demande de recharge expirée avant envoi');
      return { id: row.id, status: 'expired' };
    }
    const r = await sendUsdt(row);
    return { id: row.id, status: 'created', send: r };
  }

  if (row.status === 'sending') {
    if (age > 5 * 60 * 1000) {
      await alertOnce(row, 'FAZERCARDS : ENVOI USDT BLOQUE',
        `La recharge ${row.id.slice(0, 8)} est restée en « envoi » depuis plus de 5 min. Vérifie le wallet sur BscScan : ne relance rien avant d'avoir vérifié.`);
    }
    return { id: row.id, status: 'sending' };
  }

  if (row.status === 'sent') {
    try {
      const d = await fz('GET', '/payments/' + encodeURIComponent(row.payment_id));
      const st = String(d.payment?.status || '').toLowerCase();
      if (/complet/.test(st)) {
        await setRow(row.id, { status: 'completed', completed_at: nowIso() });
        return { id: row.id, status: 'completed' };
      }
      if (/cancel|expire|fail|reject/.test(st)) {
        await failRow(row, 'failed',
          `FazerCards indique « ${st} » pour la recharge ${row.payment_id}. USDT envoyés (tx ${row.tx_hash}) : contacte le support FazerCards.`,
          'FAZERCARDS : recharge non créditée');
        return { id: row.id, status: 'failed' };
      }
    } catch (e) {
      console.error('suivi paiement:', errMsg(e));
    }
    // Transaction annulée sur la blockchain ?
    try {
      const { provider } = bscWallet();
      const rc = await provider.getTransactionReceipt(row.tx_hash);
      if (rc && rc.status === 0) {
        await failRow(row, 'failed', `La transaction ${row.tx_hash} a échoué sur la blockchain (aucun USDT débité).`, 'FAZERCARDS : transaction échouée');
        // Aucun USDT n'a quitté le wallet : pas besoin de vérification manuelle pour reprendre les recharges
        await markReviewed(row.id);
        return { id: row.id, status: 'failed' };
      }
    } catch (_) { /* on réessaiera */ }
    if (age > 30 * 60 * 1000) {
      await alertOnce(row, 'FAZERCARDS : recharge longue',
        `Recharge ${row.payment_id} envoyée (tx ${row.tx_hash}) mais pas créditée depuis plus de 30 min.`);
    }
    return { id: row.id, status: 'sent' };
  }
  return { id: row.id, status: row.status };
}

async function getActive() {
  const { data } = await sb.from('fazercards_refills').select('*').in('status', ACTIVE)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data;
}

// ─── Création d'une recharge pour couvrir un manque ───
async function createRefill(shortfall: number, ordersCount: number) {
  // Plafond sur 24 h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await sb.from('fazercards_refills').select('amount_usd')
    .gt('created_at', since).in('status', ['sent', 'completed', ...ACTIVE]);
  const spent = (recent || []).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);

  const methods = await fz('GET', '/payments/methods');
  const m = (methods.items || []).find((x: any) => String(x.code).toLowerCase() === 'bep20');
  if (!m) {
    await throttledAlert('bep20_unavailable', 'FAZERCARDS : recharge BEP20 indisponible', 'La méthode bep20 n\'apparaît plus dans /payments/methods.');
    return { ok: false, error: 'bep20_indisponible' };
  }
  const min = Number(m.minAmountUsd) || 0;
  const max = Number(m.maxAmountUsd) || Infinity;
  const amount = ceil2(Math.max(shortfall + MARGIN_USD, min));

  if (amount > MAX_REFILL_USD || amount > max) {
    await throttledAlert('refill_over_cap', 'FAZERCARDS : recharge au-dessus du plafond',
      `Il manque ${shortfall.toFixed(2)} $ (recharge de ${amount} $), au-dessus du plafond de ${MAX_REFILL_USD} $. Recharge à la main.`);
    return { ok: false, error: 'au_dessus_du_plafond', amount };
  }
  if (spent + amount > MAX_DAILY_USD) {
    await throttledAlert('refill_daily_cap', 'FAZERCARDS : plafond journalier atteint',
      `${spent.toFixed(2)} $ déjà rechargés sur 24 h, plafond ${MAX_DAILY_USD} $. Recharge automatique suspendue.`);
    return { ok: false, error: 'plafond_journalier', spent };
  }

  if (MODE !== 'LIVE') {
    return { ok: true, dry_run: true, would_refill_usd: amount, shortfall: Number(shortfall.toFixed(4)), orders: ordersCount, min_recharge_usd: min };
  }

  // Vérification du wallet AVANT de créer la demande chez FazerCards (évite des demandes inutiles)
  try {
    const { provider, wallet } = bscWallet();
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, provider);
    const dec = Number(await usdt.decimals());
    const [usdtBal, bnbBal] = await Promise.all([usdt.balanceOf(wallet.address), provider.getBalance(wallet.address)]);
    if (Number(ethers.formatUnits(usdtBal, dec)) < amount + 0.5) {
      await throttledAlert('refill_wallet_usdt', 'FAZERCARDS : RECHARGE IMPOSSIBLE (USDT BSC insuffisant)',
        `Le wallet BSC a ${ethers.formatUnits(usdtBal, dec)} USDT, il en faut ${amount}. Alimente le wallet.`);
      return { ok: false, error: 'usdt_insuffisant' };
    }
    if (Number(ethers.formatEther(bnbBal)) < MIN_BNB_FOR_GAS) {
      await throttledAlert('refill_wallet_bnb', 'FAZERCARDS : RECHARGE IMPOSSIBLE (BNB manquant)',
        `Le wallet BSC a ${ethers.formatEther(bnbBal)} BNB, insuffisant pour les frais. Ajoute un peu de BNB.`);
      return { ok: false, error: 'bnb_insuffisant' };
    }
  } catch (e) {
    await throttledAlert('refill_wallet_error', 'FAZERCARDS : wallet BSC illisible', errMsg(e));
    return { ok: false, error: 'wallet_illisible' };
  }

  // Verrou : l'index unique refuse une deuxième recharge active
  const { data: row, error: insErr } = await sb.from('fazercards_refills')
    .insert({ amount_usd: amount, status: 'creating', orders_count: ordersCount })
    .select('*').single();
  if (insErr || !row) return { ok: true, skipped: 'recharge_deja_active' };

  let payment: any;
  try {
    const r = await fz('POST', '/payments/create', { method: 'bep20', amount });
    payment = r.payment;
  } catch (e) {
    await failRow(row, 'failed', 'Création de la recharge refusée : ' + errMsg(e), 'FAZERCARDS : création de recharge refusée');
    return { ok: false, error: 'creation_refusee' };
  }

  // Contrôles avant tout envoi
  const sendAmount = String(payment?.uniqueAmount ?? payment?.amount ?? '');
  const sendNum = Number(sendAmount);
  const network = String(payment?.network || '');
  const address = String(payment?.address || '');
  const problems: string[] = [];
  if (!/bep20|bsc/i.test(network)) problems.push(`réseau inattendu (${network})`);
  if (!ethers.isAddress(address)) problems.push('adresse invalide');
  if (!Number.isFinite(sendNum) || sendNum <= 0) problems.push('montant invalide');
  if (sendNum > amount + 0.5 || sendNum > MAX_REFILL_USD + 0.5) problems.push(`montant à envoyer anormal (${sendAmount})`);
  if (problems.length) {
    await failRow(row, 'failed', 'Recharge refusée avant envoi : ' + problems.join(', '), 'FAZERCARDS : recharge refusée par sécurité');
    return { ok: false, error: 'controle_securite', problems };
  }

  await setRow(row.id, {
    payment_id: String(payment.id),
    address,
    send_amount: sendAmount,
    status: 'created',
    expires_at: payment.expiresAt || null,
  });
  const created = { ...row, payment_id: String(payment.id), address, send_amount: sendAmount, status: 'created' };
  const sent = await sendUsdt(created);
  return { ok: true, refill: row.id, amount, send: sent };
}

// ─── Action « auto » : calcule le manque pour les commandes Free Fire ET PUBG en attente ───
async function auto() {
  const active = await getActive();
  if (active) return { active: await advance(active) };

  // Garde-fou : une recharge en échec après l'envoi des USDT doit être vérifiée à la main avant toute nouvelle recharge
  const stuck = await findUnreviewedSentFailure();
  if (stuck) {
    await throttledAlert('sent_refill_failed_manual_review', 'FAZERCARDS : VERIFICATION MANUELLE REQUISE',
      `Recharge ${stuck.id} en échec malgré une transaction ${stuck.tx_hash}. Vérification requise avant toute nouvelle recharge automatique. Une fois vérifiée, ajoute la ligne refill_review_ok_${stuck.id} dans la table freefire_state.`);
    return { blocked: true, reason: 'sent_payment_failed_requires_manual_review', refill_id: stuck.id };
  }

  // Pause après un échec : pas de nouvelle tentative automatique pendant 15 min
  const { data: lastFail } = await sb.from('fazercards_refills').select('id, status, updated_at')
    .in('status', ['failed', 'expired']).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (lastFail && Date.now() - new Date(lastFail.updated_at).getTime() < 15 * 60 * 1000) {
    return { cooldown: true, last_failed: lastFail.id };
  }

  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const pendingOrders = (service: string) => sb.from('orders').select('id, pack_id')
    .eq('service', service).eq('status', 'en attente').eq('payout_status', 'pending')
    .is('tx_hash', null).gt('created_at', since).limit(50);
  const [{ data: ffData }, { data: pubgData }] = await Promise.all([
    pendingOrders('Free Fire'),
    pendingOrders('PUBG Mobile (Auto)'),
  ]);
  const ffOrders = ffData || [];
  const pubgOrders = pubgData || [];
  if (ffOrders.length + pubgOrders.length === 0) return { idle: true };

  const [{ data: ffCosts }, { data: pubgCosts }] = await Promise.all([
    sb.from('freefire_pack_costs').select('pack_id, cost_usd'),
    sb.from('pubg_pack_costs').select('pack_id, cost_usd'),
  ]);
  const ffCostOf = new Map((ffCosts || []).map((c: any) => [c.pack_id, Number(c.cost_usd)]));
  const pubgCostOf = new Map((pubgCosts || []).map((c: any) => [c.pack_id, Number(c.cost_usd)]));
  let needed = 0;
  for (const o of ffOrders) needed += ffCostOf.get(o.pack_id) || 0;
  for (const o of pubgOrders) needed += pubgCostOf.get(o.pack_id) || 0;
  if (needed <= 0) return { idle: true };

  const balance = Number((await fz('GET', '/balance')).balance);
  if (!Number.isFinite(balance)) return { ok: false, error: 'solde_illisible' };
  const shortfall = needed - balance;
  if (shortfall <= 0.0001) return { enough: true, balance, needed };
  return {
    balance, needed,
    orders: { free_fire: ffOrders.length, pubg: pubgOrders.length },
    ...(await createRefill(shortfall, ffOrders.length + pubgOrders.length)),
  };
}

// ─── Action « status » : état du système (lecture seule) ───
async function status() {
  const out: any = { mode: MODE, max_refill_usd: MAX_REFILL_USD, max_daily_usd: MAX_DAILY_USD };
  try { out.fazercards_balance = (await fz('GET', '/balance')).balance; } catch (e) { out.fazercards_error = errMsg(e); }
  try {
    const { provider, wallet } = bscWallet();
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, provider);
    const dec = Number(await usdt.decimals());
    out.wallet = wallet.address;
    out.wallet_usdt_bsc = ethers.formatUnits(await usdt.balanceOf(wallet.address), dec);
    out.wallet_bnb = ethers.formatEther(await provider.getBalance(wallet.address));
  } catch (e) { out.wallet_error = errMsg(e); }
  const { data } = await sb.from('fazercards_refills')
    .select('id, status, amount_usd, send_amount, tx_hash, error, created_at')
    .order('created_at', { ascending: false }).limit(5);
  out.last_refills = data || [];
  const stuck = await findUnreviewedSentFailure();
  out.blocked_for_manual_review = stuck ? stuck.id : null;
  return out;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!(await isAuthorized(req))) return new Response('forbidden', { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body.action === 'auto') return json(await auto());
    if (body.action === 'status') return json(await status());
    return json({ error: 'action inconnue (auto | status)' }, 400);
  } catch (e) {
    console.error('fazercards-refill error:', errMsg(e));
    return json({ error: errMsg(e) }, 500);
  }
});
