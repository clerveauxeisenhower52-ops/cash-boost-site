/* Cash Boost : compteur « commandes livrées » sur l'Accueil.
   Le nombre vient de la fonction Supabase delivered_count() (un simple compte, aucune donnée client).
   Il ne s'affiche qu'à partir de MIN_SHOW commandes : change cette valeur pour l'afficher plus tôt ou plus tard. */
(function(){
  'use strict';
  var MIN_SHOW=50;
  var last=0;
  var st=document.createElement('style');
  st.textContent='.cb-delivered{margin:14px 0 4px;padding:10px 14px;border:1px solid var(--primary-line);border-radius:14px;background:var(--primary-soft);color:var(--text-strong);font-size:14px;font-weight:600;text-align:center}.cb-delivered b{font-family:"Space Grotesk",sans-serif;font-size:16px}';
  document.head.appendChild(st);
  function render(n){
    var el=document.getElementById('cbDelivered');
    if(!(n>=MIN_SHOW)){ if(el) el.remove(); return; }
    var txt=String(fmt(n));
    if(!el){
      var anchor=document.querySelector('#page-home .trust');
      if(!anchor) return;
      el=document.createElement('div');
      el.id='cbDelivered';el.className='cb-delivered';el.setAttribute('role','status');
      anchor.parentNode.insertBefore(el,anchor);
    }
    el.innerHTML='✅ <b></b> commandes livrées';
    el.querySelector('b').textContent=txt;
  }
  async function load(){
    if(Date.now()-last<60000) return;
    last=Date.now();
    try{
      var r=await sb.rpc('delivered_count');
      if(r&&!r.error&&r.data!==null&&r.data!==undefined) render(Number(r.data));
    }catch(_){}
  }
  try{
    // Supabase déconseille d'attendre d'autres appels dans ce callback : on décale d'un tour de boucle.
    sb.auth.onAuthStateChange(function(_e,s){ if(s) setTimeout(load,0); });
  }catch(_){}
})();

/* Cash Boost : Plasma One = UNE seule carte dans l'onglet Services.
   Les deux services de la base (« Plasma One — … Automatisé » et « Plasma One — … Manuel ») restent
   séparés : seul l'affichage change. Le client touche « Commander », choisit Automatique ou Manuel
   dans une fenêtre, puis la page de commande s'ouvre exactement comme avant (aucune logique modifiée).
   Si un des deux services n'existe pas, rien ne change. */
