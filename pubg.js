/* Recharger Pubg Mobile : page de commande (même présentation que Free Fire : packs compacts, une seule page, bouton Acheter maintenant).
   L'ID joueur est vérifié automatiquement avant le paiement (fonction pubg-topup, action validate). La vérification est aussi imposée côté serveur :
   la fonction SQL pubg_purchase exige une vérification réussie (compte Global) de moins de 30 minutes pour ce client et cet ID. */
(function(){
  const st=document.createElement('style');
  st.textContent=`
#page-pubg .pgb-price{margin:6px 0 4px;font:700 28px 'Space Grotesk','Inter',system-ui,sans-serif;color:var(--text-strong)}
#page-pubg .pgb-packs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
#page-pubg .pgb-pack{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:14px;cursor:pointer}
#page-pubg .pgb-pack:active{transform:scale(.97)}
#page-pubg .pgb-pack.sel{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}
#page-pubg .pgb-clear{display:block;margin:6px 0 0;padding:6px 0;border:0;background:none;color:var(--muted);font:inherit;font-size:13px;letter-spacing:.06em;cursor:pointer}
#page-pubg .pgb-sep{border:0;border-top:1px solid var(--line-strong);margin:16px 0}
#page-pubg .pgb-badge{display:block;padding:10px 14px;border-radius:999px;margin:0 0 12px;font-size:14px;font-weight:700;background:rgba(245,190,60,.16);border:1px solid rgba(245,190,60,.5);color:var(--text-strong)}
#page-pubg .pgb-badge.ok{background:var(--success-soft);border-color:rgba(52,211,153,.28);color:var(--success)}
#page-pubg .pgb-badge.load{background:var(--primary-soft);border-color:var(--primary-line);color:var(--primary)}
#page-pubg .pgbin{position:relative}
#page-pubg .pgbin input{padding-right:46px}
#page-pubg .pgbdot{position:absolute;right:14px;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;border:2px solid var(--line-strong);box-sizing:border-box}
#page-pubg .pgbdot.load{border-color:var(--primary);border-top-color:transparent;animation:pgbs .8s linear infinite}
#page-pubg .pgbdot.ok{background:var(--success);border-color:var(--success)}
#page-pubg .pgbdot.err{background:var(--danger);border-color:var(--danger)}
@keyframes pgbs{to{transform:rotate(360deg)}}
#page-pubg #pgbV{margin-top:12px}
#page-pubg .pgbcard{padding:12px 14px;border-radius:14px;margin:0 0 10px;font-size:15px;line-height:1.5;color:var(--text-strong)}
#page-pubg .pgbcard small{display:block;color:var(--muted);margin-top:6px;font-size:12px}
#page-pubg .pgbcard.load{background:var(--primary-soft);border:1px solid var(--primary-line)}
#page-pubg .pgbcard.ok{background:var(--success-soft);border:1px solid rgba(52,211,153,.28)}
#page-pubg .pgbcard.err{background:var(--danger-soft);color:var(--danger);font-weight:600}
#page-pubg .pgb-retry{margin-top:8px;padding:8px 16px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:13px}
#page-pubg #pgbPay{margin-top:14px;text-transform:uppercase;letter-spacing:.02em}
#page-pubg #pgbPay:disabled{opacity:.45}
#page-pubg .pgb-done{text-align:center;padding:10px 0 4px}
#page-pubg .pgb-done h2{margin:0 0 8px}
#page-pubg .pgb-done p{margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.5}
`;
  document.head.appendChild(st);

  const pg=document.createElement('section');
  pg.id='page-pubg';pg.className='page hidden';
  const host=document.getElementById('page-service');
  if(host&&host.parentNode)host.after(pg);else (document.querySelector('#appView main')||document.body).appendChild(pg);

  let packs=null,sel=null,reqId=null,busy=false,bal=0,okPid=null,info=null,vstate='',vmsg='',canRetry=false,timer=null,seq=0,conf=false;
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const curPid=()=>(($('pgbPid')&&$('pgbPid').value)||'').replace(/\s/g,'');
  const curPack=()=>packs&&packs.find(x=>String(x.id)===String(sel));
  const phoneNorm=()=>{const v=($('pgbPhone')&&$('pgbPhone').value)||'';return typeof normPhone==='function'?normPhone(v):v.replace(/\D/g,'');};
  const msg=(t,c)=>{const m=$('pgbMsg');if(m){m.className='msg '+(c||'');m.textContent=t;}};
  // Compte vérifié par le fournisseur (Global) pour l'ID actuellement saisi
  const verified=()=>vstate==='ok'&&okPid===curPid()&&!!(info&&info.verified&&info.player_name);
  const ready=()=>verified()&&conf;

  // Page « Recharger Pubg Mobile » : s'affiche comme la page de commande des autres services
  const baseShow=window.showPage;
  window.showPage=function(p){
    if(p==='pubg'){
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
<div class="page-title"><button id="pgbBack" class="back" type="button">← Retour aux services</button></div>
<div id="pgbTop">
  <h1 class="svc-title">Recharger Pubg Mobile<span class="svc-badge svc-badge-auto">Auto</span></h1>
  <div id="pgbRange" class="pgb-price">—</div>
  <div id="pgbPacks"></div>
  <button type="button" id="pgbClear" class="pgb-clear hidden">EFFACER</button>
</div>
<hr class="pgb-sep">
<div id="pgbPrice" class="pgb-price hidden">—</div>
<div id="pgbCard" class="card card-pad">
  <div id="pgbBadge" class="pgb-badge">Vérification requise</div>
  <div class="field">
    <label for="pgbPid">ID joueur PUBG Mobile</label>
    <div class="pgbin"><input id="pgbPid" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="ID"><span id="pgbDot" class="pgbdot"></span></div>
    <p class="field-help">Vérification ID requise pour Pubg Mobile Automatique.</p>
    <p class="field-help">Réservé aux comptes PUBG Mobile Global.</p>
    <div id="pgbV"></div>
  </div>
  <div class="field">
    <label for="pgbPhone">Ton numéro WhatsApp</label>
    <input id="pgbPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="ex. 37 12 34 56">
    <p class="field-help">Obligatoire · pour te prévenir dès que c'est prêt</p>
  </div>
  <div class="pay-wallet-card selected">
    <span class="pay-wallet-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16.5" cy="14" r="1.2"/></svg></span>
    <span class="pay-wallet-info"><span class="pay-wallet-name">Paiement avec ton portefeuille</span><span class="pay-wallet-desc" id="pgbBal">Solde : …</span></span>
    <button type="button" class="pay-wallet-add" id="pgbAddFunds">+ Fonds</button>
  </div>
  <div id="pgbPayHint" class="pay-wallet-hint hidden" role="status"></div>
  <button id="pgbPay" class="primary-btn" type="button">Acheter maintenant</button>
  <div id="pgbMsg" class="msg"></div>
  <p class="note">Vérifie soigneusement ton ID joueur avant de confirmer. Remboursement automatique si la recharge échoue.</p>
</div>`;
    $('pgbBack').onclick=()=>showPage('services');
    $('pgbPacks').onclick=e=>{
      const b=e.target.closest('[data-pack]');if(!b)return;
      sel=b.dataset.pack;renderPacks();msg('');paint();
    };
    $('pgbClear').onclick=()=>{sel=null;renderPacks();msg('');paint();};
    $('pgbPid').addEventListener('input',()=>{
      clearTimeout(timer);seq++;okPid=null;info=null;vstate='';vmsg='';conf=false;
      if(curPid().length>=8)timer=setTimeout(check,600);
      paint();
    });
    $('pgbPhone').addEventListener('input',()=>{
      try{const c=$('custPhone');if(c)c.value=$('pgbPhone').value;if(typeof phoneKey==='function'){const k=phoneKey();if(k)localStorage.setItem(k,$('pgbPhone').value);}}catch(_){}
      paint();
    });
    $('pgbPay').onclick=pay;
    $('pgbAddFunds').onclick=()=>{showPage('wallet');setTimeout(()=>{const b=$('walletAddBtn');if(b)b.click();},60);};
  }

  function renderPacks(){
    const chip=x=>'<button type="button" class="pgb-pack'+(String(x.id)===String(sel)?' sel':'')+'" data-pack="'+esc(x.id)+'" aria-label="'+esc(x.label)+'">'+esc(x.label)+'</button>';
    $('pgbPacks').innerHTML=packs.length?'<div class="pgb-packs">'+packs.map(chip).join('')+'</div>':'<p class="field-help">Aucun pack disponible</p>';
  }

  function paint(){
    if(!$('pgbPacks'))return;
    const p=curPack();
    $('pgbDot').className='pgbdot '+vstate;
    const bd=$('pgbBadge');
    // Compte vérifié : la carte « Compte PUBG confirmé » ci-dessous suffit, on masque le badge pour éviter le doublon.
    bd.style.display=verified()?'none':'';
    if(verified()){bd.className='pgb-badge ok';bd.textContent='✓ Compte vérifié';}
    else if(vstate==='load'){bd.className='pgb-badge load';bd.textContent='Vérification en cours…';}
    else{bd.className='pgb-badge';bd.textContent='Vérification requise';}
    const v=$('pgbV');
    if(vstate==='load')v.innerHTML='<div class="pgbcard load">Vérification du compte en cours…</div>';
    else if(verified()){
      v.innerHTML='<div class="pgbcard ok"><b>✓ Compte PUBG confirmé</b><small>Nom du joueur</small><b id="pgbName"></b><small>ID joueur</small>'+esc(okPid)+(info&&info.region?'<small>Serveur</small>'+esc(info.region):'')+'</div>'
        +'<label class="terms"><input type="checkbox" id="pgbConf"'+(conf?' checked':'')+'><span>Je confirme que ce compte est le mien</span></label>';
      $('pgbName').textContent=(info&&info.player_name)||'—';
      $('pgbConf').onchange=()=>{conf=$('pgbConf').checked;paint();};
    }
    else if(vstate==='err'){
      v.innerHTML='<div class="pgbcard err">'+esc(vmsg)+(canRetry?'<br><button type="button" id="pgbRetry" class="pgb-retry">Réessayer</button>':'')+'</div>';
      if(canRetry)$('pgbRetry').onclick=check;
    }
    else v.innerHTML='';
    // En haut : fourchette de prix toujours visible. Sous les packs : prix du pack choisi, avec EFFACER.
    if(packs&&packs.length){const pr=packs.map(x=>Number(x.price_htg));$('pgbRange').textContent=fmt(Math.min(...pr))+' – '+fmt(Math.max(...pr))+' HTG';}
    else $('pgbRange').textContent='—';
    $('pgbPrice').classList.toggle('hidden',!p);
    $('pgbClear').classList.toggle('hidden',!p);
    if(p)$('pgbPrice').textContent=fmt(p.price_htg)+' HTG';
    $('pgbBal').textContent='Solde : '+fmt(bal)+' HTG';
    const h=$('pgbPayHint');
    if(p&&bal<Number(p.price_htg)){h.textContent='Solde insuffisant : il te manque '+fmt(Number(p.price_htg)-bal)+' HTG. Ajoute des fonds pour continuer.';h.classList.remove('hidden');}
    else h.classList.add('hidden');
    // Bouton grisé tant qu'un pack n'est pas choisi et que le compte n'est pas vérifié et confirmé.
    $('pgbPay').disabled=busy||!p||!ready();
    $('pgbPay').textContent=busy?'Paiement en cours…':'Acheter maintenant';
  }

  // Vérifie l'ID chez le fournisseur (lecture seule, aucun débit). Le résultat est enregistré côté serveur :
  // pubg_purchase refuse tout débit sans vérification réussie de moins de 30 minutes pour cet ID.
  async function check(){
    const pid=curPid(),my=++seq;
    if(!/^[0-9]{5,20}$/.test(pid)){vstate='err';vmsg='ID joueur invalide : vérifie les chiffres saisis.';canRetry=false;okPid=null;info=null;return paint();}
    vstate='load';paint();
    try{
      const {data,error}=await sb.functions.invoke('pubg-topup',{body:{action:'validate',playerId:pid}});
      if(my!==seq||curPid()!==pid)return;
      okPid=null;info=null;
      if(error||!data?.ok||data.valid!==true||!data.player_name){
        const reason=data?.error;
        vmsg=reason==='player_name_unavailable'?'Le fournisseur n’a pas renvoyé le nom du joueur. Paiement bloqué.':
          reason==='provider_validation_unsupported'?'La vérification PUBG n’est pas prise en charge par le fournisseur.':
          reason==='player_not_verified'?'Aucun compte PUBG Mobile trouvé avec cet ID.':
          reason==='rate_limited'?'Trop de vérifications. Réessaie dans quelques minutes.':
          'Vérification indisponible pour le moment.';
        vstate='err';canRetry=reason!=='player_not_verified';return paint();
      }
      if(data.region&&!/global|international/i.test(String(data.region))){
        vmsg='Ce service est réservé aux comptes PUBG Mobile Global.';
        vstate='err';canRetry=false;return paint();
      }
      okPid=pid;info={player_name:data.player_name,region:data.region||'',verified:true};
      vstate='ok';paint();
    }catch(_){
      if(my!==seq)return;
      okPid=null;info=null;
      vmsg='Vérification indisponible pour le moment.';
      vstate='err';canRetry=true;paint();
    }
  }

  function done(){
    $('pgbTop').style.display='none';
    $('pgbPrice').style.display='none';
    document.querySelectorAll('#page-pubg .pgb-sep').forEach(e=>e.style.display='none');
    $('pgbCard').innerHTML='<div class="pgb-done"><div class="sv-check">✓</div><h2>Commande reçue</h2><p>Ta recharge UC sera traitée automatiquement après confirmation du fournisseur. Si elle échoue, ton solde est remboursé automatiquement.</p><button type="button" id="pgbOrders" class="primary-btn">Voir mes commandes</button><button type="button" id="pgbAgain" class="secondary-btn" style="margin-top:10px">Commander à nouveau</button></div>';
    $('pgbOrders').onclick=()=>{showPage('orders');try{loadMyOrders();}catch(_){}};
    $('pgbAgain').onclick=()=>open();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function pay(){
    if(busy)return;
    const pid=curPid(),ph=phoneNorm(),p=curPack();
    if(!p)return msg('Choisis un pack.','err');
    if(vstate==='load')return msg('Vérification du compte en cours. Patiente un instant.','err');
    if(!verified())return msg('Vérifie d’abord ton ID joueur PUBG.','err');
    if(!conf)return msg('Coche la case pour confirmer que ce compte est le tien.','err');
    if(ph.length<11)return msg('Numéro invalide. Exemple : 37 12 34 56.','err');
    busy=true;paint();msg('');
    if(!reqId)reqId=uuid();
    let r=null,err=null;
    try{const x=await sb.rpc('pubg_purchase',{p_request_id:reqId,p_pack_id:sel,p_player_id:pid,p_phone:ph,p_confirmed:true});r=x.data;err=x.error;}catch(e){err=e;}
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
    const M={insufficient_funds:'Solde insuffisant. Ajoute des fonds dans ton portefeuille.',service_unavailable:'Ce service est indisponible pour le moment.',invalid_input:'Informations invalides. Vérifie ton ID joueur et ton numéro.',unauthenticated:'Session expirée. Reconnecte-toi.',confirmation_required:'Coche la case pour confirmer que ce compte est le tien.',player_not_found:'Aucun compte PUBG Mobile reconnu avec cet ID.',wrong_region:'Ce service est réservé aux comptes PUBG Mobile Global.'};
    msg(M[r.status]||'Paiement impossible.','err');
  }

  async function open(){
    clearTimeout(timer);
    sel=null;reqId=null;okPid=null;info=null;vstate='';vmsg='';canRetry=false;conf=false;busy=false;seq++;
    build();
    showPage('pubg');
    $('pgbPacks').innerHTML='<p class="field-help">Chargement…</p>';
    try{
      if(!packs){const x=await sb.from('pubg_packs').select('id,label,price_htg').eq('active',true).order('sort');if(x.error)throw x.error;packs=x.data||[];}
      const w=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle();bal=Number(w&&w.data&&w.data.balance_htg||0);
      renderPacks();
      try{if(typeof restorePhone==='function')restorePhone();}catch(_){}
      $('pgbPhone').value=($('custPhone')&&$('custPhone').value)||'';
      paint();
    }catch(_){
      $('pgbPacks').innerHTML='<p class="field-help">Impossible de charger les packs. Réessaie.</p><button type="button" class="secondary-btn" id="pgbReload">Réessayer</button>';
      $('pgbReload').onclick=open;
    }
  }
  const prev=window.openService;
  window.openService=function(id){return id==='PUBG Mobile (Auto)'?open():prev.apply(this,arguments);};
})();
