// =====================================================================
// CASH BOOST v2 — app.js
// =====================================================================

const SUPABASE_URL = "https://ljddntmrcarbwfiqvyor.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Qfm6jAesBFJPQ3KX0O8mA_6NPu5dVd";

// --- État global ---
let RATE = 140;
let EFFECTIVE_RATE = 157.5;
let WHATSAPP = '';
let MIN_QTY = 5;
let SERVICES = [];
let currentService = null;
let profile = null;
let isSignup = false;
let currentUserId = null;
let recoveryMode = false;
let adminRealtimeChannel = null;
let clientRealtimeChannel = null;

const PAY_INFO = {
  MonCash: { name: "Wollens Clerveaux", number: "46467495" },
  NatCash: { name: "Suzanne Pascal",   number: "40034963" }
};

const FORM_KEY_PREFIX = 'cashboost_meru_form_';
const THEME_KEY = 'cashboost_theme';

// --- Raccourcis ---
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const fmt = n => Number(n).toLocaleString('fr-FR', {minimumFractionDigits: 0, maximumFractionDigits: 2}).replace(/\u202f/g, ' ');
const fmtDateTime = d => new Date(d).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' à');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// --- Supabase ---
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =====================================================================
// THEME
// =====================================================================
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  const meta = $('metaThemeColor');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0d' : '#f6f6f8');
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// =====================================================================
// VUE : landing / auth / app
// =====================================================================
function showLanding() {
  $('landingView').classList.remove('hidden');
  $('authView').classList.add('hidden');
  $('appView').classList.add('hidden');
  document.body.classList.add('landing-active');
  window.scrollTo({top:0, behavior:'auto'});
  initRevealObserver();
}

function showAuth() {
  $('landingView').classList.add('hidden');
  $('authView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  document.body.classList.remove('landing-active');
  window.scrollTo({top:0, behavior:'auto'});
}

function showApp() {
  $('landingView').classList.add('hidden');
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  document.body.classList.remove('landing-active');
}

// =====================================================================
// REVEAL ON SCROLL + COUNTERS
// =====================================================================
let revealObserver = null;
function initRevealObserver() {
  if (revealObserver) revealObserver.disconnect();
  const els = document.querySelectorAll('#landingView .reveal');
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('is-visible'), i * 60);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => revealObserver.observe(el));

  // Compteurs des stats
  const stats = document.querySelectorAll('.stat strong[data-count]');
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  stats.forEach(el => statObserver.observe(el));
}

