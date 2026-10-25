/* Cash Boost : adresse USDT en direct, statut des envois, bannière de mise à jour */
(function(){
  'use strict';
  function addrMsg(v){
    v=(v||'').trim(); if(v.length<3) return '';
    if(/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v)) return "C'est une adresse TRON. Utilise ton adresse Plasma (elle commence par 0x).";
    if(/\.eth$/i.test(v)) return "Les noms .eth ne sont pas acceptés. Colle l'adresse complète qui commence par 0x.";
    if(!/^0x/i.test(v)) return "L'adresse doit commencer par 0x.";
    if(!/^0x[a-fA-F0-9]*$/.test(v)) return "L'adresse contient un caractère invalide.";
    if(v.length!==42) return "L'adresse doit faire 42 caractères (là : "+v.length+").";
    if(/^0x0{40}$/.test(v)) return "Adresse invalide.";
    return '';
  }
  function bindAddr(){
    const el=document.getElementById('merutag'); if(!el||el.dataset.addrBound) return; el.dataset.addrBound='1';
    el.addEventListener('input',function(){
      let plasma=false; try{ plasma=!!(currentService&&currentService.id==='Plasma One Auto'); }catch(_){}
      if(!plasma) return;
      try{ setFieldErr('merutag', addrMsg(el.value)); }catch(_){}
    });
  }
  async function refreshStatus(){
    try{
      const app=document.getElementById('appView');
      if(!app||app.classList.contains('hidden')||typeof sb==='undefined') return;
      const r=await sb.functions.invoke('service-status');
      if(r.error||!r.data) return;
      let b=document.getElementById('svcBanner');
      if(!b){
        b=document.createElement('div'); b.id='svcBanner'; b.setAttribute('role','status');
        b.style.cssText='text-align:center;font-size:12px;font-weight:600;padding:6px 12px;';
        app.insertBefore(b,app.firstChild);
      }
      const ok=r.data.payouts==='ok';
      b.textContent=ok?'🟢 Envois USDT : normal':'🟠 Envois USDT : retardés · ta commande sera envoyée dès que possible';
      b.style.background=ok?'var(--primary-soft)':'rgba(245,158,11,.16)';
      b.style.color='var(--text)';
    }catch(_){}
  }
  window.cbShowUpdate=function(reg){
    if(document.getElementById('cbUpd')) return;
    const d=document.createElement('div'); d.id='cbUpd'; d.setAttribute('role','status');
    d.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(var(--nav-h,64px) + 12px + env(safe-area-inset-bottom,0px));z-index:400;background:var(--text);color:var(--bg,#fff);border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);';
    d.innerHTML='<span>🔄 Nouvelle version disponible</span><button type="button" style="border:0;border-radius:10px;padding:8px 12px;font-weight:700;background:var(--primary);color:#fff;">Mettre à jour</button>';
    d.querySelector('button').onclick=function(){
      window.__cbUpdating=true;
      try{ if(reg&&reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'}); }catch(_){}
      setTimeout(function(){ location.reload(); },800);
    };
    document.body.appendChild(d);
  };
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',function(){ if(window.__cbUpdating) location.reload(); });
  }
  var baseVer=null;
  function hashStr(t){var x=5381;for(var i=0;i<t.length;i++)x=((x<<5)+x+t.charCodeAt(i))|0;return x+':'+t.length;}
  async function checkVersion(){
    try{
      if(document.getElementById('cbUpd')) return;
      const r=await fetch(location.pathname,{cache:'no-store'}); if(!r.ok) return;
      const v=hashStr(await r.text());
      if(baseVer===null){ baseVer=v; return; }
      if(v!==baseVer) window.cbShowUpdate(null);
    }catch(_){}
  }
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') checkVersion(); });
  window.addEventListener('load',function(){
    bindAddr(); refreshStatus(); checkVersion();
    setInterval(checkVersion,300000);
    setInterval(refreshStatus,120000);
    setInterval(bindAddr,3000);
  });
})();

/* Modules ajoutés : onglet « Crypto » du portefeuille et page Profil */
(function(){
  ['crypto-depot.js?v=20261024','profil.js?v=20261025'].forEach(function(src){
    var s=document.createElement('script');
    s.src=src;
    s.defer=true;
    document.body.appendChild(s);
  });
})();
