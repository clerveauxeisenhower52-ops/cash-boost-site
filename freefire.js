/* Free Fire : achat de packs avec le solde (fonction SQL freefire_purchase) + vérification automatique du compte */
(function(){
  const st=document.createElement('style');
  st.textContent='#ffOv{position:fixed;inset:0;z-index:9999;background:var(--surface);color:var(--text);display:none;overflow-y:auto;-webkit-overflow-scrolling:touch}#ffOv.show{display:block}#ffBox{width:100%;max-width:520px;margin:0 auto;box-sizing:border-box;min-height:100%;padding:calc(12px + env(safe-area-inset-top,0px)) 16px calc(28px + env(safe-area-inset-bottom,0px))}#ffBox h2{margin:8px 0 4px;font-size:28px}#ffBox p{margin:0 0 12px;color:var(--muted);font-size:14px}#ffBox label{display:block;margin:10px 0 2px;font-weight:600}#ffBox input{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;border:1px solid rgba(128,128,128,.45);background:transparent;color:inherit;font:inherit}.ffback{background:none;border:0;color:inherit;font:inherit;font-weight:600;padding:8px 0;cursor:pointer}.ffprice{font-size:26px;font-weight:800;margin:0 0 12px}.ffbox{border:1px solid rgba(128,128,128,.35);border-radius:16px;padding:14px;margin:14px 0}.ffhr{border:0;border-top:1px solid rgba(128,128,128,.35);margin:16px 0}.ffdesc h3{margin:0 0 8px;font-size:18px}.ffc{display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border:1px solid rgba(128,128,128,.45);border-radius:10px;background:transparent;color:inherit;font:inherit}.ffc.sel{border:2px solid var(--text);padding:9px 13px;font-weight:700}.ffb{display:inline-block;margin:0 0 8px;padding:8px 14px;border-radius:999px;background:#fff6d6;color:#7a5600;border:1px solid #f0d98a;font-weight:700;font-size:14px}.ffin{position:relative;margin:0 0 10px}.ffin input{padding-right:46px}.ffdot{position:absolute;right:14px;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;border:2px solid rgba(128,128,128,.6);box-sizing:border-box}.ffdot.load{border-color:#3b82f6;border-top-color:transparent;animation:ffs .8s linear infinite}.ffdot.ok{background:#16a34a;border-color:#16a34a}.ffdot.err{background:#dc2626;border-color:#dc2626}@keyframes ffs{to{transform:rotate(360deg)}}.ffcard{padding:12px 14px;border-radius:12px;margin:0 0 10px;font-size:15px;line-height:1.5}.ffcard small{display:block;opacity:.7;margin-top:6px}.ffcard.load{background:#eaf2ff;color:#1e3a8a}.ffcard.ok{background:#e9fbf0;color:#14532d;border:1px solid #86d9a5}.ffcard.err{background:#fdecec;color:#7f1d1d}#ffPay{text-transform:uppercase}#ffPay:disabled{opacity:.45}';
  document.head.appendChild(st);
  const ov=document.createElement('div');ov.id='ffOv';ov.innerHTML='<div id="ffBox"></div>';document.body.appendChild(ov);
  const box=ov.firstChild;
  let packs=null,sel=null,reqId=null,busy=false,bal=0,okPid=null,info=null,vstate='',vmsg='',canRetry=false,timer=null,seq=0,conf=false,rng='';
  const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const close=()=>{ov.classList.remove('show');clearTimeout(timer);seq++;document.documentElement.style.overflow='';};
  const curPid=()=>($('ffPid').value||'').replace(/\s/g,'');
  const msg=(t,c)=>{const m=$('ffMsg');if(m){m.className='msg '+(c||'');m.textContent=t;}};
  function render(){
    const pr=packs.map(x=>x.price_htg);
    rng=packs.length?fmt(Math.min(...pr))+' – '+fmt(Math.max(...pr))+' HTG':'';
    box.innerHTML='<button type="button" class="ffback" id="ffClose" aria-label="Retour">← Retour</button><h2>Free Fire</h2><div class="ffprice" id="ffPrice"></div>'
      +'<div>'+packs.map(x=>'<button type="button" class="ffc" data-pack="'+esc(x.id)+'">'+esc(x.label)+'</button>').join('')+'</div>'
      +'<hr class="ffhr">'
      +'<div class="ffbox"><span class="ffb">Vérification requise</span>'
      +'<div class="ffin"><input id="ffPid" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="ID"><span id="ffDot" class="ffdot"></span></div>'
      +'<div id="ffV"></div>'
      +'<label>Numéro WhatsApp (avec indicatif)</label><input id="ffPhone" inputmode="tel" autocomplete="tel" placeholder="509XXXXXXXX" value="'+esc(($('custPhone')&&$('custPhone').value)||'')+'"></div>'
      +'<p>Ton solde : <b>'+fmt(bal)+' HTG</b></p><div id="ffMsg" class="msg"></div>'
      +'<button type="button" id="ffPay" class="primary-btn" style="width:100%" disabled>Acheter maintenant</button>'
      +'<hr class="ffhr"><div class="ffdesc"><h3>Description</h3>'
      +'<p>Recharge ton compte <b>Free Fire</b> avec des diamants 💎, un abonnement ou le Booyah Pass 🎟️, directement avec ton solde Cash Boost.</p>'
      +'<p>Service réservé aux joueurs du serveur <b>NA</b> (Caraïbes, Amérique centrale et Mexique). Ton compte est vérifié automatiquement avant l’achat, et si la recharge échoue ton solde est remboursé.</p></div>';
    $('ffClose').onclick=close;
    box.querySelectorAll('[data-pack]').forEach(b=>b.onclick=()=>{sel=b.dataset.pack;box.querySelectorAll('[data-pack]').forEach(c=>c.classList.toggle('sel',c===b));paint();});
    $('ffPid').addEventListener('input',()=>{
      clearTimeout(timer);seq++;okPid=null;info=null;vstate='';vmsg='';conf=false;
      if(curPid().length>=8)timer=setTimeout(check,600);
      paint();
    });
    $('ffPay').onclick=pay;
    paint();
  }
  function paint(){
    $('ffDot').className='ffdot '+vstate;
    const v=$('ffV'),p=packs.find(x=>x.id===sel);
    if(vstate==='load')v.innerHTML='<div class="ffcard load">Vérification en cours…</div>';
    else if(vstate==='ok'){v.innerHTML='<div class="ffcard ok"><b>✓ Compte vérifié</b><small>Nom joueur</small><b id="ffName"></b><small>ID joueur</small>'+esc(okPid)+(info&&info.region?'<small>Serveur</small>'+esc(info.region):'')+'</div>'
      +'<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;font-weight:600"><input type="checkbox" id="ffConf" style="width:22px;height:22px;flex:none;margin:0;padding:0"'+(conf?' checked':'')+'><span>Je confirme que ce compte est le mien</span></label>';
      $('ffName').textContent=(info&&info.player_name)||'—';$('ffConf').onchange=()=>{conf=$('ffConf').checked;paint();};}
    else if(vstate==='err'){v.innerHTML='<div class="ffcard err">'+esc(vmsg)+(canRetry?'<br><button type="button" id="ffRetry" class="ffc" style="margin:8px 0 0">Réessayer</button>':'')+'</div>';if(canRetry)$('ffRetry').onclick=check;}
    else v.innerHTML='';
    $('ffPrice').textContent=p?fmt(p.price_htg)+' HTG':rng;
    $('ffPay').disabled=busy||!(p&&vstate==='ok'&&conf);
  }
  async function check(){
    const pid=curPid(),my=++seq;
    if(!/^[0-9]{8,15}$/.test(pid)){vstate='err';vmsg='Player ID invalide : 8 chiffres minimum.';canRetry=false;return paint();}
    vstate='load';paint();
    let d=null;
    try{const x=await sb.functions.invoke('freefire-validate',{body:{player_id:pid}});d=x.data;}catch(_){}
    if(my!==seq||curPid()!==pid)return;
    if(d&&d.ok&&d.valid){
      if(String(d.region||'').toUpperCase()!=='NA'){okPid=null;vstate='err';vmsg='Ce service est réservé aux comptes du serveur NA.';canRetry=false;}
      else{okPid=pid;info=d;vstate='ok';}
    }
    else if(d&&d.ok&&d.valid===false){okPid=null;vstate='err';vmsg='Aucun compte Free Fire trouvé avec cet ID.';canRetry=false;}
    else{okPid=null;vstate='err';vmsg='Vérification indisponible pour le moment.';canRetry=true;}
    paint();
  }
  async function pay(){
    if(busy)return;
    const pid=curPid(),ph=$('ffPhone').value.replace(/\D/g,'');
    if(!sel)return msg('Choisis un pack.','err');
    if(!okPid||okPid!==pid)return msg('Vérifie d’abord ton Player ID.','err');
    if(!conf)return msg('Coche la case pour confirmer que ce compte est le tien.','err');
    if(ph.length<11)return msg('Entre ton numéro WhatsApp avec l’indicatif (ex. 509…).','err');
    busy=true;paint();msg('');
    if(!reqId)reqId=uuid();
    let r=null,err=null;
    try{const x=await sb.rpc('freefire_purchase',{p_request_id:reqId,p_pack_id:sel,p_player_id:pid,p_phone:ph,p_confirmed:true});r=x.data;err=x.error;}catch(e){err=e;}
    busy=false;paint();
    if(err||!r)return msg('Paiement momentanément indisponible. Réessaie dans un instant.','err');
    if(r.status==='paid'){
      reqId=null;walletBal=Number(r.balance||0);
      box.innerHTML='<h2>Commande reçue ✓</h2><p>Tes diamants arrivent en quelques instants. Si la recharge échoue, ton solde est remboursé automatiquement.</p><button type="button" id="ffOrders" class="primary-btn" style="width:100%">Voir mes commandes</button>';
      $('ffOrders').onclick=()=>{close();showPage('orders');try{loadMyOrders();}catch(_){}};
      return;
    }
    reqId=null;
    const M={insufficient_funds:'Solde insuffisant. Ajoute des fonds dans ton portefeuille.',service_unavailable:'Ce service est indisponible pour le moment.',invalid_input:'Informations invalides. Vérifie ton Player ID et ton numéro.',unauthenticated:'Session expirée. Reconnecte-toi.',confirmation_required:'Coche la case pour confirmer que ce compte est le tien.'};
    msg(M[r.status]||'Paiement impossible.','err');
  }
  async function open(){
    box.innerHTML='<button type="button" class="ffback" id="ffClose0">← Retour</button><p>Chargement…</p>';ov.classList.add('show');ov.scrollTop=0;
    $('ffClose0').onclick=close;
    try{
      if(!packs){const x=await sb.from('freefire_packs').select('id,label,price_htg').eq('active',true).order('sort');if(x.error)throw x.error;packs=x.data||[];}
      const w=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle();bal=Number(w&&w.data&&w.data.balance_htg||0);
      sel=null;reqId=null;okPid=null;info=null;vstate='';vmsg='';conf=false;seq++;render();
    }catch(_){box.innerHTML='<p>Impossible de charger les packs. Réessaie.</p><button class="primary-btn" id="ffClose2" style="width:100%">Fermer</button>';$('ffClose2').onclick=close;}
  }
  const prev=window.openService;
  window.openService=function(id){return id==='Free Fire'?open():prev.apply(this,arguments);};
})();