function animateCounter(el) {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const decimals = parseInt(el.dataset.decimals || '0', 10);
  const duration = 1400;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = target * eased;
    el.textContent = value.toFixed(decimals).replace('.', ',') + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// =====================================================================
// LANDING : services prévisualisés
// =====================================================================
function renderLandingServices() {
  const el = $('landingServices');
  if (!el) return;
  const list = SERVICES.filter(s => s.visible !== false);
  if (!list.length) {
    el.innerHTML = '<div class="landing-svc"><div class="landing-svc-body"><h3>Services bientôt disponibles</h3></div></div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const ready = serviceReady(s);
    const logo = s.logo || SERVICE_LOGOS[s.id] || '';
    const visual = logo
      ? `<div class="landing-svc-visual"><img src="${logo}" alt="${esc(s.name)}"></div>`
      : `<div class="landing-svc-visual"><span class="svc-initials">${esc(initials(s.name))}</span></div>`;
    return `<div class="landing-svc reveal" data-open="${esc(s.id)}">
      ${visual}
      <div class="landing-svc-body">
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.description || 'Recharge ton compte avec MonCash ou NatCash.')}</p>
        <div class="landing-svc-meta">
          <span>1 USD = ${fmt(s.rate)} HTG</span>
          ${s.delivery ? `<span>${esc(s.delivery)}</span>` : ''}
          <span>${ready ? 'Disponible' : 'Bientôt'}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.landing-svc').forEach(card => {
    card.addEventListener('click', () => {
      showAuth();
      // Pré-sélection du service : sera appliqué après login
      localStorage.setItem('cashboost_pending_service', card.dataset.open);
    });
  });
  initRevealObserver();
}

// =====================================================================
// HELPERS
// =====================================================================
function initials(name) {
  const parts = String(name || 'CB').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(x => x[0]).join('') || 'CB').toUpperCase();
}

function svcName(id) {
  const s = SERVICES.find(x => x.id === (id || 'meru'));
  return s ? s.name : (id ? String(id) : 'Meru');
}

function serviceReady(s) { return !!s.active && s.visible !== false && Number(s.effective_rate) > 0; }

function setMsg(id, text, type='') {
  const el = $(id);
  if (!el) return;
  el.className = 'msg ' + type;
  el.textContent = text;
}

function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '509' + d;
  return d;
}

function phoneKey() { return currentUserId ? 'cashboost_phone_' + currentUserId : null; }

function restorePhone() {
  const k = phoneKey();
  if (!k) return;
  try { $('custPhone').value = localStorage.getItem(k) || ''; } catch (_) {}
}

function formStorageKey() {
  return (currentUserId && currentService) ? FORM_KEY_PREFIX + currentUserId + '_' + currentService.id : null;
}

function saveMeruForm() {
  const key = formStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({
    qty: $('qty').value,
    merutag: $('merutag').value,
    payMethod: $('payMethod').value
  }));
}

function restoreMeruForm() {
  const key = formStorageKey();
  if (!key) return;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved) return;
    if (saved.qty !== undefined) $('qty').value = saved.qty;
    if (saved.merutag !== undefined) $('merutag').value = saved.merutag;
    if (saved.payMethod === 'MonCash' || saved.payMethod === 'NatCash') {
      $('payMethod').value = saved.payMethod;
    }
    updatePayInfo();
    updateTotal();
  } catch (_) {}
}

function clearMeruForm() {
  const key = formStorageKey();
  if (key) localStorage.removeItem(key);
  $('qty').value = '';
  $('merutag').value = '';
  $('payMethod').value = 'MonCash';
  $('payProof').value = '';
  $('proofPreview').classList.remove('show');
  $('proofPreviewImg').removeAttribute('src');
  updatePayInfo();
  updateTotal();
}

// =====================================================================
// NAV APP
// =====================================================================
function showPage(page, remember = true) {
  if (!['home','service','orders','account'].includes(page)) page = 'home';
  ['home','service','orders','account'].forEach(p => $('page-' + p).classList.toggle('hidden', p !== page));
  $$('.bottom button').forEach(b => b.classList.toggle('active', b.dataset.page === (page === 'service' ? 'home' : page)));
  if (remember) localStorage.setItem('cashboost_last_page', page);
  window.scrollTo({top:0, behavior:'smooth'});
  if (page === 'orders') loadMyOrders();
}

// =====================================================================
// TOTAL / MONTANT
// =====================================================================
function updateTotal() {
  const raw = $('qty').value.trim();
  const q = Number(raw);
  const totalEl = $('total');
  if (!raw || !Number.isFinite(q) || q <= 0) {
    $('summaryUsd').textContent = '—';
    totalEl.textContent = '—';
    return;
  }
  $('summaryUsd').textContent = '$' + q;
  totalEl.textContent = fmt(q * EFFECTIVE_RATE) + ' HTG';
  totalEl.classList.remove('bump');
  void totalEl.offsetWidth;
  totalEl.classList.add('bump');
}

// =====================================================================
// PAIEMENT
// =====================================================================
const NATCASH_LOGO = "data:image/png;base64,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";

function updatePayInfo() {
  const method = $('payMethod').value;
  const info = PAY_INFO[method];
  $('payName').textContent = info.name;
  $('payNumber').textContent = info.number;
  $('payMethod').style.backgroundImage = method === 'NatCash'
    ? `url("${NATCASH_LOGO}")`
    : `url("moncash.png")`;
}
// =====================================================================
// ORDERS
// =====================================================================
async function loadMyOrders() {
  const el = $('ordersList');
  el.innerHTML = '<div class="skeleton-order"></div><div class="skeleton-order"></div>';
  const {data:{user}} = await sb.auth.getUser();
  if (!user) return;

  const {data,error} = await sb.from('orders')
    .select('*').eq('user_id',user.id).order('created_at',{ascending:false});

  if (error) { el.innerHTML = '<div class="order-meta">Impossible de charger les commandes.</div>'; return; }
  if (!data?.length) {
    el.innerHTML = '<div class="order-meta" style="padding:20px 0;text-align:center">Aucune commande pour le moment.</div>';
    return;
  }

  el.innerHTML = data.map(o => {
    const done = o.status === 'complétée';
    return `<div class="order">
      <div class="order-top"><strong>${esc(o.amount_usd)} USD</strong><strong>${fmt(o.total_htg)} HTG</strong></div>
      <div class="order-meta">${esc(svcName(o.service))} · ${fmtDateTime(o.created_at)} · ${esc(o.merutag)}</div>
      <div class="order-meta">${esc(o.payment_method || '')}
        · <span class="status ${done ? 'done':'pending'}">${esc(o.status || 'en attente')}</span>
      </div>
      ${o.payment_proof_path ? `<a class="proof-link" href="#" data-proof="${esc(o.payment_proof_path)}">🧾 Voir ma preuve de paiement</a>` : ''}
    </div>`;
  }).join('');
  attachProofLinks();
}

// =====================================================================
// PROOF LINKS
// =====================================================================
function attachProofLinks() {
  document.querySelectorAll('[data-proof]').forEach(link => {
    if (link.dataset.bound === '1') return;
    link.dataset.bound = '1';
    link.onclick = async (event) => {
      event.preventDefault();
      const path = link.dataset.proof;
      const oldText = link.textContent;
      link.textContent = 'Ouverture…';
      link.style.pointerEvents = 'none';

      const {data, error} = await sb.storage.from('payment-proofs').createSignedUrl(path, 600);

      if (error || !data?.signedUrl) {
        link.textContent = '❌ Impossible d\'ouvrir la preuve';
        link.style.pointerEvents = '';
        return;
      }

      const fromAdmin = link.closest('#adminList') !== null;
      $('proofBack').textContent = fromAdmin ? '← Retour à l\'administration' : '← Retour aux commandes';
      $('proofViewerImg').src = data.signedUrl;
      $('proofViewer').classList.add('show');
      $('proofViewer').setAttribute('aria-hidden','false');
      document.body.style.overflow = 'hidden';
      link.textContent = oldText;
      link.style.pointerEvents = '';
    };
  });
}

// =====================================================================
// ADMIN
// =====================================================================
function waNotifyLink(o) {
  const nm = (o.full_name && !String(o.full_name).includes('@')) ? ' ' + String(o.full_name).split(' ')[0] : '';
  const txt = 'Bonjour' + nm + ', ta recharge ' + svcName(o.service) + ' de ' + o.amount_usd + ' USD est complétée ✅ Merci d\'avoir choisi Cash Boost !';
  return 'https://wa.me/' + o.customer_phone + '?text=' + encodeURIComponent(txt);
}

async function loadAdmin() {
  if (!profile?.is_admin) return;
  $('adminArea').classList.remove('hidden');
  fillSettingsForm();
  const el = $('adminList');
  const {data,error} = await sb.from('orders').select('*').order('created_at',{ascending:false});
  if (error) { el.innerHTML = '<div class="order-meta">Erreur de chargement.</div>'; return; }
  if (!data?.length) { el.innerHTML = '<div class="order-meta">Aucune commande.</div>'; return; }

  el.innerHTML = data.map(o => `<div class="order">
    <div class="order-top"><strong>${esc(o.full_name || 'Client')}</strong><strong>${esc(o.amount_usd)} USD</strong></div>
    <div class="order-meta">${esc(svcName(o.service))} · ${esc(o.merutag)} · ${fmtDateTime(o.created_at)}</div>
    <div class="order-meta">${esc(o.payment_method || '')}${o.customer_phone ? ' · WhatsApp : +' + esc(o.customer_phone) : ''}</div>
    ${o.payment_proof_path ? `<a class="proof-link" href="#" data-proof="${esc(o.payment_proof_path)}">🧾 Voir la preuve de paiement</a>` : '<div class="order-meta">Aucune preuve jointe.</div>'}
    <select class="admin-status" data-id="${esc(o.id)}" style="margin-top:8px;height:42px">
      <option value="en attente" ${o.status==='en attente'?'selected':''}>en attente</option>
      <option value="complétée" ${o.status==='complétée'?'selected':''}>complétée</option>
    </select>
    ${(o.status === 'complétée' && o.customer_phone) ? `<a class="wa-notify" href="${waNotifyLink(o)}" target="_blank" rel="noopener">💬 Prévenir le client sur WhatsApp</a>` : ''}
  </div>`).join('');

  attachProofLinks();
  document.querySelectorAll('.admin-status').forEach(sel => {
  sel.onchange = async () => {
    const newStatus = sel.value;
    const orderId = sel.dataset.id;

    // 1. Récupérer les informations de la commande
    const { data: order, error: fetchError } = await sb
      .from('orders')
      .select('id, customer_email, service, amount_usd')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      console.error('Erreur récupération commande:', fetchError);
      alert('Impossible de récupérer la commande.');
      loadAdmin();
      return;
    }

    // 2. Mettre à jour le statut
    const { error: updateError } = await sb
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (updateError) {
      console.error('Erreur mise à jour statut:', updateError);
      alert('Impossible de modifier le statut.');
      loadAdmin();
      return;
    }

    // 3. Envoyer l'e-mail lorsque la commande devient complétée
    if (newStatus === 'complétée' && order.customer_email) {

      const { data: emailData, error: emailError } =
        await sb.functions.invoke('notify-email', {
          body: {
            to: order.customer_email,
            service: svcName(order.service),
            amount: order.amount_usd
          },
          headers: {
            'x-webhook-secret':
              'be59be71700c072cf506e5a6275bce57aa74e9bc43e75f4e'
          }
        });

      if (emailError) {
        console.error('Erreur envoi e-mail:', emailError);
        alert(
          'Commande complétée, mais l’e-mail n’a pas pu être envoyé.'
        );
      } else {
        console.log('Réponse notify-email:', emailData);
        alert('Commande complétée et e-mail envoyé ✅');
      }

    } else if (newStatus === 'complétée' && !order.customer_email) {

      alert(
        'Commande complétée, mais aucun e-mail client n’est enregistré.'
      );
    }

    // 4. Actualiser la liste des commandes
    loadAdmin();
  };
});

// =====================================================================
// SETTINGS + SERVICES
// =====================================================================
const SERVICE_LOGOS = { /* copie ton objet SERVICE_LOGOS depuis ton fichier actuel */ };

async function loadSettings() {
  try {
    const {data} = await sb.from('settings').select('key,value');
    if (data) {
      const m = Object.fromEntries(data.map(r => [r.key, r.value]));
      WHATSAPP = String(m.whatsapp || '').replace(/\D/g, '');
    }
  } catch (_) {}
  try {
    const {data, error} = await sb.from('services').select('*').order('sort', {ascending: true});
    if (!error && data) SERVICES = data;
  } catch (_) {}
  applySettings();
}

function renderServices() {
  const el = $('servicesList');
  const list = SERVICES.filter(s => s.visible !== false);
  if (!list.length) {
    el.innerHTML = '<div class="card" style="padding:18px;text-align:center;color:var(--muted);grid-column:1/-1">Aucun service disponible.</div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const ready = serviceReady(s);
    const logo = s.logo || SERVICE_LOGOS[s.id];
    const visual = logo
      ? `<div class="service-visual meru-logo-visual"><img class="meru-brand-logo${s.id === 'meru' ? '' : ' svc-logo-sq'}" src="${logo}" alt="Logo ${esc(s.name)}"></div>`
      : `<div class="service-visual svc-plain"><span class="svc-initials">${esc(initials(s.name))}</span></div>`;
    return `<div class="service-card">
      ${visual}
      <div class="service-info">
        <div class="service-title"><h2>${esc(s.name)}</h2></div>
        <button class="primary-btn" data-open="${esc(s.id)}" ${ready ? '' : 'disabled'}>${ready ? 'Commander' : 'Bientôt'}</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => openService(b.dataset.open); });
}

