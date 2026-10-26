const SUPABASE_URL = "https://ljddntmrcarbwfiqvyor.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Qfm6jAesBFJPQ3KX0O8mA_6NPu5dVd";

// Services dont le champ est une adresse de portefeuille (0x…) : bouton Coller, vérification de l'adresse,
// avertissement de réseau et confirmation du réseau avant d'envoyer.
const ADDR_SERVICES={'Plasma One Auto':{net:'Plasma',others:'BSC, Tron, Ethereum…'},'karta':{net:'BNB Smart Chain (BEP20)',others:'Tron, Ethereum, Plasma…'},'pocket-option':{net:'BNB Smart Chain (BEP20)',others:'Tron, Ethereum, Plasma…'}};
function addrSvc(s){s=s||currentService;return (s&&ADDR_SERVICES[s.id])||null;}
let RATE=140,EFFECTIVE_RATE=157.5,WHATSAPP='',MIN_QTY=5,SERVICES=[],currentService=null,profile=null,isSignup=false,currentUserId=null,recoveryMode=false,adminRealtimeChannel=null,clientRealtimeChannel=null;
let originalProofFile = null;
// Lien de réinitialisation : on lit l'URL AVANT que Supabase ne la nettoie, pour ne pas rater l'événement PASSWORD_RECOVERY
const _urlAtLoad=(location.hash||'')+'&'+(location.search||'');
if(/type=recovery/.test(_urlAtLoad))recoveryMode=true;
// Installation en application (PWA)
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;try{installRefresh();}catch(_){}});
window.addEventListener('appinstalled',()=>{deferredInstall=null;try{installRefresh();}catch(_){}});
function installRefresh(){
  const card=document.getElementById('installCard');if(!card)return;
  const btn=document.getElementById('installBtn'),steps=document.getElementById('installSteps'),info=document.getElementById('installInfo');
  const standalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;
  if(standalone){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  btn.classList.add('hidden');steps.classList.add('hidden');
  if(deferredInstall){btn.classList.remove('hidden');}
  else{
    steps.innerHTML=ios
      ?'<li>Ouvre ce site dans <b>Safari</b>.</li><li>Touche le bouton <b>Partager</b> (carré avec une flèche).</li><li>Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>'
      :'<li>Ouvre le menu du navigateur (<b>⋮</b>).</li><li>Touche <b>Ajouter à l’écran d’accueil</b> (ou <b>Installer l’application</b>).</li>';
    steps.classList.remove('hidden');
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('installBtn');
  if(btn)btn.addEventListener('click',async()=>{
    if(!deferredInstall)return;
    deferredInstall.prompt();
    try{await deferredInstall.userChoice;}catch(_){}
    deferredInstall=null;installRefresh();
  });
  installRefresh();
});
const _recoveryLinkError=/error_code=|error=access_denied/.test(_urlAtLoad);

const PAY_INFO = {
  MonCash: { name:"Wollens Clerveaux", number:"46467495", logo:"moncash.png", qr:"moncash-qr.jpg" },
  NatCash: { name:"Suzanne Pascal",   number:"40034963", logo:"natcash.png", qr:null }
};
// THEME_KEY en v2 : remet tout le monde en mode nuit une fois (anciens choix « clair » auto-enregistrés ignorés)
const FORM_KEY_PREFIX='cashboost_meru_form_',THEME_KEY='cashboost_theme_v2';
const $=id=>document.getElementById(id),$$=s=>document.querySelectorAll(s);
const fmt=n=>Number(n).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2}).replace(/ /g,' ');
const fmtDateTime=d=>new Date(d).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' à');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const OPEN_HOUR = 8, OPEN_MIN = 0, CLOSE_HOUR = 21, CLOSE_MIN = 30;
function haitiNow(){
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Port-au-Prince' }));
  } catch(_) {
    return new Date(Date.now() - 4 * 3600 * 1000);
  }
}
function isOpenNow(){
  const n = haitiNow();
  const mins = n.getHours() * 60 + n.getMinutes();
  return mins >= (OPEN_HOUR * 60 + OPEN_MIN) && mins < (CLOSE_HOUR * 60 + CLOSE_MIN);
}
function fmtHour(h,m){return h+'h'+(m?String(m).padStart(2,'0'):'');}
function renderStatusLine(){
  const el=$('svcStatus'),tx=$('svcStatusText');if(!el||!tx)return;
  const auto=!!currentService&&currentService.id==='Plasma One Auto';
  const open=auto||isOpenNow(),rt=Number(RATE)>0?' · 1 USD = '+fmt(RATE)+' HTG':'';
  el.classList.toggle('is-open',open);
  if(auto){ tx.textContent='Service automatique'+rt; return; }
  tx.textContent=(open?'Ouvert':'Fermé')+' · '+fmtHour(OPEN_HOUR,OPEN_MIN)+'–'+fmtHour(CLOSE_HOUR,CLOSE_MIN)+rt;
}
function updateOpeningHoursNotice(){
  const el = $('openingHoursNotice');
  renderStatusLine();
  if(!el) return;
  // Plasma One Auto est automatique : jamais de bandeau d'horaires
  if(currentService && currentService.id==='Plasma One Auto'){ el.hidden = true; return; }
  const open = isOpenNow();
  el.hidden = open; // le bandeau complet n'apparaît que hors heures d'ouverture
  if(open){
    el.classList.add('is-open');
    $('ohTitle').textContent = 'Ouvert maintenant';
    $('ohBody').innerHTML = 'Livraison habituelle <strong>5 min à 2h</strong>. Horaires : <strong>8h00 – 21h30</strong> (heure d\'Haïti).';
  } else {
    el.classList.remove('is-open');
    $('ohTitle').textContent = 'Hors heures d\'ouverture';
    $('ohBody').innerHTML = 'Les recharges passées en dehors de <strong>8h00 – 21h30</strong> (heure d\'Haïti) peuvent subir un <strong>retard de plusieurs heures</strong>.';
  }
}

