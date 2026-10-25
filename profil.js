/* Cash Boost : page Profil (style liste de réglages + fenêtres modales)
   Ne change aucun identifiant existant : les formulaires de compte.js sont simplement affichés dans une fenêtre. */
(function(){
  'use strict';
  var VER='20261025';
  function $id(i){ return document.getElementById(i); }

  var ICONS={
    orders:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M16 7l3 3"/>',
    bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    sound:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    chev:'<path d="m9 6 6 6-6 6"/>',
    x:'<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function svg(n,s){ s=s||22; return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[n]+'</svg>'; }

  function loadCss(){
    if($id('pfCss')) return;
    var l=document.createElement('link');
    l.id='pfCss'; l.rel='stylesheet'; l.href='profil.css?v='+VER;
    document.head.appendChild(l);
  }

  var places=new Map(); // carte -> repère de sa place d'origine
  var current=null;

  function ensureOverlay(){
    var ov=$id('pfOverlay'); if(ov) return ov;
    ov=document.createElement('div');
    ov.id='pfOverlay'; ov.className='pf-ov'; ov.hidden=true;
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="pf-sheet"><button type="button" class="pf-x" aria-label="Fermer">'+svg('x',18)+'</button><div id="pfSlot"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){ if(e.target===ov) closeModal(); });
    ov.querySelector('.pf-x').addEventListener('click',closeModal);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&current) closeModal(); });
    return ov;
  }
  function openModal(card){
    if(!card) return;
    if(current) closeModal();
    var ov=ensureOverlay();
    if(!places.has(card)){
      var ph=document.createComment('pf-place');
      card.parentNode.insertBefore(ph,card);
      places.set(card,ph);
    }
    card.classList.remove('pf-hidden');
    $id('pfSlot').appendChild(card);
    ov.hidden=false; current=card;
    document.body.style.overflow='hidden';
  }
  function closeModal(){
    var ov=$id('pfOverlay'); if(!ov||!current) return;
    var card=current, ph=places.get(card);
    card.classList.add('pf-hidden');
    if(ph&&ph.parentNode) ph.parentNode.insertBefore(card,ph.nextSibling);
    ov.hidden=true; current=null;
    document.body.style.overflow='';
  }

  function row(icon,title,sub,onClick,cls){
    var b=document.createElement('button');
    b.type='button'; b.className='pf-row'+(cls?' '+cls:'');
    b.innerHTML='<span class="pf-ic">'+svg(icon)+'</span><span class="pf-tx"><b>'+title+'</b><small>'+sub+'</small></span><span class="pf-chev">'+svg('chev',18)+'</span>';
    b.addEventListener('click',onClick);
    return b;
  }

  function build(){
    var page=$id('page-account');
    if(!page||page.dataset.pf) return;
    page.dataset.pf='1';
    loadCss();
    page.classList.add('pf-page');

    var head=page.querySelector(':scope > .card.account');
    if(head) head.classList.add('pf-head');

    // Cartes affichées en fenêtre au lieu d'être empilées dans la page
    var cardIds=['emailCard','pwdCard','passkeyCard','installCard','pushCard','prefCard'];
    cardIds.forEach(function(id){ var c=$id(id); if(c) c.classList.add('pf-hidden'); });

    var wrap=document.createElement('div');
    wrap.id='pfMenus';

    var c1=document.createElement('div'); c1.className='pf-card';
    c1.appendChild(row('orders','Mes commandes','Voir l\u2019historique de tes recharges',function(){ var b=$id('accGoOrders'); if(b) b.click(); }));
    wrap.appendChild(c1);

    var c2=document.createElement('div'); c2.className='pf-card';
    var t=document.createElement('div'); t.className='pf-title'; t.innerHTML='<span class="pf-ic sm">'+svg('lock',18)+'</span><span>Sécurité</span>';
    c2.appendChild(t);
    c2.appendChild(row('mail','Modifier l\u2019e-mail','Changer l\u2019adresse de ton compte',function(){ openModal($id('emailCard')); }));
    c2.appendChild(row('lock','Changer le mot de passe','Modifier le mot de passe de ton compte',function(){ openModal($id('pwdCard')); }));
    var rPass=row('key','Connexion rapide','Empreinte, Face ID ou code du téléphone',function(){ openModal($id('passkeyCard')); });
    c2.appendChild(rPass);
    c2.appendChild(row('bell','Notifications','Alertes quand ta recharge est prête',function(){ openModal($id('pushCard')); }));
    c2.appendChild(row('sound','Son d\u2019alerte','Activer ou couper le son',function(){ openModal($id('prefCard')); }));
    var rInst=row('phone','Installer l\u2019application','Ajouter Cash Boost à l\u2019écran d\u2019accueil',function(){ openModal($id('installCard')); });
    c2.appendChild(rInst);
    c2.appendChild(row('out','Déconnexion','Quitter ton compte',function(){ var b=$id('logout'); if(b) b.click(); },'danger'));
    wrap.appendChild(c2);

    // Les lignes « Connexion rapide » et « Installer » suivent la disponibilité de leur carte
    function link(rowEl,cardId){
      var c=$id(cardId); if(!c) return;
      function sync(){ rowEl.hidden=c.classList.contains('hidden'); }
      sync();
      new MutationObserver(sync).observe(c,{attributes:true,attributeFilter:['class']});
    }
    link(rPass,'passkeyCard'); link(rInst,'installCard');

    var anchor=page.querySelector(':scope > .acc-stats')||head;
    if(anchor) anchor.insertAdjacentElement('afterend',wrap); else page.appendChild(wrap);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build); else build();
})();