function applyCurrentService() {
  const s = currentService;
  if (!s) return;
  RATE = Number(s.rate);
  EFFECTIVE_RATE = Number(s.effective_rate);
  MIN_QTY = Number(s.min_qty) || 1;
  $('svcTitle').textContent = 'Recharger ' + s.name;
  $('minText').textContent = 'Minimum : ' + MIN_QTY + ' USD';
  document.querySelectorAll('.quick button').forEach(b => b.classList.toggle('hidden', Number(b.dataset.amount) < MIN_QTY));
  $('sumLabel').textContent = 'Montant ' + s.name;
  $('svcInfoTitle').textContent = 'Informations ' + s.name;
  $('svcFieldLabel').textContent = s.field_label || 'Identifiant du compte';
  $('merutag').placeholder = s.field_placeholder || '';
  $('rateDisplay').textContent = '1 USD = ' + fmt(RATE) + ' HTG';
  $('rateRow').textContent = fmt(RATE) + ' HTG / USD';
  updateTotal();
}

function openService(id) {
  const s = SERVICES.find(x => x.id === id);
  if (!s || !serviceReady(s)) return;
  currentService = s;
  $('qty').value = '';
  $('merutag').value = '';
  $('payMethod').value = 'MonCash';
  $('payProof').value = '';
  $('proofPreview').classList.remove('show');
  $('proofPreviewImg').removeAttribute('src');
  $('orderSuccess').classList.remove('show');
  setMsg('orderMsg', '');
  restoreMeruForm();
  restorePhone();
  updatePayInfo();
  applyCurrentService();
  localStorage.setItem('cashboost_last_service', id);
  showPage('service');
}

