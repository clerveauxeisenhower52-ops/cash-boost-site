/* Recharger Blood Strike : page de commande (style Izy Store : packs compacts, une seule page, bouton Acheter maintenant).
   L'ID joueur est vérifié automatiquement avant le paiement (fonction bloodstrike-validate, via shop2topup).
   Si la vérification est indisponible (quota, panne) ou ne reconnaît pas l'ID, repli sur la double saisie avec case de confirmation. Aucun remboursement si l'ID est incorrect dans ce cas. */
(function(){
  const st=document.createElement('style');
  st.textContent=`
#page-bloodstrike .bs-price{margin:6px 0 4px;font:700 28px 'Space Grotesk','Inter',system-ui,sans-serif;color:var(--text-strong)}
#page-bloodstrike .bs-packs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
#page-bloodstrike .bs-pack{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:14px;cursor:pointer}
#page-bloodstrike .bs-pack:active{transform:scale(.97)}
#page-bloodstrike .bs-pack.sel{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}
#page-bloodstrike .bs-gold{flex:none;display:block}
#page-bloodstrike .bs-clear{display:block;margin:6px 0 0;padding:6px 0;border:0;background:none;color:var(--muted);font:inherit;font-size:13px;letter-spacing:.06em;cursor:pointer}
#page-bloodstrike .bs-sep{border:0;border-top:1px solid var(--line-strong);margin:16px 0}
#page-bloodstrike .bs-badge{display:block;padding:10px 14px;border-radius:999px;margin:0 0 12px;font-size:14px;font-weight:700;background:rgba(245,190,60,.16);border:1px solid rgba(245,190,60,.5);color:var(--text-strong)}
#page-bloodstrike .bs-badge.ok{background:var(--success-soft);border-color:rgba(52,211,153,.28);color:var(--success)}
#page-bloodstrike .bs-badge.load{background:var(--primary-soft);border-color:var(--primary-line);color:var(--primary)}
#page-bloodstrike .bs-warn{padding:12px 14px;border-radius:14px;margin:0 0 12px;font-size:14px;line-height:1.5;background:var(--danger-soft);color:var(--danger);font-weight:600}
#page-bloodstrike .bs-err{margin-top:8px;font-size:13px;font-weight:600;color:var(--danger)}
#page-bloodstrike .bsin{position:relative}
#page-bloodstrike .bsin input{padding-right:46px}
#page-bloodstrike .bsdot{position:absolute;right:14px;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;border:2px solid var(--line-strong);box-sizing:border-box}
#page-bloodstrike .bsdot.load{border-color:var(--primary);border-top-color:transparent;animation:bss .8s linear infinite}
#page-bloodstrike .bsdot.ok{background:var(--success);border-color:var(--success)}
#page-bloodstrike .bsdot.err{background:var(--danger);border-color:var(--danger)}
@keyframes bss{to{transform:rotate(360deg)}}
#page-bloodstrike #bsV{margin-top:12px}
#page-bloodstrike .bscard{padding:12px 14px;border-radius:14px;margin:0 0 10px;font-size:15px;line-height:1.5;color:var(--text-strong)}
#page-bloodstrike .bscard small{display:block;color:var(--muted);margin-top:6px;font-size:12px}
#page-bloodstrike .bscard.load{background:var(--primary-soft);border:1px solid var(--primary-line)}
#page-bloodstrike .bscard.ok{background:var(--success-soft);border:1px solid rgba(52,211,153,.28)}
#page-bloodstrike .bscard.err{background:var(--danger-soft);color:var(--danger);font-weight:600}
#page-bloodstrike .bs-retry{margin-top:8px;padding:8px 16px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:13px}
#page-bloodstrike #bsPay{margin-top:14px;text-transform:uppercase;letter-spacing:.02em}
#page-bloodstrike #bsPay:disabled{opacity:.45}
#page-bloodstrike .bs-done{text-align:center;padding:10px 0 4px}
#page-bloodstrike .bs-done h2{margin:0 0 8px}
#page-bloodstrike .bs-done p{margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.5}
`;
  document.head.appendChild(st);

  const pg=document.createElement('section');
  pg.id='page-bloodstrike';pg.className='page hidden';
  const host=document.getElementById('page-service');
  if(host&&host.parentNode)host.after(pg);else (document.querySelector('#appView main')||document.body).appendChild(pg);

  let packs=null,sel=null,reqId=null,busy=false,bal=0,conf=false;
  let okPid=null,info=null,vstate='',vmsg='',canRetry=false,timer=null,seq=0;
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const clean=id=>(($(id)&&$(id).value)||'').replace(/\s/g,'');
  const curPid=()=>clean('bsPid');
  const curPid2=()=>clean('bsPid2');
  const curPack=()=>packs&&packs.find(x=>String(x.id)===String(sel));
  const phoneNorm=()=>{const v=($('bsPhone')&&$('bsPhone').value)||'';return typeof normPhone==='function'?normPhone(v):v.replace(/\D/g,'');};
  const msg=(t,c)=>{const m=$('bsMsg');if(m){m.className='msg '+(c||'');m.textContent=t;}};
  const fmtOk=()=>/^[0-9]{5,20}$/.test(curPid());
  const pid2Ok=()=>fmtOk()&&curPid()===curPid2();
  // Compte vérifié par le fournisseur (cas normal) ou, si la vérification est indisponible ou ne reconnaît pas l'ID, ID saisi deux fois.
  const verified=()=>vstate==='ok'&&okPid===curPid()&&!!(info&&info.player_name);
  const fallback=()=>vstate==='unavail'&&pid2Ok();
  const ready=()=>conf&&(verified()||fallback());

  // Lingots d'or affichés à la place du texte « BC » (ex. « 51 BC » devient « 51 » + lingots).
  const GOLD='<svg class="bs-gold" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
    +'<path d="M8.5 11 10 6.5h4L15.5 11z" fill="#fbd75b" stroke="#b7791f" stroke-width="1.2" stroke-linejoin="round"/>'
    +'<path d="M2.5 18 5 11.5h14L21.5 18z" fill="#f5c542" stroke="#b7791f" stroke-width="1.2" stroke-linejoin="round"/>'
    +'<path d="M6.2 14h11.6" stroke="#fff3b0" stroke-width="1.2" stroke-linecap="round"/></svg>';
  const packLabel=l=>{const m=/^\s*(\d+)\s*BC\s*$/i.exec(l||'');return m?esc(m[1])+GOLD:esc(l);};

  const baseShow=window.showPage;
  window.showPage=function(p){
    if(p==='bloodstrike'){
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
<div class="page-title"><button id="bsBack" class="back" type="button">← Retour aux services</button></div>
<div id="bsTop">
  <h1 class="svc-title">Blood Strike Automatique<span class="svc-badge svc-badge-auto">Auto</span></h1>
  <div id="bsRange" class="bs-price">—</div>
  <div id="bsPacks"></div>
  <button type="button" id="bsClear" class="bs-clear hidden">EFFACER</button>
</div>
<hr class="bs-sep">
<div id="bsPrice" class="bs-price hidden">—</div>
<div id="bsCard" class="card card-pad">
  <div id="bsBadge" class="bs-badge">Vérification requise</div>
  <div class="field">
    <label for="bsPid">ID joueur Blood Strike</label>
    <div class="bsin"><input id="bsPid" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="ID"><span id="bsDot" class="bsdot"></span></div>
    <p class="field-help">Vérification ID requise pour Blood Strike Automatique.</p>
    <div id="bsV"></div>
  </div>
  <div id="bsFb" class="hidden">
    <div class="bs-warn">Compte non vérifié automatiquement. Saisis ton ID une deuxième fois et confirme-le. Aucun remboursement si l’ID est incorrect.</div>
    <div class="field">
      <label for="bsPid2">Confirme ton ID joueur</label>
      <input id="bsPid2" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Saisis-le une deuxième fois">
      <div id="bsPidErr" class="bs-err"></div>
    </div>
    <label class="terms"><input type="checkbox" id="bsConf2"><span>J’ai vérifié mon ID</span></label>
  </div>
  <div class="field">
    <label for="bsPhone">Ton numéro WhatsApp</label>
    <input id="bsPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="ex. 37 12 34 56">
    <p class="field-help">Obligatoire · pour recevoir le suivi de ta recharge</p>
  </div>
  <div class="pay-wallet-card selected">
    <span class="pay-wallet-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16.5" cy="14" r="1.2"/></svg></span>
    <span class="pay-wallet-info"><span class="pay-wallet-name">Paiement avec ton portefeuille</span><span class="pay-wallet-desc" id="bsBal">Solde : …</span></span>
    <button type="button" class="pay-wallet-add" id="bsAddFunds">+ Fonds</button>
  </div>
  <div id="bsPayHint" class="pay-wallet-hint hidden" role="status"></div>
  <button id="bsPay" class="primary-btn" type="button">Acheter maintenant</button>
  <div id="bsMsg" class="msg"></div>
  <p class="note">Vérifie soigneusement ton identifiant avant de confirmer. Remboursement automatique uniquement si le fournisseur refuse la commande.</p>
</div>`;
    $('bsBack').onclick=()=>showPage('services');
    $('bsPacks').onclick=e=>{
      const b=e.target.closest('[data-pack]');if(!b)return;
      sel=b.dataset.pack;renderPacks();msg('');paint();
    };
    $('bsClear').onclick=()=>{sel=null;renderPacks();msg('');paint();};
    $('bsPid').addEventListener('input',()=>{
      clearTimeout(timer);seq++;okPid=null;info=null;vstate='';vmsg='';conf=false;
      const c2=$('bsConf2');if(c2)c2.checked=false;
      if(curPid().length>=8)timer=setTimeout(check,600);
      paint();
    });
    $('bsPid2').addEventListener('input',()=>{conf=false;$('bsConf2').checked=false;paint();});
    $('bsConf2').onchange=()=>{conf=$('bsConf2').checked&&pid2Ok();if(!conf)$('bsConf2').checked=false;paint();};
    $('bsPhone').addEventListener('input',()=>{
      try{const c=$('custPhone');if(c)c.value=$('bsPhone').value;if(typeof phoneKey==='function'){const k=phoneKey();if(k)localStorage.setItem(k,$('bsPhone').value);}}catch(_){}
      paint();
    });
    $('bsPay').onclick=pay;
    $('bsAddFunds').onclick=()=>{showPage('wallet');setTimeout(()=>{const b=$('walletAddBtn');if(b)b.click();},60);};
  }

  function renderPacks(){
    const chip=x=>'<button type="button" class="bs-pack'+(String(x.id)===String(sel)?' sel':'')+'" data-pack="'+esc(x.id)+'" aria-label="'+esc(x.label)+'">'+packLabel(x.label)+'</button>';
    $('bsPacks').innerHTML=packs.length?'<div class="bs-packs">'+packs.map(chip).join('')+'</div>':'<p class="field-help">Aucun pack disponible</p>';
  }

  function paint(){
    if(!$('bsPacks'))return;
    const p=curPack();
    $('bsDot').className='bsdot '+(vstate==='unavail'?'':vstate);
    const bd=$('bsBadge');
    if(vstate==='ok'&&info&&info.player_name){bd.className='bs-badge ok';bd.textContent='✓ Compte vérifié';}
    else if(vstate==='load'){bd.className='bs-badge load';bd.textContent='Vérification en cours…';}
    else{bd.className='bs-badge';bd.textContent='Vérification requise';}
    const v=$('bsV');
    if(vstate==='load')v.innerHTML='<div class="bscard load">Vérification du compte en cours…</div>';
    else if(vstate==='ok'&&info&&info.player_name){
      v.innerHTML='<div class="bscard ok"><b>✓ Compte Blood Strike confirmé</b><small>Nom du joueur</small><b id="bsName"></b>'
        +'<small>ID joueur</small>'+esc(okPid)+'</div>'
        +'<label class="terms"><input type="checkbox" id="bsConf"'+(conf?' checked':'')+'><span>Je confirme que ce compte est le mien</span></label>';
      $('bsName').textContent=info.player_name;
      $('bsConf').onchange=()=>{conf=$('bsConf').checked;paint();};
    }
    else if(vstate==='err'||vstate==='unavail'){
      v.innerHTML='<div class="bscard err">'+esc(vmsg)+(canRetry?'<br><button type="button" id="bsRetry" class="bs-retry">Réessayer</button>':'')+'</div>';
      if(canRetry)$('bsRetry').onclick=check;
    }
    else v.innerHTML='';
    $('bsFb').classList.toggle('hidden',vstate!=='unavail');
    const a=curPid(),b=curPid2(),e=$('bsPidErr');
    if(vstate==='unavail'&&b&&a!==b)e.textContent='Les deux ID ne sont pas identiques.';
    else e.textContent='';
    if(conf&&!ready()){conf=false;const c2=$('bsConf2');if(c2)c2.checked=false;}
    // En haut : fourchette de prix toujours visible. Sous les packs : prix du pack choisi (comme Izy Store), avec EFFACER.
    if(packs&&packs.length){const pr=packs.map(x=>Number(x.price_htg));$('bsRange').textContent=fmt(Math.min(...pr))+' – '+fmt(Math.max(...pr))+' HTG';}
    else $('bsRange').textContent='—';
    $('bsPrice').classList.toggle('hidden',!p);
    $('bsClear').classList.toggle('hidden',!p);
    if(p)$('bsPrice').textContent=fmt(p.price_htg)+' HTG';
    $('bsBal').textContent='Solde : '+fmt(bal)+' HTG';
    const h=$('bsPayHint');
    if(p&&bal<Number(p.price_htg)){h.textContent='Solde insuffisant : il te manque '+fmt(Number(p.price_htg)-bal)+' HTG. Ajoute des fonds pour continuer.';h.classList.remove('hidden');}
    else h.classList.add('hidden');
    // Bouton grisé tant qu'un pack n'est pas choisi et que le compte n'est pas vérifié et confirmé.
    $('bsPay').disabled=busy||!p||!ready();
    $('bsPay').textContent=busy?'Paiement en cours…':'Acheter maintenant';
  }

  // Vérifie l'ID chez le fournisseur (lecture seule, aucun débit).
  // ID introuvable (PLAYER_NOT_FOUND) : paiement bloqué. ID non reconnu ou vérification indisponible (quota, panne) : repli sur la double saisie.
  async function check(){
    const pid=curPid(),my=++seq;
    if(!fmtOk()){vstate='err';vmsg='ID joueur invalide : vérifie les chiffres saisis.';canRetry=false;return paint();}
    vstate='load';paint();
    const unavail=m=>{vstate='unavail';vmsg=m||'La vérification automatique est indisponible pour le moment.';canRetry=true;okPid=null;info=null;paint();};
    try{
      const {data,error}=await sb.functions.invoke('bloodstrike-validate',{body:{player_id:pid}});
      if(my!==seq||curPid()!==pid)return;
      if(error||!data)return unavail();
      if(data.status==='valid'&&data.player_name){
        okPid=pid;info={player_name:data.player_name};vstate='ok';return paint();
      }
      if(data.status==='invalid'||data.status==='invalid_format'){
        vstate='err';vmsg='ID joueur introuvable. Vérifie les chiffres saisis.';canRetry=false;okPid=null;info=null;return paint();
      }
      if(data.status==='not_recognized')return unavail('ID non reconnu par le fournisseur. Vérifie-le. Si tu es sûr de ton ID, saisis-le une deuxième fois pour continuer.');
      unavail();
    }catch(_){
      if(my!==seq)return;
      unavail();
    }
  }

  function done(){
    $('bsTop').style.display='none';
    $('bsPrice').style.display='none';
    document.querySelectorAll('#page-bloodstrike .bs-sep').forEach(e=>e.style.display='none');
    $('bsCard').innerHTML='<div class="bs-done"><div class="sv-check">✓</div><h2>Commande enregistrée</h2><p>Ta recharge Blood Strike sera traitée automatiquement. Si le fournisseur refuse la commande, ton solde est remboursé automatiquement. Aucun remboursement si l’ID joueur est incorrect.</p><button type="button" id="bsOrders" class="primary-btn">Voir mes commandes</button><button type="button" id="bsAgain" class="secondary-btn" style="margin-top:10px">Commander à nouveau</button></div>';
    $('bsOrders').onclick=()=>{showPage('orders');try{loadMyOrders();}catch(_){}};
    $('bsAgain').onclick=()=>open();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function pay(){
    if(busy)return;
    const pid=curPid(),ph=phoneNorm(),p=curPack();
    if(!p)return msg('Choisis un pack.','err');
    if(vstate==='err')return msg('ID joueur introuvable. Corrige-le pour continuer.','err');
    if(vstate==='load')return msg('Vérification du compte en cours. Patiente un instant.','err');
    if(vstate==='unavail'&&!pid2Ok())return msg('Saisis ton ID joueur deux fois, de la même façon.','err');
    if(!verified()&&!fallback())return msg('Le compte Blood Strike doit être vérifié avant le paiement.','err');
    if(!conf)return msg('Coche la case pour confirmer ton compte.','err');
    if(ph.length<11)return msg('Numéro invalide. Exemple : 37 12 34 56.','err');
    busy=true;paint();msg('');
    if(!reqId)reqId=uuid();
    let r=null,err=null;
    try{const x=await sb.rpc('blood_strike_purchase',{p_request_id:reqId,p_pack_id:sel,p_player_id:pid,p_phone:ph,p_confirmed:true});r=x.data;err=x.error;}catch(e){err=e;}
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
    const M={insufficient_funds:'Solde insuffisant. Ajoute des fonds dans ton portefeuille.',service_unavailable:'Ce service est indisponible pour le moment.',invalid_input:'Informations invalides. Vérifie ton ID joueur et ton numéro.',unauthenticated:'Session expirée. Reconnecte-toi.',confirmation_required:'Coche la case pour confirmer ton compte.',id_not_verified:'Vérification de l’ID impossible pour le moment. Modifie puis ressaisis ton ID, ou réessaie dans un instant.',player_not_found:'ID joueur introuvable. Vérifie les chiffres saisis.'};
    msg(M[r.status]||'Paiement impossible.','err');
  }

  async function open(){
    clearTimeout(timer);
    sel=null;reqId=null;okPid=null;info=null;vstate='';vmsg='';canRetry=false;conf=false;busy=false;seq++;
    build();
    showPage('bloodstrike');
    $('bsPacks').innerHTML='<p class="field-help">Chargement…</p>';
    try{
      if(!packs){const x=await sb.from('blood_strike_packs').select('id,label,kind,price_htg').eq('active',true).order('sort');if(x.error)throw x.error;packs=x.data||[];}
      const w=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle();bal=Number(w&&w.data&&w.data.balance_htg||0);
      renderPacks();
      try{if(typeof restorePhone==='function')restorePhone();}catch(_){}
      $('bsPhone').value=($('custPhone')&&$('custPhone').value)||'';
      paint();
    }catch(_){
      $('bsPacks').innerHTML='<p class="field-help">Impossible de charger les packs. Réessaie.</p><button type="button" class="secondary-btn" id="bsReload">Réessayer</button>';
      $('bsReload').onclick=open;
    }
  }
  const prev=window.openService;
  window.openService=function(id){return id==='Blood Strike'?open():prev.apply(this,arguments);};
})();
