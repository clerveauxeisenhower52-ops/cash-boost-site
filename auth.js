async function signInWithGoogle() {
  const btn = $('googleSignIn');
  if (!btn) return;
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Connexion…';
  const resetTimer = setTimeout(() => {
    if (btn && btn.disabled) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Continuer avec Google';
    }
  }, 30000);
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) {
      clearTimeout(resetTimer);
      console.error('Google signin error:', error);
      setMsg('authMsg', 'Impossible de se connecter avec Google.', 'err');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Continuer avec Google';
    }
  } catch (e) {
    clearTimeout(resetTimer);
    console.error(e);
    setMsg('authMsg', 'Erreur. Réessaie.', 'err');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Continuer avec Google';
  }
}

function resetGoogleButton() {
  const btn = $('googleSignIn');
  if (btn && btn.disabled) {
    btn.disabled = false;
    const span = btn.querySelector('span');
    if (span) span.textContent = 'Continuer avec Google';
  }
}
window.addEventListener('pageshow', resetGoogleButton);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resetGoogleButton(); });

const SPLASH_MIN_MS=3500; // durée minimale d'affichage, même si l'app est prête avant
let splashPct=0,splashTimer=null,splashDone=false,splashReady=false,splashStart=Date.now();
function setSplashPct(p){splashPct=p;const b=$('splashBar'),t=$('splashPct');if(b)b.style.width=p+'%';if(t)t.textContent=Math.round(p)+'%';}
function startSplashProgress(){
  setSplashPct(0);
  splashTimer=setInterval(()=>{
    const t=Math.min((Date.now()-splashStart)/SPLASH_MIN_MS,1);
    let p=(1-Math.pow(1-t,1.6))*100; // démarre vite, ralentit doucement
    if(!splashReady)p=Math.min(p,92); // reste à 92% tant que l'app charge
    if(p>splashPct)setSplashPct(p);
    if(splashReady&&t>=1&&!splashDone){
      splashDone=true;clearInterval(splashTimer);setSplashPct(100);
      setTimeout(()=>{const s=$('bootSplash');if(s)s.classList.add('gone');},500);
    }
  },40);
}
function hideSplash(){splashReady=true;}
startSplashProgress();
// FILET DE SÉCURITÉ : placé ici, hors de DOMContentLoaded, pour fonctionner même si app.js plante
// (bibliothèque Supabase non chargée, erreur JavaScript, réseau très lent…).
// Sans lui, l'écran de démarrage pouvait rester bloqué indéfiniment.
setTimeout(()=>{
  try{
    const a=$('authView'),p=$('appView');
    if(a&&p&&a.classList.contains('hidden')&&p.classList.contains('hidden'))showAuth();
    if(typeof window.supabase==='undefined')setMsg('authMsg','Problème de connexion. Vérifie ton internet puis recharge la page.','err');
  }catch(_){}
  hideSplash();
},9000);
// ---------- Mode hors ligne ----------
// Hors connexion, un jeton expiré ne peut pas être renouvelé : l'appli croyait l'utilisateur déconnecté
// et affichait la page de connexion. On garde maintenant l'utilisateur dans l'appli avec les dernières données connues.
let offlineMode=false;
const CACHE_SETTINGS_KEY='cashboost_cache_settings';
function saveSettingsCache(){ try{ localStorage.setItem(CACHE_SETTINGS_KEY,JSON.stringify({services:SERVICES,whatsapp:WHATSAPP})); }catch(_){} }
function loadSettingsCache(){
  try{ const c=JSON.parse(localStorage.getItem(CACHE_SETTINGS_KEY)||'null');
    if(c&&Array.isArray(c.services)&&c.services.length){ SERVICES=c.services; WHATSAPP=String(c.whatsapp||''); return true; } }catch(_){}
  return false;
}
function cachedAuthUser(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&/^sb-.+-auth-token$/.test(k)){
        const v=JSON.parse(localStorage.getItem(k)||'null');
        const u=v&&(v.user||(v.currentSession&&v.currentSession.user));
        if(u&&u.id) return u;
      }
    }
  }catch(_){}
  return null;
}
async function enterOffline(user){
  if(offlineMode) return;
  offlineMode=true;
  const name=user.user_metadata?.full_name||user.user_metadata?.name||user.email||'Client';
  profile={full_name:name,is_admin:false};
  currentUserId=user.id;
  loadSettingsCache(); applySettings();
  showApp();
  $('userName').textContent=name;$('accountName').textContent=name;$('accountEmail').textContent=user.email||'';$('avatar').textContent=initials(name);
  showPage('home',false);
}
// Au rechargement, Supabase peut annoncer « pas de session » avant d'avoir relu celle enregistrée sur le téléphone.
// Si une session est enregistrée, on garde l'écran de démarrage (5 s max) au lieu d'afficher la page de connexion.
let graceTimer=null,graceExpired=false;
async function handleAuth(e,s){
  let wait=false;
  try{wait=(await _handleAuth(e,s))==='wait';}
  catch(_){if($('authView').classList.contains('hidden')&&$('appView').classList.contains('hidden'))showAuth();}
  finally{if(!wait)hideSplash();}
}
async function _handleAuth(_e,session){
  if(session&&graceTimer){clearTimeout(graceTimer);graceTimer=null;}
  if(session)graceExpired=false;
  if(_e==='PASSWORD_RECOVERY')recoveryMode=true;
  if(session&&recoveryMode){$('authView').classList.remove('hidden');$('appView').classList.add('hidden');$('loginCard').classList.add('hidden');$('resetCard').classList.remove('hidden');return;}
  if(!session){
    if(!navigator.onLine){ const u=cachedAuthUser(); if(u){ await enterOffline(u); return; } }
    if(_e!=='SIGNED_OUT'&&!graceExpired&&cachedAuthUser()){
      if(!graceTimer){
        try{const {data:{session:s2}}=await sb.auth.getSession(); if(s2) return await _handleAuth('SIGNED_IN',s2);}catch(_){}
        if(!graceTimer)graceTimer=setTimeout(()=>{
          graceTimer=null;graceExpired=true;
          if($('authView').classList.contains('hidden')&&$('appView').classList.contains('hidden')){cleanupRealtime();showLanding();}
          hideSplash();
        },5000);
      }
      return 'wait';
    }
    cleanupRealtime();showLanding();return;
  }
  if(navigator.onLine) offlineMode=false;
  const {data}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  profile=data||{full_name:session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.email,is_admin:false};
  const wasIn=currentUserId===session.user.id&&!$('appView').classList.contains('hidden');
  currentUserId=session.user.id;
  const mp=session.user.user_metadata?.phone;
  if(mp){const pk=phoneKey();try{if(pk&&!localStorage.getItem(pk))localStorage.setItem(pk,mp);}catch(_){}}
  await loadSettings();restoreMeruForm();showApp();
  const name=profile.full_name||session.user.user_metadata?.name||session.user.email;
  $('userName').textContent=name;$('accountName').textContent=name;$('accountEmail').textContent=session.user.email||'';$('avatar').textContent=initials(name);
  if(!wasIn){
    const pending=localStorage.getItem('cashboost_pending_service');
    if(pending){localStorage.removeItem('cashboost_pending_service');const svc=SERVICES.find(x=>x.id===pending);if(svc&&serviceReady(svc))openService(pending);else showPage('home',false);}
    else{const saved=localStorage.getItem('cashboost_last_page');if(saved==='service'){const sid=localStorage.getItem('cashboost_last_service');const svc=SERVICES.find(x=>x.id===sid);if(svc&&serviceReady(svc))openService(sid);else showPage('home',false);}else{const valid=['home','orders','wallet','account'];showPage(valid.includes(saved)?saved:'home',false);}}
  }
  loadMyOrders();loadAdmin();setupAdminRealtime();setupClientRealtime(session.user.id);setupWalletRealtime(session.user.id);loadWallet();refreshPushUI();
}