(function(){
  'use strict';
  var sheet=null;

  var st=document.createElement('style');
  st.textContent='.pc-opt{display:flex;align-items:center;gap:12px;width:100%;margin:0 0 10px;padding:14px;border:1px solid var(--primary-line);border-radius:14px;background:var(--primary-soft);color:var(--text-strong);text-align:left;font:inherit;cursor:pointer}'
    +'.pc-opt:disabled{opacity:.5;cursor:not-allowed}'
    +'.pc-ic{font-size:26px;line-height:1;flex:none}'
    +'.pc-tx b{display:block;font-size:16px}'
    +'.pc-tx small{display:block;margin-top:2px;font-size:13px;opacity:.85;line-height:1.35}';
  document.head.appendChild(st);

  function mk(tag,cls,txt){
    var e=document.createElement(tag);
    if(cls) e.className=cls;
    if(txt!==undefined) e.textContent=txt;
    return e;
  }

  // Retrouve les deux variantes Plasma One dans la liste des services
  function variants(){
    var v={auto:null,manuel:null};
    (SERVICES||[]).forEach(function(s){
      var p=svcNameParts(s.name);
      if(p.kind&&s.visible!==false&&/^plasma one$/i.test(String(p.base).trim())) v[p.kind]=s;
    });
    return v;
  }

  function closeChoice(){
    if(!sheet) return;
    sheet.classList.remove('show');
    sheet.setAttribute('aria-hidden','true');
  }

  function option(icon,title,desc,s){
    var ready=serviceReady(s);
    var b=mk('button','pc-opt');
    b.type='button';
    b.disabled=!ready;
    b.appendChild(mk('span','pc-ic',icon));
    var tx=mk('span','pc-tx');
    tx.appendChild(mk('b','',title));
    tx.appendChild(mk('small','',ready?desc:'Bientôt disponible'));
    b.appendChild(tx);
    b.onclick=function(){ closeChoice(); openService(s.id); };
    return b;
  }

  function openChoice(){
    var v=variants();
    if(!v.auto||!v.manuel) return;
    if(!sheet){
      sheet=mk('div','sv');
      sheet.id='plasmaChoice';
      sheet.setAttribute('role','dialog');
      sheet.setAttribute('aria-modal','true');
      sheet.setAttribute('aria-hidden','true');
      document.body.appendChild(sheet);
      sheet.addEventListener('click',function(e){ if(e.target===sheet) closeChoice(); });
      document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeChoice(); });
    }
    var hours='';
    try{ hours=' · '+fmtHour(OPEN_HOUR,OPEN_MIN)+'–'+fmtHour(CLOSE_HOUR,CLOSE_MIN); }catch(_){}
    sheet.innerHTML='';
    var card=mk('div','sv-card');
    card.appendChild(mk('h2','','Plasma One'));
    card.appendChild(mk('p','','Choisis comment tu veux recevoir tes USDT.'));
    card.appendChild(option('⚡','Automatique','USDT envoyés automatiquement dès que ton paiement est vérifié.',v.auto));
    card.appendChild(option('✋','Manuel','Commande validée par notre équipe'+hours+'.',v.manuel));
    var cancel=mk('button','secondary-btn','Annuler');
    cancel.type='button';
    cancel.onclick=closeChoice;
    card.appendChild(cancel);
    sheet.appendChild(card);
    sheet.classList.add('show');
    sheet.setAttribute('aria-hidden','false');
  }

  // Après chaque affichage de la liste : on remplace les deux cartes Plasma One par une seule
  function merge(){
    var list=document.getElementById('servicesList');
    if(!list) return;
    var v=variants();
    if(!v.auto||!v.manuel) return;
    function cardOf(s){
      var btns=list.querySelectorAll('[data-open]');
      for(var i=0;i<btns.length;i++){
        if(btns[i].getAttribute('data-open')===s.id) return btns[i].closest('.service-card');
      }
      return null;
    }
    var ca=cardOf(v.auto),cm=cardOf(v.manuel);
    if(!ca||!cm) return;
    // La carte unique prend la place de la plus haute des deux
    if(cm.compareDocumentPosition(ca)&4) cm.parentNode.insertBefore(ca,cm);
    cm.parentNode.removeChild(cm);

    var h=ca.querySelector('.service-title h2');
    if(h) h.textContent='Plasma One';           // retire aussi le badge Auto / Manuel
    var im=ca.querySelector('img');
    if(im) im.alt='Logo Plasma One';

    var ready=serviceReady(v.auto)||serviceReady(v.manuel);
    ca.classList.toggle('soon',!ready);
    var old=ca.querySelector('button[data-open]');
    if(old){
      var nb=old.cloneNode(true);               // le clone ne garde pas l'ancien gestionnaire de clic
      nb.removeAttribute('data-open');
      nb.setAttribute('data-plasma-choice','1');
      nb.disabled=!ready;
      nb.textContent=ready?'Commander':'Bientôt';
      nb.onclick=openChoice;
      old.parentNode.replaceChild(nb,old);
    }
  }

  var baseRender=window.renderServices;
  if(typeof baseRender!=='function') return;
  window.renderServices=function(){
    baseRender.apply(this,arguments);
    try{ merge(); }catch(_){}
  };
  try{ if(SERVICES&&SERVICES.length) window.renderServices(); }catch(_){}
})();

/* Cash Boost : bouton « Commander à nouveau » / « Refaire la commande » bien visible dans Commandes.
   Style seulement : le bouton et son action ne changent pas.
   - Commande complétée : gros bouton plein (dégradé de la marque), pleine largeur.
   - Autre cas (en attente, refaire) : bouton pleine largeur avec contour de la couleur de la marque,
     pour ne pas pousser à recommander pendant qu'une commande est encore en cours. */
