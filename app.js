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
const NATCASH_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAABuCAIAAADIZ10PAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAACJmUlEQVR4nOyd97b ... (inchangé, copie ton base64 depuis ton fichier actuel)";

function updatePayInfo() {
  const method = $('payMethod').value;
  const info = PAY_INFO[method];
  $('payName').textContent = info.name;
  $('payNumber').textContent = info.number;
  $('payMethod').style.backgroundImage = method === 'NatCash'
    ? `url("${NATCASH_LOGO}")`
    : `url("data:image/jpeg;base64,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")`;
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
      await sb.from('orders').update({status:sel.value}).eq('id',sel.dataset.id);
      loadAdmin();
    };
  });
}

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
    el.innerHTML = '<div class="card" style="padding:18px;text-align:center;color:var(--muted)">Aucun service disponible.</div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const ready = serviceReady(s);
    const logo = s.logo || SERVICE_LOGOS[s.id];
    const visual = logo
      ? `<div class="service-visual meru-logo-visual"><img class="meru-brand-logo${s.id === 'meru' ? '' : ' svc-logo-sq'}" src="${logo}" alt="Logo ${esc(s.name)}"></div>`
      : `<div class="service-visual svc-plain"><span class="svc-initials">${esc(initials(s.name))}</span></div>`;
    return `<div class="card service-card">
      ${visual}
      <div class="service-info">
        <div class="service-title"><h2>${esc(s.name)}</h2><span class="badge">${ready ? 'Disponible' : 'Bientôt'}</span></div>
        <p>${esc(s.description || '')}</p>
        ${s.delivery ? `<div class="delivery-note">${esc(s.delivery)}</div>` : ''}
        <button class="primary-btn" data-open="${esc(s.id)}" ${ready ? '' : 'disabled'}>${ready ? 'Recharger ' + esc(s.name) : 'Bientôt disponible'}</button>
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
      service:currentService.id, customer_phone: phone || null,
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
