/* Free Fire : page de commande (style Izy Store, comme Blood Strike : packs compacts, une seule page, bouton Acheter maintenant).
   L'ID joueur est vérifié automatiquement avant le paiement (fonction freefire-validate). La vérification est aussi imposée côté serveur :
   la fonction SQL freefire_purchase exige une vérification réussie (serveur NA) de moins de 30 minutes pour ce client et cet ID. */
(function(){
  const st=document.createElement('style');
  st.textContent=`
#page-freefire .ff-price{margin:6px 0 4px;font:700 28px 'Space Grotesk','Inter',system-ui,sans-serif;color:var(--text-strong)}
#page-freefire .ff-packs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
#page-freefire .ff-pack{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:14px;cursor:pointer}
#page-freefire .ff-pack:active{transform:scale(.97)}
#page-freefire .ff-pack.sel{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}
#page-freefire .ff-gem{flex:none;display:block;font-size:20px;line-height:1;pointer-events:none}
#page-freefire .ff-clear{display:block;margin:6px 0 0;padding:6px 0;border:0;background:none;color:var(--muted);font:inherit;font-size:13px;letter-spacing:.06em;cursor:pointer}
#page-freefire .ff-sep{border:0;border-top:1px solid var(--line-strong);margin:16px 0}
#page-freefire .ff-badge{display:block;padding:10px 14px;border-radius:999px;margin:0 0 12px;font-size:14px;font-weight:700;background:rgba(245,190,60,.16);border:1px solid rgba(245,190,60,.5);color:var(--text-strong)}
#page-freefire .ff-badge.ok{background:var(--success-soft);border-color:rgba(52,211,153,.28);color:var(--success)}
#page-freefire .ff-badge.load{background:var(--primary-soft);border-color:var(--primary-line);color:var(--primary)}
#page-freefire .ffin{position:relative}
#page-freefire .ffin input{padding-right:46px}
#page-freefire .ffdot{position:absolute;right:14px;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;border:2px solid var(--line-strong);box-sizing:border-box}
#page-freefire .ffdot.load{border-color:var(--primary);border-top-color:transparent;animation:ffs .8s linear infinite}
#page-freefire .ffdot.ok{background:var(--success);border-color:var(--success)}
#page-freefire .ffdot.err{background:var(--danger);border-color:var(--danger)}
@keyframes ffs{to{transform:rotate(360deg)}}
#page-freefire #ffV{margin-top:12px}
#page-freefire .ffcard{padding:12px 14px;border-radius:14px;margin:0 0 10px;font-size:15px;line-height:1.5;color:var(--text-strong)}
#page-freefire .ffcard small{display:block;color:var(--muted);margin-top:6px;font-size:12px}
#page-freefire .ffcard.load{background:var(--primary-soft);border:1px solid var(--primary-line)}
#page-freefire .ffcard.ok{background:var(--success-soft);border:1px solid rgba(52,211,153,.28)}
#page-freefire .ffcard.err{background:var(--danger-soft);color:var(--danger);font-weight:600}
#page-freefire .ff-retry{margin-top:8px;padding:8px 16px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:13px}
#page-freefire #ffPay{margin-top:14px;text-transform:uppercase;letter-spacing:.02em}
#page-freefire #ffPay:disabled{opacity:.45}
#page-freefire .ff-done{text-align:center;padding:10px 0 4px}
#page-freefire .ff-done h2{margin:0 0 8px}
#page-freefire .ff-done p{margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.5}
`;
  document.head.appendChild(st);

  const pg=document.createElement('section');
  pg.id='page-freefire';pg.className='page hidden';
  const host=document.getElementById('page-service');
  if(host&&host.parentNode)host.after(pg);else (document.querySelector('#appView main')||document.body).appendChild(pg);

  let packs=null,sel=null,reqId=null,busy=false,bal=0,okPid=null,info=null,vstate='',vmsg='',canRetry=false,timer=null,seq=0,conf=false;
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const curPid=()=>(($('ffPid')&&$('ffPid').value)||'').replace(/\s/g,'');
  const curPack=()=>packs&&packs.find(x=>String(x.id)===String(sel));
  const phoneNorm=()=>{const v=($('ffPhone')&&$('ffPhone').value)||'';return typeof normPhone==='function'?normPhone(v):v.replace(/\D/g,'');};
  const msg=(t,c)=>{const m=$('ffMsg');if(m){m.className='msg '+(c||'');m.textContent=t;}};
  // Compte vérifié par le fournisseur (serveur NA) pour l'ID actuellement saisi
  const verified=()=>vstate==='ok'&&okPid===curPid();
  const ready=()=>verified()&&conf;
  // Libellé d'un pack : « 110 💎 » devient « 💎 110 » (diamant à gauche du nombre, comme chez Izy Store)
  const packLabel=l=>{const m=/^\s*(\d+)\s*(?:💎|diamants?)\s*$/iu.exec(l||'');return m?'<span class="ff-gem" aria-hidden="true">💎</span>'+esc(m[1]):esc(l);};

  // Page « Free Fire » : s'affiche comme la page de commande des autres services
  const baseShow=window.showPage;
  window.showPage=function(p){
    if(p==='freefire'){
      document.querySelectorAll('#appView main > .page').forEach(e=>e.classList.add('hidden'));
      pg.classList.remove('hidden');
      document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.dataset.page==='services'));
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    pg.classList.add('hidden');
    return baseShow.apply(this,arguments);
  };

  function build(){
    pg.innerHTML=`
<div class="page-title"><button id="ffBack" class="back" type="button">← Retour aux services</button></div>
<div id="ffTop">
  <h1 class="svc-title">Free Fire Automatique<span class="svc-badge svc-badge-auto">Auto</span></h1>
  <div id="ffRange" class="ff-price">—</div>
  <div id="ffPacks"></div>
  <button type="button" id="ffClear" class="ff-clear hidden">EFFACER</button>
</div>
<hr class="ff-sep">
<div id="ffPrice" class="ff-price hidden">—</div>
<div id="ffCard" class="card card-pad">
  <div id="ffBadge" class="ff-badge">Vérification requise</div>
  <div class="field">
    <label for="ffPid">ID joueur Free Fire</label>
    <div class="ffin"><input id="ffPid" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="ID"><span id="ffDot" class="ffdot"></span></div>
    <p class="field-help">Vérification ID requise pour Free Fire Automatique.</p>
    <p class="field-help">Réservé aux comptes du serveur Nord-Amérique (NA).</p>
    <div id="ffV"></div>
  </div>
  <div class="field">
    <label for="ffPhone">Ton numéro WhatsApp</label>
    <input id="ffPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="ex. 37 12 34 56">
    <p class="field-help">Obligatoire · pour te prévenir dès que c'est prêt</p>
  </div>
  <div class="pay-wallet-card selected">
    <span class="pay-wallet-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16.5" cy="14" r="1.2"/></svg></span>
    <span class="pay-wallet-info"><span class="pay-wallet-name">Paiement avec ton portefeuille</span><span class="pay-wallet-desc" id="ffBal">Solde : …</span></span>
    <button type="button" class="pay-wallet-add" id="ffAddFunds">+ Fonds</button>
  </div>
  <div id="ffPayHint" class="pay-wallet-hint hidden" role="status"></div>
  <button id="ffPay" class="primary-btn" type="button">Acheter maintenant</button>
  <div id="ffMsg" class="msg"></div>
  <p class="note">Vérifie soigneusement ton ID joueur avant de confirmer. Remboursement automatique si la recharge échoue.</p>
</div>`;
    $('ffBack').onclick=()=>showPage('services');
    $('ffPacks').onclick=e=>{
      const b=e.target.closest('[data-pack]');if(!b)return;
      sel=b.dataset.pack;renderPacks();msg('');paint();
    };
    $('ffClear').onclick=()=>{sel=null;renderPacks();msg('');paint();};
    $('ffPid').addEventListener('input',()=>{
      clearTimeout(timer);seq++;okPid=null;info=null;vstate='';vmsg='';conf=false;
      if(curPid().length>=8)timer=setTimeout(check,600);
      paint();
    });
    $('ffPhone').addEventListener('input',()=>{
      try{const c=$('custPhone');if(c)c.value=$('ffPhone').value;if(typeof phoneKey==='function'){const k=phoneKey();if(k)localStorage.setItem(k,$('ffPhone').value);}}catch(_){}
      paint();
    });
    $('ffPay').onclick=pay;
    $('ffAddFunds').onclick=()=>{showPage('wallet');setTimeout(()=>{const b=$('walletAddBtn');if(b)b.click();},60);};
  }

  function renderPacks(){
    const chip=x=>'<button type="button" class="ff-pack'+(String(x.id)===String(sel)?' sel':'')+'" data-pack="'+esc(x.id)+'" aria-label="'+esc(x.label)+'">'+packLabel(x.label)+'</button>';
    $('ffPacks').innerHTML=packs.length?'<div class="ff-packs">'+packs.map(chip).join('')+'</div>':'<p class="field-help">Aucun pack disponible</p>';
  }

  function paint(){
    if(!$('ffPacks'))return;
    const p=curPack();
    $('ffDot').className='ffdot '+vstate;
    const bd=$('ffBadge');
    if(verified()){bd.className='ff-badge ok';bd.textContent='✓ Compte vérifié';}
    else if(vstate==='load'){bd.className='ff-badge load';bd.textContent='Vérification en cours…';}
    else{bd.className='ff-badge';bd.textContent='Vérification requise';}
    const v=$('ffV');
    if(vstate==='load')v.innerHTML='<div class="ffcard load">Vérification du compte en cours…</div>';
    else if(verified()){
      v.innerHTML='<div class="ffcard ok"><b>✓ Compte Free Fire confirmé</b><small>Nom du joueur</small><b id="ffName"></b><small>ID joueur</small>'+esc(okPid)+(info&&info.region?'<small>Serveur</small>'+esc(info.region):'')+'</div>'
        +'<label class="terms"><input type="checkbox" id="ffConf"'+(conf?' checked':'')+'><span>Je confirme que ce compte est le mien</span></label>';
      $('ffName').textContent=(info&&info.player_name)||'—';
      $('ffConf').onchange=()=>{conf=$('ffConf').checked;paint();};
    }
    else if(vstate==='err'){
      v.innerHTML='<div class="ffcard err">'+esc(vmsg)+(canRetry?'<br><button type="button" id="ffRetry" class="ff-retry">Réessayer</button>':'')+'</div>';
      if(canRetry)$('ffRetry').onclick=check;
    }
    else v.innerHTML='';
    // En haut : fourchette de prix toujours visible. Sous les packs : prix du pack choisi (comme Izy Store), avec EFFACER.
    if(packs&&packs.length){const pr=packs.map(x=>Number(x.price_htg));$('ffRange').textContent=fmt(Math.min(...pr))+' – '+fmt(Math.max(...pr))+' HTG';}
    else $('ffRange').textContent='—';
    $('ffPrice').classList.toggle('hidden',!p);
    $('ffClear').classList.toggle('hidden',!p);
    if(p)$('ffPrice').textContent=fmt(p.price_htg)+' HTG';
    $('ffBal').textContent='Solde : '+fmt(bal)+' HTG';
    const h=$('ffPayHint');
    if(p&&bal<Number(p.price_htg)){h.textContent='Solde insuffisant : il te manque '+fmt(Number(p.price_htg)-bal)+' HTG. Ajoute des fonds pour continuer.';h.classList.remove('hidden');}
    else h.classList.add('hidden');
    // Bouton grisé tant qu'un pack n'est pas choisi et que le compte n'est pas vérifié et confirmé.
    $('ffPay').disabled=busy||!p||!ready();
    $('ffPay').textContent=busy?'Paiement en cours…':'Acheter maintenant';
  }

  // Vérifie l'ID chez le fournisseur (lecture seule, aucun débit). Seul un compte trouvé sur le serveur NA permet de payer.
  async function check(){
    const pid=curPid(),my=++seq;
    if(!/^[0-9]{8,15}$/.test(pid)){vstate='err';vmsg='ID joueur invalide : 8 chiffres minimum.';canRetry=false;okPid=null;info=null;return paint();}
    vstate='load';paint();
    let d=null;
    try{const x=await sb.functions.invoke('freefire-validate',{body:{player_id:pid}});d=x.data;}catch(_){}
    if(my!==seq||curPid()!==pid)return;
    okPid=null;info=null;
    if(d&&d.ok&&d.valid){
      if(String(d.region||'').toUpperCase()!=='NA'){vstate='err';vmsg='Ce service est réservé aux comptes du serveur NA.';canRetry=false;}
      else{okPid=pid;info=d;vstate='ok';}
    }
    else if(d&&d.ok&&d.valid===false){vstate='err';vmsg='Aucun compte Free Fire trouvé avec cet ID.';canRetry=false;}
    else if(d&&d.error==='rate_limited'){vstate='err';vmsg='Trop de vérifications. Réessaie dans quelques minutes.';canRetry=true;}
    else{vstate='err';vmsg='Vérification indisponible pour le moment.';canRetry=true;}
    paint();
  }

  function done(){
    $('ffTop').style.display='none';
    $('ffPrice').style.display='none';
    document.querySelectorAll('#page-freefire .ff-sep').forEach(e=>e.style.display='none');
    $('ffCard').innerHTML='<div class="ff-done"><div class="sv-check">✓</div><h2>Commande reçue</h2><p>Tes diamants arrivent en quelques instants. Si la recharge échoue, ton solde est remboursé automatiquement.</p><button type="button" id="ffOrders" class="primary-btn">Voir mes commandes</button><button type="button" id="ffAgain" class="secondary-btn" style="margin-top:10px">Commander à nouveau</button></div>';
    $('ffOrders').onclick=()=>{showPage('orders');try{loadMyOrders();}catch(_){}};
    $('ffAgain').onclick=()=>open();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function pay(){
    if(busy)return;
    const pid=curPid(),ph=phoneNorm(),p=curPack();
    if(!p)return msg('Choisis un pack.','err');
    if(vstate==='load')return msg('Vérification du compte en cours. Patiente un instant.','err');
    if(!verified())return msg('Vérifie d’abord ton ID joueur Free Fire.','err');
    if(!conf)return msg('Coche la case pour confirmer que ce compte est le tien.','err');
    if(ph.length<11)return msg('Numéro invalide. Exemple : 37 12 34 56.','err');
    busy=true;paint();msg('');
    if(!reqId)reqId=uuid();
    let r=null,err=null;
    try{const x=await sb.rpc('freefire_purchase',{p_request_id:reqId,p_pack_id:sel,p_player_id:pid,p_phone:ph,p_confirmed:true});r=x.data;err=x.error;}catch(e){err=e;}
    busy=false;paint();
    if(err||!r)return msg('Paiement momentanément indisponible. Réessaie dans un instant.','err');
    if(r.status==='paid'){
      reqId=null;walletBal=Number(r.balance||0);
      try{if(typeof payWalletRefresh==='function')payWalletRefresh();}catch(_){}
      try{loadMyOrders();}catch(_){}
      done();
      return;
    }
    reqId=null;
    // Vérification expirée ou absente côté serveur : on efface le « compte vérifié » et on relance la vérification
    if(r.status==='id_not_verified'||r.status==='verification_unavailable'){
      okPid=null;info=null;vstate='';vmsg='';conf=false;paint();
      msg('Vérification expirée : on revérifie ton ID. Coche la confirmation puis reclique sur Acheter.','err');
      check();
      return;
    }
    const M={insufficient_funds:'Solde insuffisant. Ajoute des fonds dans ton portefeuille.',service_unavailable:'Ce service est indisponible pour le moment.',invalid_input:'Informations invalides. Vérifie ton ID joueur et ton numéro.',unauthenticated:'Session expirée. Reconnecte-toi.',confirmation_required:'Coche la case pour confirmer que ce compte est le tien.',player_not_found:'Aucun compte Free Fire reconnu avec cet ID.',wrong_region:'Ce service est réservé aux comptes du serveur NA.'};
    msg(M[r.status]||'Paiement impossible.','err');
  }

  async function open(){
    clearTimeout(timer);
    sel=null;reqId=null;okPid=null;info=null;vstate='';vmsg='';canRetry=false;conf=false;busy=false;seq++;
    build();
    showPage('freefire');
    $('ffPacks').innerHTML='<p class="field-help">Chargement…</p>';
    try{
      if(!packs){const x=await sb.from('freefire_packs').select('id,label,price_htg').eq('active',true).order('sort');if(x.error)throw x.error;packs=x.data||[];}
      const w=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle();bal=Number(w&&w.data&&w.data.balance_htg||0);
      renderPacks();
      try{if(typeof restorePhone==='function')restorePhone();}catch(_){}
      $('ffPhone').value=($('custPhone')&&$('custPhone').value)||'';
      paint();
    }catch(_){
      $('ffPacks').innerHTML='<p class="field-help">Impossible de charger les packs. Réessaie.</p><button type="button" class="secondary-btn" id="ffReload">Réessayer</button>';
      $('ffReload').onclick=open;
    }
  }
  const prev=window.openService;
  window.openService=function(id){return id==='Free Fire'?open():prev.apply(this,arguments);};
})();
