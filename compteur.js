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