(function(){
  'use strict';
  var st=document.createElement('style');
  st.textContent='#ordersList .order .reorder-btn{display:flex !important;align-items:center;justify-content:center;gap:8px;width:100% !important;min-height:48px;margin-top:14px !important;padding:12px 16px !important;border-radius:14px !important;border:1.5px solid var(--primary-line) !important;background:var(--primary-soft) !important;color:var(--text-strong) !important;font-size:15px !important;font-weight:700 !important;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    +'#ordersList .order .reorder-btn::before{content:"\\21BB";font-size:18px;line-height:1}'
    +'#ordersList .order:has(.status.done) .reorder-btn{border-color:transparent !important;background:var(--brand-grad) !important;color:var(--brand-ink) !important;box-shadow:0 8px 20px -10px rgba(var(--brand-b-rgb),.7)}'
    +'#ordersList .order .reorder-btn:active{transform:scale(.98)}';
  document.head.appendChild(st);
})();

/* Cash Boost : bannière « Installe l'app » en bas de l'écran (comme sur CashTransfe).
   - Si le navigateur autorise l'installation (Chrome Android) : « Installer » ouvre la vraie fenêtre d'installation.
   - Sinon (iPhone, ou Chrome qui retient son autorisation) : « Voir comment » affiche les étapes à suivre.
   - Jamais affichée si l'app est déjà ouverte en mode application (icône de l'écran d'accueil).
   - Elle revient à chaque ouverture ou rafraîchissement tant que l'app n'est pas ouverte en mode application.
     « Pas maintenant » ou ✕ la ferme seulement pour la visite en cours.
     Pour la cacher plus longtemps après un refus, mets DAYS à 1, 3 ou 7 (nombre de jours).
   Utilise deferredInstall et installRefresh() de base.js (la carte « Application » du compte reste en place). */