function timeAgo(dateStr){
  const d = new Date(dateStr);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if(sec < 60) return 'à l\'instant';
  if(sec < 3600) return 'il y a ' + Math.floor(sec/60) + ' min';
  if(sec < 86400) return 'il y a ' + Math.floor(sec/3600) + ' h';
  if(sec < 86400*7) return 'il y a ' + Math.floor(sec/86400) + ' j';
  return fmtDateTime(dateStr);
}

function wasAfterHours(dateStr){
  try {
    const d = new Date(dateStr);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Port-au-Prince',
      hour: 'numeric', minute: 'numeric', hour12: false
    }).formatToParts(d);
    const h = parseInt(parts.find(p=>p.type==='hour')?.value || '0', 10);
    const m = parseInt(parts.find(p=>p.type==='minute')?.value || '0', 10);
    const mins = h * 60 + m;
    const open = OPEN_HOUR * 60 + OPEN_MIN;
    const close = CLOSE_HOUR * 60 + CLOSE_MIN;
    return mins < open || mins >= close;
  } catch(_) {
    return !isOpenNow();
  }
}

function waTakenInChargeLink(o){
  const nm = (o.full_name && !String(o.full_name).includes('@'))
    ? ' ' + String(o.full_name).split(' ')[0] : '';
  const txt = 'Bonjour' + nm + ', ta commande ' + svcName(o.service) + ' de ' + o.amount_usd +
    ' USD est bien reçue et prise en charge ✅ On te livre dès que possible. Merci d\'avoir choisi Cash Boost !';
  // Seuls les chiffres du numéro sont gardés : impossible d'injecter du code dans le lien
  return 'https://wa.me/' + String(o.customer_phone || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(txt);
}

const AH_NOTIFIED_KEY = 'cashboost_ah_notified';
function getAhNotified(){
  try { return JSON.parse(localStorage.getItem(AH_NOTIFIED_KEY) || '[]'); } catch(_){ return []; }
}
function markAhNotified(id){
  const list = getAhNotified();
  if(!list.includes(id)){
    list.push(id);
    localStorage.setItem(AH_NOTIFIED_KEY, JSON.stringify(list.slice(-200)));
  }
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function getRateForAmount(amount){
  const s = currentService;
  if(!s) return EFFECTIVE_RATE;
  let tiers = [];
  try {
    tiers = typeof s.rate_tiers === 'string' ? JSON.parse(s.rate_tiers) : (s.rate_tiers || []);
    if(!Array.isArray(tiers)) tiers = [];
  } catch(_){ tiers = []; }
  if(!tiers.length) return EFFECTIVE_RATE;
  const sorted = [...tiers].sort((a,b)=>(b.min||0)-(a.min||0));
  for(const tier of sorted){
    if(amount >= Number(tier.min||0)) return Number(tier.rate) || EFFECTIVE_RATE;
  }
  return EFFECTIVE_RATE;
}

// Thème : mode nuit par défaut ; seul le choix explicite de l'utilisateur (bouton soleil/lune) est mémorisé
function initTheme(){const s=localStorage.getItem(THEME_KEY);applyTheme((s==='light'||s==='dark')?s:'dark');}
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);const i=document.querySelector('.theme-icon');if(i)i.textContent=t==='dark'?'🌙':'☀️';const m=$('metaThemeColor');if(m)m.setAttribute('content',t==='dark'?'#08080b':'#f7f7f9');}
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme')||'dark';const n=c==='dark'?'light':'dark';applyTheme(n);try{localStorage.setItem(THEME_KEY,n);}catch(_){}}

