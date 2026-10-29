/* PUBG Mobile (Auto) : page de commande (même présentation que les autres services), achat de packs avec le solde (fonction SQL pubg_purchase) + vérification automatique du compte */
(function(){
  const st=document.createElement('style');
  st.textContent=`
#page-pubg .pgb-packs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 16px}
#page-pubg .pgb-pack{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;min-height:64px;padding:12px 14px;border:1px solid var(--line-strong);border-radius:14px;background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:15px;text-align:left;cursor:pointer}
#page-pubg .pgb-pack:active{transform:scale(.97)}
#page-pubg .pgb-pack-p{font:700 13px 'Space Grotesk','Inter',system-ui,sans-serif;color:var(--muted)}
#page-pubg .pgb-pack.sel{border-color:var(--primary);background:var(--primary-soft)}
#page-pubg .pgb-pack.sel .pgb-pack-p{color:var(--primary)}
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
#page-pubg .pgb-done{text-align:center;padding:10px 0 4px}
#page-pubg .pgb-done h2{margin:0 0 8px}
#page-pubg .pgb-done p{margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.5}
`;
  document.head.appendChild(st);

  const pg=document.createElement('section');
  pg.id='page-pubg';pg.className='page hidden';
  const host=document.getElementById('page-service');
  if(host&&host.parentNode)host.after(pg);else (document.querySelector('#appView main')||document.body).appendChild(pg);

  let packs=null,sel=null,reqId=null,busy=false,bal=0,okPid=null,info=null,vstate='',vmsg='',canRetry=false,timer=null,seq=0,conf=false,io=null;
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const curPid=()=>(($('pgbPid')&&$('pgbPid').value)||'').replace(/\s/g,'');
  const curPack=()=>packs&&packs.find(x=>String(x.id)===String(sel));
  const phoneNorm=()=>{const v=($('pgbPhone')&&$('pgbPhone').value)||'';return typeof normPhone==='function'?normPhone(v):v.replace(/\D/g,'');};
  const msg=(t,c)=>{const m=$('pgbMsg');if(m){m.className='msg '+(c||'');m.textContent=t;}};
  const goTo=id=>{const e=$(id);if(e)e.scrollIntoView({behavior:'smooth',block:'center'});};

  // Page « PUBG Mobile (Auto) » : s'apgbiche comme la page de commande des autres services
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
<h1 class="svc-title">PUBG Mobile (Auto)<span class="svc-badge svc-badge-auto">Auto</span></h1>
<div id="pgbProgress" class="op" aria-label="Progression de la commande">
  <button type="button" class="op-step" data-go="pgbSecPack"><i>1</i><span>Pack</span></button>
  <button type="button" class="op-step" data-go="pgbSecAcc"><i>2</i><span>Compte</span></button>
  <button type="button" class="op-step" data-go="pgbSecPay"><i>3</i><span>Paiement</span></button>
</div>
<div id="pgbBar" class="ob"><div class="ob-total"><small>Total à payer</small><strong id="pgbBarTotal">—</strong></div><button id="pgbBarBtn" type="button" class="primary-btn">Confirmer</button></div>
<div id="pgbCard" class="card card-pad">
  <div class="section" id="pgbSecPack">
    <div class="section-head"><span class="step">1</span><div><h2>Choisir le pack</h2><p id="pgbRange">Choisis la valeur de ton pack</p></div></div>
    <div id="pgbPacks" class="pgb-packs"></div>
    <div class="summary">
      <div class="sumrow"><span>Pack</span><strong id="pgbSumPack">—</strong></div>
      <div class="sumrow total"><span>Total à payer</span><strong id="pgbSumTotal">—</strong></div>
    </div>
  </div>
  <div class="section" id="pgbSecAcc">
    <div class="section-head"><span class="step">2</span><div><h2>Compte PUBG Mobile</h2><p>Entre ton ID joueur PUBG Mobile</p></div></div>
    <div class="field">
      <label for="pgbPid">ID joueur (Player ID)</label>
      <div class="pgbin"><input id="pgbPid" inputmode="numeric" maxlength="15" autocomplete="opgb" placeholder="ex. 123456789"><span id="pgbDot" class="pgbdot"></span></div>
      <p class="field-help">Réservé aux comptes du serveur Nord-Amérique (Global).</p>
      <div id="pgbV"></div>
    </div>
    <div class="field">
      <label for="pgbPhone">Numéro WhatsApp</label>
      <input id="pgbPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="ex. 37 12 34 56">
      <p class="field-help">Obligatoire · pour te prévenir dès que c'est prêt</p>
    </div>
  </div>
  <div class="section" id="pgbSecPay">
    <div class="section-head"><span class="step">3</span><div><h2>Paiement par portefeuille</h2><p>Le montant est débité de ton solde</p></div></div>
    <div class="pay-wallet-card selected">
      <span class="pay-wallet-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16.5" cy="14" r="1.2"/></svg></span>
      <span class="pay-wallet-info"><span class="pay-wallet-name">Paiement par portefeuille</span><span class="pay-wallet-desc" id="pgbBal">Solde : …</span></span>
      <button type="button" class="pay-wallet-add" id="pgbAddFunds">+ Fonds</button>
    </div>
    <div id="pgbPayHint" class="pay-wallet-hint hidden" role="status"></div>
    <div class="security-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>Paiement sécurisé · Remboursement automatique si la recharge échoue</span>
    </div>
    <button id="pgbPay" class="primary-btn" type="button">Payer avec mon solde</button>
    <div id="pgbMsg" class="msg"></div>
    <p class="note">Vérifie ton ID joueur avant de confirmer.</p>
  </div>
</div>`;
    $('pgbBack').onclick=()=>showPage('services');
    $('pgbPacks').onclick=e=>{
      const b=e.target.closest('[data-pack]');if(!b)return;
      sel=b.dataset.pack;renderPacks();msg('');paint();
    };
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
    $('pgbBarBtn').onclick=next;
    $('pgbAddFunds').onclick=()=>{showPage('wallet');setTimeout(()=>{const b=$('walletAddBtn');if(b)b.click();},60);};
    pg.querySelectorAll('#pgbProgress .op-step').forEach(b=>b.addEventListener('click',()=>{const e=$(b.dataset.go);if(e)e.scrollIntoView({behavior:'smooth',block:'start'});}));
    // La barre collante disparaît quand le vrai bouton de paiement est à l'écran (pas de doublon)
    if(io)io.disconnect();
    if('IntersectionObserver' in window){
      io=new IntersectionObserver(es=>es.forEach(e=>{const bar=$('pgbBar');if(bar)bar.classList.toggle('ob-hidden',e.isIntersecting);}),{threshold:0.6});
      io.observe($('pgbPay'));
    }
  }

  function renderPacks(){
    const pr=packs.map(x=>x.price_htg);
    $('pgbRange').textContent=packs.length?fmt(Math.min(...pr))+' – '+fmt(Math.max(...pr))+' HTG':'Aucun pack disponible';
    $('pgbPacks').innerHTML=packs.map(x=>'<button type="button" class="pgb-pack'+(String(x.id)===String(sel)?' sel':'')+'" data-pack="'+esc(x.id)+'"><span class="pgb-pack-l">'+esc(x.label)+'</span></button>').join('');
  }

  function paint(){
    if(!$('pgbV'))return;
    const p=curPack();
    $('pgbDot').className='pgbdot '+vstate;
    const v=$('pgbV');
    if(vstate==='load')v.innerHTML='<div class="pgbcard load">Vérification en cours…</div>';
    else if(vstate==='ok'){
      v.innerHTML='<div class="pgbcard ok"><b>✓ Compte vérifié</b><small>Nom joueur</small><b id="pgbName"></b><small>ID joueur</small>'+esc(okPid)+(info&&info.region?'<small>Serveur</small>'+esc(info.region):'')+'</div>'
        +'<label class="terms"><input type="checkbox" id="pgbConf"'+(conf?' checked':'')+'><span>Je confirme que ce compte est le mien</span></label>';
      $('pgbName').textContent=(info&&info.player_name)||'—';
      $('pgbConf').onchange=()=>{conf=$('pgbConf').checked;paint();};
    }
    else if(vstate==='err'){
      v.innerHTML='<div class="pgbcard err">'+esc(vmsg)+(canRetry?'<br><button type="button" id="pgbRetry" class="pgb-retry">Réessayer</button>':'')+'</div>';
      if(canRetry)$('pgbRetry').onclick=check;
    }
    else v.innerHTML='';
    $('pgbSumPack').textContent=p?p.label:'—';
    const tot=p?fmt(p.price_htg)+' HTG':'—';
    $('pgbSumTotal').textContent=tot;$('pgbBarTotal').textContent=tot;
    $('pgbBal').textContent='Solde : '+fmt(bal)+' HTG';
    const h=$('pgbPayHint');
    if(p&&bal<Number(p.price_htg)){h.textContent='Solde insupgbisant : il te manque '+fmt(Number(p.price_htg)-bal)+' HTG. Ajoute des fonds pour continuer.';h.classList.remove('hidden');}
    else h.classList.add('hidden');
    const d1=!!p,d2=vstate==='ok'&&conf&&phoneNorm().length>=11,done=[d1,d2,false],act=done.findIndex(x=>!x);
    pg.querySelectorAll('#pgbProgress .op-step').forEach((b,i)=>{b.classList.toggle('done',done[i]);b.classList.toggle('active',i===act);});
    $('pgbProgress').style.setProperty('--op',String((d1?1:0)+(d2?1:0)));
    $('pgbPay').disabled=busy;
    $('pgbPay').textContent=busy?'Paiement en cours…':'Payer avec mon solde';
  }

  async function check(){
    const pid=curPid(),my=++seq;
    if(!/^[0-9]{5,20}$/.test(pid)){vstate='err';vmsg='Player ID invalide : vérifie les chiffres saisis.';canRetry=false;return paint();}
    vstate='load';paint();
    // FazerCards n'a pas encore été confirmé comme proposant une validation d'ID PUBG.
    // On vérifie uniquement le format; le client doit confirmer l'ID avant paiement.
    await Promise.resolve();
    if(my!==seq||curPid()!==pid)return;
    okPid=pid;info={player_name:'Validation de format uniquement',region:'Global'};
    vstate='ok';paint();
  }

  // Bouton de la barre collante : va à la prochaine étape à compléter, puis paie
  function next(){
    if(!curPack())return goTo('pgbSecPack');
    if(vstate!=='ok'||okPid!==curPid())return goTo('pgbPid');
    if(!conf)return goTo('pgbV');
    if(phoneNorm().length<11)return goTo('pgbPhone');
    pay();
  }

  function done(){
    $('pgbProgress').style.display='none';
    if(io)io.disconnect();
    $('pgbBar').classList.add('ob-hidden');
    $('pgbCard').innerHTML='<div class="pgb-done"><div class="sv-check">✓</div><h2>Commande reçue</h2><p>Tes diamants arrivent en quelques instants. Si la recharge échoue, ton solde est remboursé automatiquement.</p><button type="button" id="pgbOrders" class="primary-btn">Voir mes commandes</button><button type="button" id="pgbAgain" class="secondary-btn" style="margin-top:10px">Commander à nouveau</button></div>';
    $('pgbOrders').onclick=()=>{showPage('orders');try{loadMyOrders();}catch(_){}};
    $('pgbAgain').onclick=()=>open();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function pay(){
    if(busy)return;
    const pid=curPid(),ph=phoneNorm(),p=curPack();
    if(!p)return msg('Choisis un pack.','err');
    if(!okPid||okPid!==pid)return msg('Vérifie le format de ton Player ID.','err');
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
    const M={insupgbicient_funds:'Solde insupgbisant. Ajoute des fonds dans ton portefeuille.',service_unavailable:'Ce service est indisponible pour le moment.',invalid_input:'Informations invalides. Vérifie ton Player ID et ton numéro.',unauthenticated:'Session expirée. Reconnecte-toi.',confirmation_required:'Coche la case pour confirmer que ce compte est le tien.'};
    msg(M[r.status]||'Paiement impossible.','err');
  }

  async function open(){
    clearTimeout(timer);
    sel=null;reqId=null;okPid=null;info=null;vstate='';vmsg='';conf=false;busy=false;seq++;
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