(function(){
  'use strict';
  var KEY='cashboost_install_snooze',DAYS=0,DELAY=2500;
  var el=null,shown=false;

  var st=document.createElement('style');
  st.textContent='#installBanner{position:fixed;left:12px;right:12px;bottom:var(--ib-b,12px);z-index:99990;max-width:460px;margin:0 auto;padding:16px 16px 14px;border:1px solid var(--primary-line,rgba(255,255,255,.14));border-radius:18px;background:var(--surface,#14151b);color:var(--text-strong,#fff);box-shadow:0 18px 40px -12px rgba(0,0,0,.55);transform:translateY(24px);opacity:0;transition:transform .3s ease,opacity .3s ease}'
    +'#installBanner.show{transform:none;opacity:1}'
    +'#installBanner .ib-t{display:block;padding-right:34px;font-family:"Space Grotesk",sans-serif;font-size:17px;font-weight:700}'
    +'#installBanner .ib-d{margin:4px 0 12px;font-size:14px;line-height:1.45;color:var(--muted,#9aa0ad)}'
    +'#installBanner .ib-steps{margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.55}'
    +'#installBanner .ib-steps[hidden]{display:none}'
    +'#installBanner .ib-act{display:flex;gap:10px}'
    +'#installBanner .ib-act button{min-height:46px;padding:10px 16px;border-radius:12px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    +'#installBanner .ib-go{border:0;background:var(--brand-grad,#1E6BFF);color:var(--brand-ink,#fff)}'
    +'#installBanner .ib-later{border:1px solid var(--primary-line,rgba(255,255,255,.2));background:transparent;color:var(--text-strong,#fff)}'
    +'#installBanner .ib-x{position:absolute;top:8px;right:8px;width:36px;height:36px;padding:0;border:0;background:transparent;color:var(--muted,#9aa0ad);font-size:16px;cursor:pointer}'
    +'@media (prefers-reduced-motion:reduce){#installBanner{transition:none}}';
  document.head.appendChild(st);

  var dismissed=false;   // fermée pendant cette visite : on ne la rouvre pas tant que la page n'est pas rechargée

  function standalone(){ return window.navigator.standalone===true||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches); }
  function onIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1); }
  function snoozed(){ try{ return Number(localStorage.getItem(KEY)||0)>Date.now(); }catch(_){ return false; } }
  function snooze(){ dismissed=true; if(DAYS>0){ try{ localStorage.setItem(KEY,String(Date.now()+DAYS*864e5)); }catch(_){} } }
  function promptEvt(){ try{ return deferredInstall||null; }catch(_){ return null; } }

  function hide(){
    if(!el) return;
    var e=el;
    el=null;shown=false;
    e.classList.remove('show');
    setTimeout(function(){ if(e.parentNode) e.parentNode.removeChild(e); },350);
  }
  // Au-dessus de la barre du bas quand elle est visible, sinon près du bord de l'écran
  function lift(){
    if(!el) return;
    var nav=document.querySelector('nav.bottom'),av=document.getElementById('appView');
    var on=!!nav&&!!av&&!av.classList.contains('hidden');
    el.style.setProperty('--ib-b',on?(Math.round(nav.getBoundingClientRect().height)+12)+'px':'calc(12px + env(safe-area-inset-bottom,0px))');
  }

  var STEPS_IOS='<li>Ouvre ce site dans <b>Safari</b>.</li><li>Touche <b>Partager</b> (le carré avec une flèche).</li><li>Choisis <b>Sur l\u2019écran d\u2019accueil</b>, puis <b>Ajouter</b>.</li>';
  var STEPS_ANDROID='<li>Ouvre le menu du navigateur (<b>\u22EE</b>, en haut à droite).</li><li>Touche <b>Installer l\u2019application</b> (ou <b>Ajouter à l\u2019écran d\u2019accueil</b>).</li><li>Confirme avec <b>Installer</b>.</li>';

  // native = Chrome a donné son autorisation ; sinon on montre les étapes à la main
  function show(native){
    if(shown) return;
    shown=true;
    var ios=onIOS();
    var d=document.createElement('div');
    d.id='installBanner';
    d.setAttribute('role','dialog');
    d.setAttribute('aria-label','Installer l\u2019application');
    d.innerHTML='<button type="button" class="ib-x" aria-label="Fermer">\u2715</button>'
      +'<strong class="ib-t">Installe l\u2019app</strong>'
      +'<p class="ib-d">Ajoute Cash Boost à ton écran d\u2019accueil pour y accéder plus vite, en plein écran.</p>'
      +'<ol class="ib-steps" hidden>'+(ios?STEPS_IOS:STEPS_ANDROID)+'</ol>'
      +'<div class="ib-act"><button type="button" class="ib-go">'+(native?'Installer':'Voir comment')+'</button><button type="button" class="ib-later">Pas maintenant</button></div>';
    var close=function(){ snooze(); hide(); };
    var reveal=function(btn){
      d.querySelector('.ib-steps').hidden=false;
      btn.hidden=true;
      d.querySelector('.ib-later').textContent='Fermer';
    };
    d.querySelector('.ib-x').onclick=close;
    d.querySelector('.ib-later').onclick=close;
    d.querySelector('.ib-go').onclick=async function(){
      var ev=native?promptEvt():null;
      if(!ev){ reveal(this); return; }
      try{
        ev.prompt();
        var r=await ev.userChoice;
        if(!(r&&r.outcome==='accepted')) snooze();
      }catch(_){}
      try{ deferredInstall=null; }catch(_){}
      try{ installRefresh(); }catch(_){}
      hide();
    };
    document.body.appendChild(d);
    el=d;
    lift();
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ d.classList.add('show'); }); });
  }

  function schedule(){
    if(shown||dismissed||standalone()||snoozed()) return;
    setTimeout(function(){
      if(shown||dismissed||standalone()||snoozed()) return;
      show(!!promptEvt());
    },DELAY);
  }

  // Si Chrome donne son autorisation après l'affichage des étapes, le bouton « Installer » reste possible au prochain chargement
  window.addEventListener('beforeinstallprompt',schedule);
  window.addEventListener('appinstalled',function(){ dismissed=true; hide(); });
  setInterval(lift,1000);
  if(document.readyState==='complete') schedule(); else window.addEventListener('load',schedule);
})();
