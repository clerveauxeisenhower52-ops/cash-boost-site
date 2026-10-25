/* Cash Boost : programme de parrainage (0,5 % des dépôts du filleul, en HTG)
   - lien de partage  ?ref=REF12345678  (mémorisé, appliqué à la connexion)
   - champ « Code de parrainage » (optionnel) à l'inscription
   - carte « Programme de parrainage » dans l'onglet Compte + écran de détails
   Tout le calcul des bonus est fait côté serveur (fonctions referral_* et trigger sur les dépôts). */
(function(){
  'use strict';
  var KEY='cb_ref_code', RX=/^REF[0-9]{8}$/;
  var data=null, loading=false, applying=false;

  function $id(i){ return document.getElementById(i); }
  function store(c){ try{ if(c) localStorage.setItem(KEY,c); else localStorage.removeItem(KEY); }catch(_){} }
  function stored(){ try{ var c=(localStorage.getItem(KEY)||'').toUpperCase(); return RX.test(c)?c:''; }catch(_){ return ''; } }
  function ready(){ return typeof sb!=='undefined' && typeof currentUserId!=='undefined' && !!currentUserId; }
  function fmtN(v,d){ var x=Number(v); if(!isFinite(x)) return '0'; return x.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:d}); }
  function fmtD(iso){ try{ return new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); }catch(_){ return ''; } }
  function link(code){ return location.origin+location.pathname+'?ref='+encodeURIComponent(code); }
  function toast(m){ if(typeof showToast==='function') showToast(m); }

  /* 1. Lien ?ref=CODE : on garde le code, puis on nettoie l'adresse */
  try{
    var u=new URL(location.href), r=(u.searchParams.get('ref')||'').trim().toUpperCase();
    if(RX.test(r)){
      store(r); u.searchParams.delete('ref');
      history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);
    }
  }catch(_){}

  /* 2. Application du code dès que le client est connecté */
  async function tryApply(){
    var c=stored(); if(!c||applying||!ready()) return;
    applying=true;
    try{
      var res=await sb.rpc('referral_apply',{p_code:c});
      if(res.error) return;                 // on réessaiera au prochain passage
      store('');                            // réponse définitive : on ne rejoue pas
      if(res.data&&res.data.status==='applied') toast('🎁 Code de parrainage activé');
    }catch(_){} finally{ applying=false; }
  }

  /* 3. Champ « Code de parrainage » à l'inscription */
  function buildSignupField(){
    var anchor=$id('phoneField'); if(!anchor||$id('refField')) return;
    var f=document.createElement('div'); f.id='refField'; f.className='field hidden';
    f.innerHTML='<label for="authRef">Code de parrainage <span class="opt">(optionnel)</span></label>'+
      '<input id="authRef" type="text" placeholder="ex. REF12345678" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="11">';
    anchor.insertAdjacentElement('afterend',f);
    var inp=f.querySelector('input'); inp.value=stored();
    inp.addEventListener('input',function(){
      var v=inp.value.trim().toUpperCase(); inp.value=v;
      if(RX.test(v)) store(v); else if(v==='') store('');
    });
    function sync(){
      f.classList.toggle('hidden',anchor.classList.contains('hidden'));
      var s=stored(); if(s&&inp.value!==s&&document.activeElement!==inp) inp.value=s;
    }
    new MutationObserver(sync).observe(anchor,{attributes:true,attributeFilter:['class']});
    sync();
  }

  /* 4. Styles */
  function injectCss(){
    if($id('cbRefCss')) return;
    var s=document.createElement('style'); s.id='cbRefCss';
    s.textContent=
      '.cbref-code{margin:14px 0 10px;padding:14px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:14px;background:var(--surface-elev,transparent)}'+
      '.cbref-code small{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#9aa3b5);margin-bottom:6px}'+
      '.cbref-code strong{font:700 22px "Space Grotesk",sans-serif;letter-spacing:.08em;color:var(--text-strong,var(--text,#fff));word-break:break-all}'+
      '.cbref-code-row{display:flex;align-items:center;justify-content:space-between;gap:10px}'+
      '.cbref-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}'+
      '.cbref-btns button{margin:0}'+
      '.cbref-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}'+
      '.cbref-stats.three{grid-template-columns:repeat(3,1fr)}'+
      '.cbref-stats>div{padding:12px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:14px;background:var(--surface-elev,transparent);text-align:center}'+
      '.cbref-stats b{display:block;font:700 20px "Space Grotesk",sans-serif;color:var(--text-strong,var(--text,#fff))}'+
      '.cbref-stats span{display:block;margin-top:2px;font-size:11px;color:var(--muted,#9aa3b5)}'+
      '.cbref-more{width:100%;display:flex;justify-content:space-between;align-items:center;padding:13px 14px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:14px;background:transparent;color:var(--text,#fff);font:600 14px Inter,sans-serif;cursor:pointer}'+
      '.cbref-modal{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.62)}'+
      '.cbref-modal[hidden]{display:none}'+
      '.cbref-sheet{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:18px 18px calc(22px + env(safe-area-inset-bottom,0px));border-radius:22px 22px 0 0;background:var(--surface,#12121a);color:var(--text,#fff);border:1px solid var(--line-strong,rgba(255,255,255,.12))}'+
      '.cbref-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px}'+
      '.cbref-sheet-head h2{margin:0;font:700 19px "Space Grotesk",sans-serif}'+
      '.cbref-close{width:38px;height:38px;border-radius:12px;border:1px solid var(--line-strong,rgba(255,255,255,.12));background:transparent;color:var(--text,#fff);font-size:16px;cursor:pointer}'+
      '.cbref-sheet h3{margin:18px 0 8px;font-size:14px;font-weight:700}'+
      '.cbref-list{margin:0;padding:0;list-style:none;display:grid;gap:8px}'+
      '.cbref-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:12px;font-size:13px}'+
      '.cbref-list small{display:block;margin-top:2px;font-size:11px;color:var(--muted,#9aa3b5)}'+
      '.cbref-gain{font-weight:700;color:var(--success,#22c55e);white-space:nowrap}'+
      '.cbref-empty{padding:18px 8px;text-align:center;font-size:13px;color:var(--muted,#9aa3b5)}'+
      '.cbref-how{margin:0;padding-left:18px;display:grid;gap:6px;font-size:13px;line-height:1.45;color:var(--text,#fff)}';
    document.head.appendChild(s);
  }

  /* 5. Carte dans l'onglet Compte */
  var GIFT='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M7.5 8a2.5 2.5 0 1 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 1 1 0 5"/></svg>';
  function buildCard(){
    var anchor=$id('emailCard'); if(!anchor||$id('cbRefCard')) return;
    var c=document.createElement('div'); c.id='cbRefCard'; c.className='card account card-mt acc-form';
    c.innerHTML=
      '<div class="acc-head"><span class="acc-ic dark" aria-hidden="true">'+GIFT+'</span>'+
      '<div><h2 class="account-section-title">Programme de parrainage</h2>'+
      '<p class="account-text">Invite tes amis et gagne 0,5 % de chacun de leurs dépôts.</p></div></div>'+
      '<div class="cbref-code"><small>Ton code de parrainage</small><strong id="cbRefCode">…</strong></div>'+
      '<div class="cbref-btns"><button id="cbRefCopy" type="button" class="secondary-btn">Copier</button>'+
      '<button id="cbRefShare" type="button" class="primary-btn">Partager</button></div>'+
      '<div class="cbref-stats"><div><b id="cbRefCount">0</b><span>Parrainages</span></div>'+
      '<div><b id="cbRefBonus">0</b><span>Bonus gagnés (HTG)</span></div></div>'+
      '<button id="cbRefMore" type="button" class="cbref-more"><span>Voir les détails complets</span><span aria-hidden="true">›</span></button>';
    anchor.insertAdjacentElement('beforebegin',c);
    $id('cbRefCopy').addEventListener('click',function(e){ copyCode(e.currentTarget); });
    $id('cbRefShare').addEventListener('click',share);
    $id('cbRefMore').addEventListener('click',openModal);
  }

  /* 6. Écran de détails */
  function buildModal(){
    if($id('cbRefModal')) return;
    var m=document.createElement('div'); m.id='cbRefModal'; m.className='cbref-modal'; m.hidden=true;
    m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); m.setAttribute('aria-labelledby','cbRefModalT');
    m.innerHTML=
      '<div class="cbref-sheet">'+
        '<div class="cbref-sheet-head"><h2 id="cbRefModalT">Programme de parrainage</h2>'+
        '<button id="cbRefClose" type="button" class="cbref-close" aria-label="Fermer">✕</button></div>'+
        '<div class="cbref-code"><small>Ton code de parrainage</small>'+
        '<div class="cbref-code-row"><strong id="cbRefCode2">…</strong>'+
        '<button id="cbRefCopy2" type="button" class="wallet-copy">Copier</button></div></div>'+
        '<button id="cbRefShare2" type="button" class="primary-btn">Partager mon code</button>'+
        '<div class="cbref-stats three"><div><b id="cbRefCount2">0</b><span>Parrainages</span></div>'+
        '<div><b id="cbRefBonus2">0</b><span>Bonus (HTG)</span></div>'+
        '<div><b id="cbRefRate2">0,5 %</b><span>Par dépôt</span></div></div>'+
        '<h3>Personnes que tu as invitées</h3><ul id="cbRefList" class="cbref-list"></ul>'+
        '<h3>Comment ça marche ?</h3>'+
        '<ol class="cbref-how"><li>Partage ton code ou ton lien de parrainage.</li>'+
        '<li>Ton ami crée son compte avec ton code, avant son premier dépôt.</li>'+
        '<li>À chaque dépôt crédité de ton ami, tu reçois 0,5 % en HTG dans ton portefeuille. Tu peux utiliser ce bonus pour tes achats.</li></ol>'+
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click',function(e){ if(e.target===m) closeModal(); });
    $id('cbRefClose').addEventListener('click',closeModal);
    $id('cbRefCopy2').addEventListener('click',function(e){ copyCode(e.currentTarget); });
    $id('cbRefShare2').addEventListener('click',share);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeModal(); });
  }
  function openModal(){
    injectCss(); buildModal(); render();
    $id('cbRefModal').hidden=false; document.body.style.overflow='hidden';
    load();
  }
  function closeModal(){
    var m=$id('cbRefModal'); if(!m||m.hidden) return;
    m.hidden=true; document.body.style.overflow='';
  }

  /* 7. Affichage des données */
  function setText(id,v){ var e=$id(id); if(e) e.textContent=v; }
  function render(){
    if(!data) return;
    var code=data.code||'…', rate=(Number(data.rate)||0.005)*100;
    setText('cbRefCode',code); setText('cbRefCode2',code);
    setText('cbRefCount',fmtN(data.count,0)); setText('cbRefCount2',fmtN(data.count,0));
    setText('cbRefBonus',fmtN(data.total_bonus,2)); setText('cbRefBonus2',fmtN(data.total_bonus,2));
    setText('cbRefRate2',fmtN(rate,1)+' %');
    var ul=$id('cbRefList'); if(!ul) return;
    ul.innerHTML='';
    var rows=data.invited||[];
    if(!rows.length){
      var e=document.createElement('li'); e.className='cbref-empty'; e.style.display='block';
      e.textContent='Tu n\u2019as encore invité personne.'; ul.appendChild(e); return;
    }
    rows.forEach(function(x){
      var li=document.createElement('li');
      var left=document.createElement('div');
      var b=document.createElement('b'); b.textContent=x.name||'Client';
      var sm=document.createElement('small'); sm.textContent='Inscrit le '+fmtD(x.joined_at);
      left.appendChild(b); left.appendChild(sm);
      var g=document.createElement('div'); g.className='cbref-gain'; g.textContent='+'+fmtN(x.bonus_htg,2)+' HTG';
      li.appendChild(left); li.appendChild(g); ul.appendChild(li);
    });
  }
  async function load(){
    if(loading||!ready()) return;
    loading=true;
    try{
      var r=await sb.rpc('referral_summary');
      if(r&&r.data&&r.data.status==='ok'){ data=r.data; render(); }
    }catch(_){} finally{ loading=false; }
  }

  /* 8. Copier / partager */
  async function copyText(v,msg){
    if(typeof walletCopy==='function'){ await walletCopy(v,msg); return; }
    try{ await navigator.clipboard.writeText(v); }catch(_){}
    toast(msg);
  }
  function flash(btn){
    if(!btn) return;
    if(btn._h==null) btn._h=btn.innerHTML;
    btn.textContent='Copié \u2713';
    clearTimeout(btn._t);
    btn._t=setTimeout(function(){ btn.innerHTML=btn._h; btn._h=null; },2000);
  }
  async function copyCode(btn){
    if(!data||!data.code){ toast('Code en cours de chargement…'); load(); return; }
    await copyText(data.code,'Code copié'); flash(btn);
  }
  async function share(){
    if(!data||!data.code){ toast('Code en cours de chargement…'); load(); return; }
    var url=link(data.code);
    var text='Rejoins-moi sur Cash Boost avec mon code de parrainage '+data.code+'.';
    if(navigator.share){
      try{ await navigator.share({title:'Cash Boost',text:text,url:url}); return; }
      catch(e){ if(e&&e.name==='AbortError') return; }
    }
    await copyText(url,'Lien de parrainage copié');
  }

  /* 9. Démarrage */
  function init(){
    injectCss(); buildSignupField(); buildCard();
    var pa=$id('page-account');
    function visible(){ return pa&&!pa.classList.contains('hidden'); }
    if(pa) new MutationObserver(function(){ if(visible()) load(); }).observe(pa,{attributes:true,attributeFilter:['class']});
    setInterval(function(){
      tryApply();
      if(visible()&&!data) load();
    },3000);
    tryApply();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