function applySettings() {
  renderServices();
  renderLandingServices();
  if (currentService) {
    const fresh = SERVICES.find(x => x.id === currentService.id);
    if (fresh && serviceReady(fresh)) { currentService = fresh; applyCurrentService(); }
  }
  document.querySelectorAll('a.wa-btn').forEach(a => {
    if (WHATSAPP) {
      a.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Bonjour Cash Boost, j\'ai besoin d\'aide.');
      a.classList.remove('hidden');
    } else {
      a.classList.add('hidden');
    }
  });
  const fw = $('footerWhatsapp');
  if (fw && WHATSAPP) fw.href = 'https://wa.me/' + WHATSAPP;
}

// Admin form (reste identique à ton code actuel)
function stateOf(s) { return s.visible === false ? 'hidden' : (s.active ? 'active' : 'soon'); }

function svcFieldsHtml(s) {
  const st = stateOf(s);
  const logo = s.logo || SERVICE_LOGOS[s.id] || '';
  return `
    ${logo ? `<img src="${logo}" alt="" style="width:56px;height:56px;border-radius:14px;object-fit:cover;margin-bottom:10px">` : ''}
    <div class="field"><label>Nom du service</label><input type="text" data-f="name" value="${esc(s.name || '')}"></div>
    <div class="field"><label>Description</label><input type="text" data-f="description" value="${esc(s.description || '')}"></div>
    <div class="field"><label>Ce que le client doit donner</label><input type="text" data-f="field_label" value="${esc(s.field_label || '')}"></div>
    <div class="field"><label>Exemple affiché</label><input type="text" data-f="field_placeholder" value="${esc(s.field_placeholder || '')}"></div>
    <div class="field"><label>Délai de livraison</label><input type="text" data-f="delivery" value="${esc(s.delivery || '')}"></div>
    <div class="field"><label>Taux affiché (HTG/USD)</label><input type="number" step="0.01" data-f="rate" value="${s.rate ?? ''}"></div>
    <div class="field"><label>Taux appliqué (frais inclus)</label><input type="number" step="0.01" data-f="effective_rate" value="${s.effective_rate ?? ''}"></div>
    <div class="field"><label>Minimum (USD)</label><input type="number" step="1" data-f="min_qty" value="${s.min_qty ?? 5}"></div>
    <div class="field"><label>État</label><select data-f="state">
      <option value="active" ${st === 'active' ? 'selected' : ''}>Actif</option>
      <option value="soon" ${st === 'soon' ? 'selected' : ''}>Bientôt</option>
      <option value="hidden" ${st === 'hidden' ? 'selected' : ''}>Masqué</option>
    </select></div>
    <div class="field"><label>Logo (image)</label><input type="file" accept="image/*" data-f="logo"></div>`;
}

function fillSettingsForm() {
  $('setWhatsapp').value = WHATSAPP;
  $('servicesAdmin').innerHTML = SERVICES.map(s => `<div class="svc-edit" data-id="${esc(s.id)}"><h4>${esc(s.name)}</h4>${svcFieldsHtml(s)}</div>`).join('');
}