function showLanding(){ showAuth(); }
function showAuth(){
  $('authView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  // Déconnexion : le panneau admin et ses commandes ne doivent pas rester en mémoire dans la page
  try{
    const aa=$('adminArea'); if(aa) aa.classList.add('hidden');
    const al=$('adminList'); if(al) al.innerHTML='';
    if(typeof adminCache!=='undefined') adminCache=[];
  }catch(_){}
  document.body.classList.remove('landing-active');
  window.scrollTo({top:0});
}
function showApp(){
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  document.body.classList.remove('landing-active');
}

function initials(n){const p=String(n||'CB').trim().split(/\s+/).filter(Boolean);return (p.slice(0,2).map(x=>x[0]).join('')||'CB').toUpperCase();}
function svcName(id){const s=SERVICES.find(x=>x.id===(id||'meru'));return s?s.name:(id?String(id):'Meru');}
function svcNameParts(name){
  const parts=String(name||'').split(/\s+[—–-]\s+/),variant=parts.slice(1).join(' ');
  const kind=/autom/i.test(variant)?'auto':(/manuel/i.test(variant)?'manuel':'');
  return {base:kind?parts[0]:String(name||''),kind:kind,label:kind==='auto'?'Auto':(kind==='manuel'?'Manuel':'')};
}
function serviceReady(s){return !!s.active&&s.visible!==false&&Number(s.effective_rate)>0;}
function setMsg(id,t,c=''){const e=$(id);if(!e)return;e.className='msg '+c;e.textContent=t;}
function normPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.length===8)d='509'+d;return d;}
function phoneKey(){return currentUserId?'cashboost_phone_'+currentUserId:null;}
function identityKey(){return (currentUserId&&currentService)?('cashboost_id_'+currentUserId+'_'+currentService.id):null;}
function formStorageKey(){return (currentUserId&&currentService)?FORM_KEY_PREFIX+currentUserId+'_'+currentService.id:null;}

function saveMeruForm(){
  const k = formStorageKey();
  if(!k) return;
  localStorage.setItem(k, JSON.stringify({
    qty: $('qty').value,
    merutag: $('merutag').value,
    payMethod: $('payMethod').value
  }));
  const ik = identityKey();
  if(ik){
    localStorage.setItem(ik, JSON.stringify({
      merutag: $('merutag').value.trim(),
      payMethod: $('payMethod').value
    }));
  }
  const pk = phoneKey();
  if(pk && $('custPhone').value){
    try { localStorage.setItem(pk, $('custPhone').value); } catch(_){}
  }
}

function restorePhone(){
  const k = phoneKey();
  if(!k) return;
  try {
    const v = localStorage.getItem(k);
    if(v) $('custPhone').value = v;
  } catch(_){}
}

