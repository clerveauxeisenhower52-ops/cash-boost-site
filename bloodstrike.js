/* Recharger Blood Strike : page de commande. L'ID joueur est vérifié automatiquement avant le paiement (fonction bloodstrike-validate, via shop2topup).
   Si la vérification est indisponible (quota, panne) ou ne reconnaît pas l'ID, repli sur la double saisie avec case de confirmation. Aucun remboursement si l'ID est incorrect dans ce cas. */
(function(){
  const st=document.createElement('style');
  st.textContent=`
#page-bloodstrike .bs-sub{margin:14px 0 8px;font:700 13px 'Space Grotesk','Inter',system-ui,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
#page-bloodstrike .bs-packs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 8px}
#page-bloodstrike .bs-pack{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;min-height:64px;padding:12px 14px;border:1px solid var(--line-strong);border-radius:14px;background:var(--surface-2);color:var(--text-strong);font:inherit;font-weight:600;font-size:15px;text-align:left;cursor:pointer}
#page-bloodstrike .bs-pack:active{transform:scale(.97)}
#page-bloodstrike .bs-pack-p{font:700 13px 'Space Grotesk','Inter',system-ui,sans-serif;color:var(--muted)}
#page-bloodstrike .bs-pack.sel{border-color:var(--primary);background:var(--primary-soft)}
#page-bloodstrike .bs-pack.sel .bs-pack-p{color:var(--primary)}
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
#page-bloodstrike .bs-done{text-align:center;padding:10px 0 4px}
#page-bloodstrike .bs-done h2{margin:0 0 8px}
#page-bloodstrike .bs-done p{margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.5}
`;
  document.head.appendChild(st);

  const pg=document.createElement('section');
  pg.id='page-bloodstrike';pg.className='page hidden';
  const host=document.getElementById('page-service');
  if(host&&host.parentNode)host.after(pg);else (document.querySelector('#appView main')||document.body).appendChild(pg);

  let packs=null,sel=null,reqId=null,busy=false,bal=0,conf=false,io=null;
  let okPid=null,info=null,vstate='',vmsg='',canRetry=false,timer=null,seq=0;
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const clean=id=>(($(id)&&$(id).value)||'').replace(/\s/g,'');
  const curPid=()=>clean('bsPid');
  const curPid2=()=>clean('bsPid2');
  const curPack=()=>packs&&packs.find(x=>String(x.id)===String(sel));
  const phoneNorm=()=>{const v=($('bsPhone')&&$('bsPhone').value)||'';return typeof normPhone==='function'?normPhone(v):v.replace(/\D/g,'');};
  const msg=(t,c)=>{const m=$('bsMsg');if(m){m.className='msg '+(c||'');m.textContent=t;}};
  const goTo=id=>{const e=$(id);if(e)e.scrollIntoView({behavior:'smooth',block:'center'});};
  const fmtOk=()=>/^[0-9]{5,20}$/.test(curPid());
  const pid2Ok=()=>fmtOk()&&curPid()===curPid2();
  // Compte vérifié par le fournisseur (cas normal) ou, si la vérification est indisponible ou ne reconnaît pas l'ID, ID saisi deux fois.
  const verified=()=>vstate==='ok'&&okPid===curPid()&&!!(info&&info.player_name);
  const fallback=()=>vstate==='unavail'&&pid2Ok();
  const ready=()=>conf&&(verified()||fallback());

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
<h1 class="svc-title">Recharger Blood Strike<span class="svc-badge svc-badge-auto">Auto</span></h1>
<div id="bsProgress" class="op" aria-label="Progression de la commande">
  <button type="button" class="op-step" data-go="bsSecPack"><i>1</i><span>Pack</span></button>
  <button type="button" class="op-step" data-go="bsSecAcc"><i>2</i><span>Compte</span></button>
  <button type="button" class="op-step" data-go="bsSecPay"><i>3</i><span>Paiement</span></button>
</div>
<div id="bsBar" class="ob"><div class="ob-total"><small>Total à payer</small><strong id="bsBarTotal">—</strong></div><button id="bsBarBtn" type="button" class="primary-btn">Confirmer</button></div>
<div id="bsCard" class="card card-pad">
  <div class="section" id="bsSecPack">
    <div class="section-head"><span class="step">1</span><div><h2>Sélectionner un pack</h2><p id="bsRange">Choisis la valeur de ton pack</p></div></div>
    <div id="bsPacks"></div>
    <div class="summary">
      <div class="sumrow"><span>Pack</span><strong id="bsSumPack">—</strong></div>
      <div class="sumrow total"><span>Total à payer</span><strong id="bsSumTotal">—</strong></div>
    </div>
  </div>
  <div class="section" id="bsSecAcc">
    <div class="section-head"><span class="step">2</span><div><h2>Compte Blood Strike</h2><p>Saisis ton identifiant de joueur Blood Strike.</p></div></div>
    <div class="field">
      <label for="bsPid">ID joueur Blood Strike</label>
      <div class="bsin"><input id="bsPid" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Entre ton ID joueur"><span id="bsDot" class="bsdot"></span></div>
      <p class="field-help">Ton identifiant sera vérifié automatiquement avant tout paiement.</p>
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
  </div>
  <div class="section" id="bsSecPay">
    <div class="section-head"><span class="step">3</span><div><h2>Paiement avec ton portefeuille</h2><p>Le montant sera déduit de ton solde après confirmation.</p></div></div>
    <div class="pay-wallet-card selected">
      <span class="pay-wallet-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16.5" cy="14" r="1.2"/></svg></span>
      <span class="pay-wallet-info"><span class="pay-wallet-name">Paiement avec ton portefeuille</span><span class="pay-wallet-desc" id="bsBal">Solde : …</span></span>
      <button type="button" class="pay-wallet-add" id="bsAddFunds">+ Fonds</button>
    </div>
    <div id="bsPayHint" class="pay-wallet-hint hidden" role="status"></div>
    <button id="bsPay" class="primary-btn" type="button">Payer avec mon solde</button>
    <div id="bsMsg" class="msg"></div>
    <p class="note">Vérifie soigneusement ton identifiant avant de confirmer. Remboursement automatique uniquement si le fournisseur refuse la commande.</p>
  </div>
</div>`;
    $('bsBack').onclick=()=>showPage('services');
    $('bsPacks').onclick=e=>{
      const b=e.target.closest('[data-pack]');if(!b)return;
      sel=b.dataset.pack;renderPacks();msg('');paint();
    };
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
    $('bsBarBtn').onclick=next;
    $('bsAddFunds').onclick=()=>{showPage('wallet');setTimeout(()=>{const b=$('walletAddBtn');if(b)b.click();},60);};
    pg.querySelectorAll('#bsProgress .op-step').forEach(b=>b.addEventListener('click',()=>{const e=$(b.dataset.go);if(e)e.scrollIntoView({behavior:'smooth',block:'start'});}));
    if(io)io.disconnect();
    if('IntersectionObserver' in window){
      io=new IntersectionObserver(es=>es.forEach(e=>{const bar=$('bsBar');if(bar)bar.classList.toggle('ob-hidden',e.isIntersecting);}),{threshold:0.6});
      io.observe($('bsPay'));
    }
  }

  function renderPacks(){
    const pr=packs.map(x=>x.price_htg);
    $('bsRange').textContent=packs.length?fmt(Math.min(...pr))+' – '+fmt(Math.max(...pr))+' HTG':'Aucun pack disponible';
    const card=x=>'<button type="button" class="bs-pack'+(String(x.id)===String(sel)?' sel':'')+'" data-pack="'+esc(x.id)+'"><span>'+esc(x.label)+'</span><span class="bs-pack-p">'+fmt(x.price_htg)+' HTG</span></button>';
    const bc=packs.filter(x=>x.kind==='bc'),ps=packs.filter(x=>x.kind!=='bc');
    $('bsPacks').innerHTML=(bc.length?'<div class="bs-sub">Gold</div><div class="bs-packs">'+bc.map(card).join('')+'</div>':'')
      +(ps.length?'<div class="bs-sub">Passes</div><div class="bs-packs">'+ps.map(card).join('')+'</div>':'');
  }

  function paint(){
    if(!$('bsPacks'))return;
    const p=curPack();
    $('bsDot').className='bsdot '+(vstate==='unavail'?'':vstate);
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
    $('bsSumPack').textContent=p?p.label:'—';
    const tot=p?fmt(p.price_htg)+' HTG':'—';
    $('bsSumTotal').textContent=tot;$('bsBarTotal').textContent=tot;
    $('bsBal').textContent='Solde : '+fmt(bal)+' HTG';
    const h=$('bsPayHint');
    if(p&&bal<Number(p.price_htg)){h.textContent='Solde insuffisant : il te manque '+fmt(Number(p.price_htg)-bal)+' HTG. Ajoute des fonds pour continuer.';h.classList.remove('hidden');}
    else h.classList.add('hidden');
    const d1=!!p,d2=ready()&&phoneNorm().length>=11,dn=[d1,d2,false],act=dn.findIndex(x=>!x);
    pg.querySelectorAll('#bsProgress .op-step').forEach((bt,i)=>{bt.classList.toggle('done',dn[i]);bt.classList.toggle('active',i===act);});
    $('bsProgress').style.setProperty('--op',String((d1?1:0)+(d2?1:0)));
    $('bsPay').disabled=busy;
    $('bsPay').textContent=busy?'Paiement en cours…':'Payer avec mon solde';
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

  function next(){
    if(!curPack())return goTo('bsSecPack');
    if(vstate==='err'||vstate==='load'||(vstate!=='ok'&&vstate!=='unavail'))return goTo('bsPid');
    if(vstate==='unavail'&&!pid2Ok())return goTo('bsPid2');
    if(!conf)return goTo(vstate==='ok'?'bsV':'bsConf2');
    if(phoneNorm().length<11)return goTo('bsPhone');
    pay();
  }

  function done(){
    $('bsProgress').style.display='none';
    if(io)io.disconnect();
    $('bsBar').classList.add('ob-hidden');
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
    const M={insufficient_funds:'Solde insuffisant. Ajoute des fonds dans ton portefeuille.',service_unavailable:'Ce service est indisponible pour le moment.',invalid_input:'Informations invalides. Vérifie ton ID joueur et ton numéro.',unauthenticated:'Session expirée. Reconnecte-toi.',confirmation_required:'Coche la case pour confirmer ton compte.'};
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
