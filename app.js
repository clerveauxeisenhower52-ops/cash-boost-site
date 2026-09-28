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