async function restoreMeruForm(){
  const k = formStorageKey();
  let restored = false;
  if(k){
    try {
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      if(s){
        if(s.qty !== undefined) $('qty').value = s.qty;
        if(s.merutag !== undefined) $('merutag').value = s.merutag;
        if(s.payMethod === 'MonCash' || s.payMethod === 'NatCash') $('payMethod').value = s.payMethod;
        restored = true;
      }
    } catch(_){}
  }
  if(!$('merutag').value.trim()){
    const ik = identityKey();
    if(ik){
      try {
        const id = JSON.parse(localStorage.getItem(ik) || 'null');
        if(id){
          if(id.merutag) $('merutag').value = id.merutag;
          if((id.payMethod === 'MonCash' || id.payMethod === 'NatCash') && !$('payMethod').value)
            $('payMethod').value = id.payMethod;
          restored = true;
        }
      } catch(_){}
    }
  }
  if(!$('merutag').value.trim() && currentUserId && currentService){
    try {
      const { data } = await sb.from('orders')
        .select('merutag,payment_method,customer_phone,amount_usd')
        .eq('user_id', currentUserId)
        .eq('service', currentService.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if(data){
        if(data.merutag) $('merutag').value = data.merutag;
        if(data.payment_method === 'MonCash' || data.payment_method === 'NatCash')
          $('payMethod').value = data.payment_method;
        if(data.customer_phone && !$('custPhone').value){
          let ph = String(data.customer_phone).replace(/\D/g,'');
          if(ph.startsWith('509') && ph.length === 11) ph = ph.slice(3);
          $('custPhone').value = ph;
        }
        restored = true;
        saveMeruForm();
      }
    } catch(_){}
  }
  if(!$('merutag').value.trim()){
    try {
      const { data: { user } } = await sb.auth.getUser();
      const email = user?.email || '';
      const label = (currentService?.field_label || '').toLowerCase();
      if(email && (label.includes('e-mail') || label.includes('email') || label.includes('mail'))){
        $('merutag').value = email;
        restored = true;
      }
    } catch(_){}
  }
  updatePayInfo();
  updateTotal();
  showSavedHint(restored && !!$('merutag').value.trim());
}

function showSavedHint(show){
  const el = $('savedHint');
  if(!el) return;
  el.textContent=addrSvc()?'✓ Adresse mémorisée — préremplie pour toi':'✓ Tag mémorisé — prérempli pour toi';
  el.classList.toggle('show', !!show);
  const help = $('merutagHelp');
  if(help) help.style.display = show ? 'none' : '';
}

function clearMeruForm(){
  const k = formStorageKey();
  const ik = identityKey();
  if(ik){
    localStorage.setItem(ik, JSON.stringify({
      merutag: $('merutag').value.trim(),
      payMethod: $('payMethod').value
    }));
  }
  const pk = phoneKey();
  if(pk && $('custPhone').value){
    try { localStorage.setItem(pk, $('custPhone').value); } catch(_){}
  }
  if(k){
    try {
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.qty = '';
      localStorage.setItem(k, JSON.stringify(s));
    } catch(_){
      localStorage.removeItem(k);
    }
  }
  $('qty').value = '';
  const _tc = document.getElementById('transcodeInput'); if(_tc) _tc.value = '';
  $('payProof').value = '';
  $('payProofCamera').value = '';
  $('proofPreview').classList.remove('show');
  $('proofPreviewImg').removeAttribute('src');
  $('proofUploadZone').classList.remove('filled');
  updatePayInfo();
  updateTotal();
}

function showPage(page,rem=true){
  if(!['home','service','orders','wallet','account'].includes(page))page='home';
  ['home','service','orders','wallet','account'].forEach(p=>$('page-'+p).classList.toggle('hidden',p!==page));
  $$('.bottom button').forEach(b=>b.classList.toggle('active',b.dataset.page===(page==='service'?'home':page)));
  if(rem)localStorage.setItem('cashboost_last_page',page);
  window.scrollTo({top:0,behavior:'smooth'});
  if(page==='orders')loadMyOrders();
  if(page==='wallet')loadWallet();
  if(page==='service')payWalletRefresh();
  if(page==='account'){loadPasskeys();loadAccountStats();}
}