function readSvcBox(box) {
  const g = f => { const el = box.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; };
  const st = g('state');
  const file = box.querySelector('[data-f="logo"]')?.files?.[0] || null;
  return {
    name: g('name').trim(), description: g('description').trim(), field_label: g('field_label').trim(),
    field_placeholder: g('field_placeholder').trim(), delivery: g('delivery').trim(),
    rate: parseFloat(g('rate')), effective_rate: parseFloat(g('effective_rate')), min_qty: parseFloat(g('min_qty')),
    active: st === 'active', visible: st !== 'hidden', file
  };
}

function checkSvc(r) {
  if (!r.name) return 'Entre le nom du service.';
  if (!r.field_label) return 'Indique ce que le client doit donner.';
  if (r.active && (!(r.rate > 0) || !(r.effective_rate > 0) || !(r.min_qty > 0))) return 'Taux et minimum requis pour activer.';
  return '';
}

function fileToLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) return reject(new Error('image'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const n = 256, c = document.createElement('canvas');
      c.width = n; c.height = n;
      const side = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, n, n);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

function slugify(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
}

// =====================================================================
// NOTIFICATIONS (Web Push) — identique à ton code
// =====================================================================
const VAPID_PUBLIC_KEY = "BD0baCsLNjwWOPr_wbRWuz3Zb7AOAJbsjTXXCGwjaBGWgUJpkeCCZD73_JdY1rju8Qu9NQDa5cdVBGwb1whoETM";

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone() { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; }
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

async function currentPushSub() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch (_) { return null; }
}

async function savePushSub(sub) {
  const j = sub.toJSON();
  const {error} = await sb.from('push_subscriptions').upsert(
    {user_id: currentUserId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth},
    {onConflict: 'endpoint'}
  );
  return !error;
}

async function refreshPushUI() {
  const btn = $('pushBtn'), info = $('pushInfo');
  if (!btn || !info) return;
  btn.classList.remove('hidden');
  if (!pushSupported() || (isIOS() && !isStandalone())) {
    info.textContent = (isIOS() && !isStandalone())
      ? 'Sur iPhone : touche Partager → « Sur l\'écran d\'accueil », ouvre Cash Boost depuis l\'icône, puis active.'
      : 'Notifications non disponibles sur ce navigateur.';
    btn.classList.add('hidden');
    return;
  }
  if (Notification.permission === 'denied') {
    info.textContent = 'Notifications bloquées. Autorise-les dans le navigateur.';
    btn.classList.add('hidden');
    return;
  }
  const sub = await currentPushSub();
  if (sub && Notification.permission === 'granted') {
    if (currentUserId) savePushSub(sub);
    info.textContent = 'Notifications activées ✓';
    btn.textContent = 'Désactiver les notifications';
    btn.dataset.state = 'on';
  } else {
    info.textContent = 'Reçois une alerte quand ta recharge est complétée.';
    btn.textContent = 'Activer les notifications';
    btn.dataset.state = 'off';
  }
}

// =====================================================================
// REALTIME
// =====================================================================
function setupAdminRealtime() {
  if (!profile?.is_admin) return;
  if (adminRealtimeChannel) { sb.removeChannel(adminRealtimeChannel); adminRealtimeChannel = null; }
  adminRealtimeChannel = sb.channel('cashboost-admin-orders')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'orders'}, (payload) => {
      if (payload.eventType === 'INSERT') notifyNewOrder(payload.new);
      loadAdmin();
    })
    .subscribe();
}

function setupClientRealtime(userId) {
  if (clientRealtimeChannel) { sb.removeChannel(clientRealtimeChannel); clientRealtimeChannel = null; }
  clientRealtimeChannel = sb
    .channel('cashboost-my-orders-' + userId)
    .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'orders', filter: 'user_id=eq.' + userId}, (payload) => {
      if (payload.new?.status === 'complétée') {
        beep();
        showToast('✅ Ta recharge de ' + payload.new.amount_usd + ' USD est complétée !');
      }
      loadMyOrders();
    })
    .subscribe();
}

function cleanupRealtime() {
  if (adminRealtimeChannel) { sb.removeChannel(adminRealtimeChannel); adminRealtimeChannel = null; }
  if (clientRealtimeChannel) { sb.removeChannel(clientRealtimeChannel); clientRealtimeChannel = null; }
}

// =====================================================================
// SON + TOAST
// =====================================================================
function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.17);
    });
    setTimeout(() => ctx.close(), 700);
  } catch (_) {}
  try { navigator.vibrate && navigator.vibrate([150, 80, 150]); } catch (_) {}
}

let toastTimer = null;
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

function notifyNewOrder(o) {
  beep();
  showToast('🆕 ' + svcName(o?.service) + ' : ' + (o?.amount_usd ?? '') + ' USD — ' + (o?.full_name || 'Client'));
}

