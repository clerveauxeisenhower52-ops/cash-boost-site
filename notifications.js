const VAPID_PUBLIC_KEY="BFv0swhl_uHY_D5NRm-e7LykDaLjx7XF5ekx-GNtC0-6xflF_cdQDYGmU8xT0vfwiVQSOPpAWayql87Bpt_l4mM";
function b64ToUint8(b64){const pad='='.repeat((4-b64.length%4)%4);const raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function isStandalone(){return window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;}
function pushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
async function currentPushSub(){try{const reg=await navigator.serviceWorker.getRegistration();return reg?await reg.pushManager.getSubscription():null;}catch(_){return null;}}

async function savePushSub(sub){
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: currentUserId,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    is_admin: !!profile?.is_admin
  }, { onConflict: 'endpoint' });
  return !error;
}

async function refreshPushUI(){
  const btn=$('pushBtn'),info=$('pushInfo');
  if(!btn||!info)return;
  btn.classList.remove('hidden');
  if(!pushSupported()||(isIOS()&&!isStandalone())){
    info.textContent=(isIOS()&&!isStandalone())
      ?'Sur iPhone : touche Partager → « Sur l\'écran d\'accueil », ouvre Cash Boost, puis active.'
      :'Notifications non disponibles sur ce navigateur.';
    btn.classList.add('hidden');
    return;
  }
  if(Notification.permission==='denied'){
    info.textContent='Notifications bloquées. Autorise-les dans le navigateur.';
    btn.classList.add('hidden');
    return;
  }
  const sub=await currentPushSub();
  if(sub&&Notification.permission==='granted'){
    if(currentUserId){
      await savePushSub(sub);
    }
    info.textContent='Notifications activées ✓';
    btn.textContent='Désactiver les notifications';
    btn.dataset.state='on';
  }else{
    info.textContent='Reçois une alerte quand ta recharge est complétée.';
    btn.textContent='Activer les notifications';
    btn.dataset.state='off';
  }
}

function setupAdminRealtime(){if(!profile?.is_admin)return;if(adminRealtimeChannel){sb.removeChannel(adminRealtimeChannel);adminRealtimeChannel=null;}adminRealtimeChannel=sb.channel('cashboost-admin-orders').on('postgres_changes',{event:'*',schema:'public',table:'orders'},(p)=>{if(p.eventType==='INSERT')notifyNewOrder(p.new);loadAdmin();}).subscribe();}
function setupClientRealtime(uid){if(clientRealtimeChannel){sb.removeChannel(clientRealtimeChannel);clientRealtimeChannel=null;}clientRealtimeChannel=sb.channel('cashboost-my-orders-'+uid).on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'user_id=eq.'+uid},(p)=>{if(p.new?.status==='complétée'&&notifyOnce('done:'+p.new.id)){beep();showToast('✅ Ta recharge de '+p.new.amount_usd+' USD est complétée !');}loadMyOrders();}).subscribe();}
function cleanupRealtime(){if(adminRealtimeChannel){sb.removeChannel(adminRealtimeChannel);adminRealtimeChannel=null;}if(clientRealtimeChannel){sb.removeChannel(clientRealtimeChannel);clientRealtimeChannel=null;}if(walletRealtimeChannel){sb.removeChannel(walletRealtimeChannel);walletRealtimeChannel=null;}}

let audioCtx=null;
function getAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audioCtx)audioCtx=new C();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx;}catch(_){return null;}}
['pointerdown','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,getAudio,{passive:true}));
const PREF_SOUND='cashboost_pref_sound';
function codeLenFor(m){return m==='NatCash'?14:12;}
function prefOn(k){try{return localStorage.getItem(k)!=='0';}catch(_){return true;}}
function setPref(k,v){try{localStorage.setItem(k,v?'1':'0');}catch(_){}}
function fxChain(ctx,wet){
  const out=ctx.createGain();
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=6500;
  out.connect(lp);lp.connect(ctx.destination);
  if(wet>0){
    const dl=ctx.createDelay(0.5);dl.delayTime.value=0.11;
    const fb=ctx.createGain();fb.gain.value=0.3;
    const wg=ctx.createGain();wg.gain.value=wet;
    out.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(wg);wg.connect(lp);
  }
  return out;
}
function bell(ctx,out,{f,t=0,d=0.6,v=0.12,p=[[1,1],[2,0.28],[3,0.1]]}){
  const a=ctx.currentTime+t;
  p.forEach(([m,w])=>{
    const o=ctx.createOscillator(),g=ctx.createGain(),dd=d/m;
    o.type='sine';o.frequency.value=f*m;o.connect(g);g.connect(out);
    g.gain.setValueAtTime(0.0001,a);
    g.gain.exponentialRampToValueAtTime(v*w,a+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,a+dd);
    o.start(a);o.stop(a+dd+0.05);
  });
}
// Son unique : « Double tap »
function playSound(){
  const ctx=getAudio();if(!ctx)return;
  try{
    const o=fxChain(ctx,0.1);
    bell(ctx,o,{f:1047,d:0.2,v:0.1});
    bell(ctx,o,{f:1047,t:0.13,d:0.25,v:0.1});
  }catch(_){}
}
let _lastBeep=0;
function beep(force){
  const n=Date.now();
  if(!force && n-_lastBeep<3000) return;   // jamais deux alertes à moins de 3 s d'intervalle
  _lastBeep=n;
  if(prefOn(PREF_SOUND)) playSound();
}
const _notified=new Set();
function notifyOnce(key){ if(_notified.has(key)) return false; _notified.add(key); return true; }
let toastTimer=null;
function showToast(t,duration){
  const e=$('toast');e.textContent=t;e.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>e.classList.remove('show'), duration || 6000);
}
function notifyNewOrder(o){if(o?.user_id&&o.user_id===currentUserId)return;if(o?.id&&!notifyOnce('new:'+o.id))return;beep();showToast('🆕 '+svcName(o?.service)+' : '+(o?.amount_usd??'')+' USD — '+(o?.full_name||'Client'));}
function launchConfetti(){const c=document.createElement('div');c.className='confetti-container';document.body.appendChild(c);const colors=['#3b82f6','#22d3ee','#2563eb','#34d399','#ffffff'],shapes=['50%','2px','0'];for(let i=0;i<60;i++){const p=document.createElement('div');p.className='confetti';p.style.left=Math.random()*100+'%';p.style.background=colors[Math.floor(Math.random()*colors.length)];p.style.borderRadius=shapes[Math.floor(Math.random()*shapes.length)];p.style.width=(6+Math.random()*8)+'px';p.style.height=(6+Math.random()*8)+'px';p.style.animationDelay=(Math.random()*0.5)+'s';p.style.animationDuration=(2+Math.random()*1.5)+'s';c.appendChild(p);}setTimeout(()=>c.remove(),4000);}

function setSubmitLoading(loading,text){
  const ob=$('obConfirm');if(ob){ob.disabled=loading;ob.classList.toggle('loading',loading);}
  const btn=$('submitOrder'),txt=$('submitOrderText'),sp=$('submitOrderSpinner');
  if(loading){btn.disabled=true;txt.textContent=text;sp.classList.remove('hidden');}
  else{btn.disabled=false;txt.textContent=(window.cbWallet&&window.cbWallet.on)?'Payer avec mon solde':'Confirmer ma commande';sp.classList.add('hidden');}
}