// =====================================================================
// AUTH
// =====================================================================
async function handleAuth(_event, session) {
  if (_event === 'PASSWORD_RECOVERY') recoveryMode = true;
  if (session && recoveryMode) {
    $('landingView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('loginCard').classList.add('hidden');
    $('resetCard').classList.remove('hidden');
    return;
  }
  if (!session) {
    cleanupRealtime();
    showLanding();
    return;
  }

  const {data} = await sb.from('profiles').select('*').eq('id',session.user.id).single();
  profile = data || {full_name:session.user.user_metadata?.full_name || session.user.email, is_admin:false};
  const wasIn = currentUserId === session.user.id && !$('appView').classList.contains('hidden');
  currentUserId = session.user.id;
  await loadSettings();
  restoreMeruForm();

  showApp();

  const name = profile.full_name || session.user.email;
  $('userName').textContent = name;
  $('accountName').textContent = name;
  $('accountEmail').textContent = session.user.email || '';
  $('avatar').textContent = initials(name);

  if (!wasIn) {
    // Service en attente depuis la landing ?
    const pending = localStorage.getItem('cashboost_pending_service');
    if (pending) {
      localStorage.removeItem('cashboost_pending_service');
      const svc = SERVICES.find(x => x.id === pending);
      if (svc && serviceReady(svc)) openService(pending);
      else showPage('home', false);
    } else {
      const savedPage = localStorage.getItem('cashboost_last_page');
      if (savedPage === 'service') {
        const sid = localStorage.getItem('cashboost_last_service');
        const svc = SERVICES.find(x => x.id === sid);
        if (svc && serviceReady(svc)) openService(sid);
        else showPage('home', false);
      } else {
        const validPages = ['home', 'orders', 'account'];
        showPage(validPages.includes(savedPage) ? savedPage : 'home', false);
      }
    }
  }
  loadMyOrders();
  loadAdmin();
  setupAdminRealtime();
  setupClientRealtime(session.user.id);
  refreshPushUI();
}

// =====================================================================
// BOOTSTRAP
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Thème
  initTheme();
  $('themeToggle').addEventListener('click', toggleTheme);

  // Landing → auth
  $('landingLogin')?.addEventListener('click', showAuth);
  $('landingStart')?.addEventListener('click', showAuth);
  $('heroCta')?.addEventListener('click', showAuth);
  $('finalCta')?.addEventListener('click', showAuth);

  // Auth → retour
  $('authBack')?.addEventListener('click', showLanding);

  // Nav bottom
  $$('.bottom button').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  $('backHome')?.addEventListener('click', () => showPage('home'));

  // Amount
  $('qty').addEventListener('input', () => { updateTotal(); saveMeruForm(); });
  $('dec').addEventListener('click', () => {
    const current = Number($('qty').value);
    const next = Number.isFinite(current) && current > 0 ? Math.max(0, current - 1) : 0;
    $('qty').value = next || '';
    updateTotal(); saveMeruForm();
  });
  $('inc').addEventListener('click', () => {
    const current = Number($('qty').value);
    $('qty').value = (Number.isFinite(current) && current > 0 ? current + 1 : MIN_QTY);
    updateTotal(); saveMeruForm();
  });
  $$('.quick button').forEach(b => {
    b.addEventListener('click', () => {
      $('qty').value = b.dataset.amount;
      updateTotal(); saveMeruForm();
    });
  });

  // Payment
  $('merutag').addEventListener('input', saveMeruForm);
  $('payMethod').addEventListener('change', () => { updatePayInfo(); saveMeruForm(); });
  $('copyPay').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('payNumber').textContent);
      $('copyPay').textContent = 'Copié ✓';
      setTimeout(() => $('copyPay').textContent = 'Copier', 1400);
    } catch (_) {
      setMsg('orderMsg','Copie automatique indisponible.','err');
    }
  });

  // Phone
  $('custPhone').addEventListener('input', () => {
    const k = phoneKey();
    if (k) { try { localStorage.setItem(k, $('custPhone').value); } catch (_) {} }
  });

  // Proof preview
  $('payProof').addEventListener('change', () => {
    const file = $('payProof').files?.[0];
    if (!file) {
      $('proofPreview').classList.remove('show');
      $('proofPreviewImg').removeAttribute('src');
      return;
    }
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      $('proofPreview').classList.remove('show');
      $('proofPreviewImg').removeAttribute('src');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      $('proofPreviewImg').src = reader.result;
      $('proofPreview').classList.add('show');
    };
    reader.readAsDataURL(file);
  });

  // Proof viewer back
  $('proofBack').addEventListener('click', () => {
    $('proofViewer').classList.remove('show');
    $('proofViewer').setAttribute('aria-hidden','true');
    $('proofViewerImg').removeAttribute('src');
    document.body.style.overflow = '';
  });

  // Auth toggle
  $('authToggle').addEventListener('click', () => {
    isSignup = !isSignup;
    $('nameField').classList.toggle('hidden', !isSignup);
    $('forgotRow').classList.toggle('hidden', isSignup);
    $('authTitle').textContent = isSignup ? 'Créer un compte' : 'Se connecter';
    $('authSubmit').textContent = isSignup ? 'Créer mon compte' : 'Se connecter';
    $('authToggleLabel').textContent = isSignup ? 'Déjà un compte ?' : 'Pas encore de compte ?';
    $('authToggle').textContent = isSignup ? 'Se connecter' : 'Créer un compte';
    setMsg('authMsg','');
  });

  // Auth submit
  $('authSubmit').addEventListener('click', async () => {
    const email = $('authEmail').value.trim();
    const password = $('authPass').value;
    if (!email || !password) { setMsg('authMsg','Remplis tous les champs.','err'); return; }
    if (password.length < 6) { setMsg('authMsg','Minimum 6 caractères.','err'); return; }

    const btn = $('authSubmit');
    btn.disabled = true;
    btn.textContent = isSignup ? 'Création…' : 'Connexion…';

    if (isSignup) {
      const full_name = $('authName').value.trim();
      if (!full_name) {
        btn.disabled = false; btn.textContent = 'Créer mon compte';
        setMsg('authMsg','Indique ton nom.','err'); return;
      }
      const { error } = await sb.auth.signUp({email,password,options:{data:{full_name}}});
      btn.disabled = false; btn.textContent = 'Créer mon compte';
      if (error) { setMsg('authMsg',error.message,'err'); return; }
      setMsg('authMsg','Compte créé. Vérifie ta boîte mail si confirmation demandée.','ok');
    } else {
      const { error } = await sb.auth.signInWithPassword({email,password});
      btn.disabled = false; btn.textContent = 'Se connecter';
      if (error) { setMsg('authMsg',error.message,'err'); return; }
    }
  });

  // Forgot password
  $('forgotBtn').addEventListener('click', async () => {
    const email = $('authEmail').value.trim();
    if (!email) { setMsg('authMsg','Entre ton e-mail.', 'err'); return; }
    const btn = $('forgotBtn');
    btn.disabled = true;
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
    if (error) {
      const limited = /rate|seconds|too many/i.test(error.message || '');
      setMsg('authMsg', limited ? 'Trop de demandes. Réessaie plus tard.' : 'Impossible d\'envoyer. Écris-nous sur WhatsApp.', 'err');
      btn.disabled = false;
      return;
    }
    setMsg('authMsg', 'Un lien de réinitialisation vient d\'être envoyé (vérifie les spams).', 'ok');
    setTimeout(() => { btn.disabled = false; }, 60000);
  });

  // Reset password
  $('resetSubmit').addEventListener('click', async () => {
    const a = $('newPass').value, b = $('newPass2').value;
    if (a.length < 6) { setMsg('resetMsg', 'Minimum 6 caractères.', 'err'); return; }
    if (a !== b) { setMsg('resetMsg', 'Les mots de passe ne correspondent pas.', 'err'); return; }
    const btn = $('resetSubmit');
    btn.disabled = true;
    const {error} = await sb.auth.updateUser({password: a});
    btn.disabled = false;
    if (error) { setMsg('resetMsg', error.message, 'err'); return; }
    recoveryMode = false;
    history.replaceState(null, '', location.pathname);
    $('newPass').value = ''; $('newPass2').value = '';
    $('resetCard').classList.add('hidden');
    $('loginCard').classList.remove('hidden');
    const {data: {session}} = await sb.auth.getSession();
    await handleAuth('SIGNED_IN', session);
  });

  // Logout
  $('logout').addEventListener('click', async () => {
    try {
      const sub = await currentPushSub();
      if (sub) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    } catch (_) {}
    localStorage.removeItem('cashboost_last_page');
    localStorage.removeItem('cashboost_last_service');
    currentUserId = null;
    await sb.auth.signOut();
  });

  // Push
  $('pushBtn').addEventListener('click', async () => {
    const btn = $('pushBtn');
    setMsg('pushMsg', '');
    btn.disabled = true;
    try {
      if (btn.dataset.state === 'on') {
        const sub = await currentPushSub();
        if (sub) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
        }
      } else {
        const reg = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setMsg('pushMsg', 'Autorisation refusée.', 'err'); btn.disabled = false; refreshPushUI(); return; }
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY)});
        const ok = await savePushSub(sub);
        if (!ok) { setMsg('pushMsg', 'Impossible d\'enregistrer.', 'err'); btn.disabled = false; return; }
        setMsg('pushMsg', 'Notifications activées ✓', 'ok');
      }
    } catch (e) {
      console.error(e);
      setMsg('pushMsg', 'Erreur. Réessaie.', 'err');
    }
    btn.disabled = false;
    refreshPushUI();
  });

  // Order submit
  $('submitOrder').addEventListener('click', async () => {
    setMsg('orderMsg','');
    $('orderSuccess').classList.remove('show');
    if (!currentService) { setMsg('orderMsg','Choisis un service.','err'); return; }

    const qty = Number($('qty').value);
    const merutag = $('merutag').value.trim();
    const proofFile = $('payProof').files?.[0];

    if (!Number.isFinite(qty) || qty < MIN_QTY) { setMsg('orderMsg','Minimum : ' + MIN_QTY + ' USD.','err'); return; }
    if (!merutag) { setMsg('orderMsg','Renseigne « ' + currentService.field_label + ' ».','err'); return; }
    const phone = normPhone($('custPhone').value);
    if (phone.length < 11) { setMsg('orderMsg','Numéro WhatsApp invalide. Ex : 37 12 34 56','err'); return; }
    if (!proofFile) { setMsg('orderMsg','Ajoute la preuve de transaction.','err'); return; }
    if (!proofFile.type.startsWith('image/')) { setMsg('orderMsg','La preuve doit être une image.','err'); return; }
    if (proofFile.size > 5 * 1024 * 1024) { setMsg('orderMsg','Image trop grande (5 Mo max).','err'); return; }

    const {data:{user}} = await sb.auth.getUser();
    if (!user) { setMsg('orderMsg','Session expirée. Reconnecte-toi.','err'); return; }

    const btn = $('submitOrder');
    btn.disabled = true; btn.textContent = 'Envoi de la preuve…';

    const ext = (proofFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const {error:uploadError} = await sb.storage.from('payment-proofs').upload(path, proofFile, {contentType: proofFile.type, upsert:false});
    if (uploadError) {
      btn.disabled = false; btn.textContent = 'Confirmer ma commande';
      setMsg('orderMsg','Impossible d\'envoyer la preuve.','err');
      return;
    }

    btn.textContent = 'Envoi de la commande…';
    const total = qty * EFFECTIVE_RATE;
    const {error} = await sb.from('orders').insert({
      user_id:user.id, amount_usd:qty, total_htg:total, merutag,
      service:currentService.id, customer_phone: phone || null, customer_email: user.email || null,
      full_name:profile?.full_name || user.email,
      payment_method:$('payMethod').value,
      payment_ref:null,
      payment_proof_path:path
    });

    btn.disabled = false; btn.textContent = 'Confirmer ma commande';
    if (error) {
      await sb.storage.from('payment-proofs').remove([path]);
      setMsg('orderMsg','Impossible d\'enregistrer la commande.','err');
      return;
    }
    clearMeruForm();
    $('orderSuccess').classList.add('show');
    loadMyOrders();
  });

  // Admin save
  $('saveSettings').addEventListener('click', async () => {
    const wa = $('setWhatsapp').value.replace(/\D/g, '');
    const rows = [...document.querySelectorAll('#servicesAdmin .svc-edit')].map(box => ({id: box.dataset.id, ...readSvcBox(box)}));
    for (const r of rows) {
      const err = checkSvc(r);
      if (err) { setMsg('settingsMsg', err, 'err'); return; }
      if (!Number.isFinite(r.rate)) r.rate = 0;
      if (!Number.isFinite(r.effective_rate)) r.effective_rate = 0;
      if (!Number.isFinite(r.min_qty)) r.min_qty = 5;
    }
    const btn = $('saveSettings');
    btn.disabled = true;
    let failed = false;
    for (const r of rows) {
      const upd = {name: r.name, description: r.description, field_label: r.field_label, field_placeholder: r.field_placeholder,
        delivery: r.delivery, rate: r.rate, effective_rate: r.effective_rate, min_qty: r.min_qty, active: r.active, visible: r.visible};
      if (r.file) {
        try { upd.logo = await fileToLogo(r.file); }
        catch (_) { setMsg('settingsMsg', 'Logo invalide pour « ' + r.name + ' ».', 'err'); btn.disabled = false; return; }
      }
      const {error} = await sb.from('services').update(upd).eq('id', r.id);
      if (error) { failed = true; }
    }
    const {error: e2} = await sb.from('settings').upsert({key: 'whatsapp', value: wa});
    if (e2) failed = true;
    btn.disabled = false;
    if (failed) { setMsg('settingsMsg', 'Erreur d\'enregistrement.', 'err'); return; }
    await loadSettings();
    fillSettingsForm();
    setMsg('settingsMsg', 'Enregistré ✓', 'ok');
  });

  $('addSvcBtn').addEventListener('click', () => {
    const box = $('newSvcBox');
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    box.innerHTML = '<h4>Nouveau service</h4>' + svcFieldsHtml({min_qty: 5, active: true}) +
      '<button id="createSvc" type="button" class="primary-btn" style="margin-top:6px">Créer</button><div id="newSvcMsg" class="msg"></div>';
    box.classList.remove('hidden');
    $('createSvc').addEventListener('click', createService);
    box.scrollIntoView({behavior: 'smooth', block: 'start'});
  });

  async function createService() {
    const box = $('newSvcBox');
    const r = readSvcBox(box);
    const err = checkSvc(r);
    if (err) { setMsg('newSvcMsg', err, 'err'); return; }
    if (!Number.isFinite(r.rate)) r.rate = 0;
    if (!Number.isFinite(r.effective_rate)) r.effective_rate = 0;
    if (!Number.isFinite(r.min_qty)) r.min_qty = 5;
    const btn = $('createSvc');
    btn.disabled = true;
    let logo = null;
    if (r.file) {
      try { logo = await fileToLogo(r.file); }
      catch (_) { setMsg('newSvcMsg', 'Logo invalide.', 'err'); btn.disabled = false; return; }
    }
    let id = slugify(r.name), n = 2;
    while (SERVICES.some(x => x.id === id)) id = slugify(r.name) + '-' + n++;
    const sort = SERVICES.reduce((m, x) => Math.max(m, Number(x.sort) || 0), 0) + 1;
    const {error} = await sb.from('services').insert({
      id, name: r.name, description: r.description || ('Recharge ton compte ' + r.name + ' avec MonCash ou NatCash.'),
      delivery: r.delivery, field_label: r.field_label, field_placeholder: r.field_placeholder,
      rate: r.rate, effective_rate: r.effective_rate, min_qty: r.min_qty, active: r.active, visible: r.visible, sort, logo
    });
    btn.disabled = false;
    if (error) { setMsg('newSvcMsg', 'Erreur de création.', 'err'); return; }
    await loadSettings();
    fillSettingsForm();
    box.classList.add('hidden');
    setMsg('settingsMsg', 'Service « ' + r.name + ' » ajouté ✓', 'ok');
  }

  // Init
  updatePayInfo();
  updateTotal();
  loadSettings();
  showLanding();

  // Auth listener
  sb.auth.onAuthStateChange(handleAuth);
});
