/* Cash Boost : dépôt crypto (USDT) dans « Ajouter des fonds »
   Ajoute un onglet « Crypto (USDT) » à côté de MonCash / NatCash.
   L'onglet n'apparaît que si la fonction crypto-deposit-address répond (dépôts crypto activés).
   Parcours : choix du réseau, case à cocher de confirmation du réseau et du jeton, bouton « Afficher mon adresse de paiement »,
   puis adresse + QR + récapitulatif (taux, frais de service) et avertissements. Changer de réseau cache l'adresse
   et demande de confirmer à nouveau. L'adresse du client reste permanente (pas d'expiration).
   Les frais viennent du réglage crypto_fee_percent (renvoyé par crypto-deposit-address) et sont déduits côté serveur.
   Affiche aussi l'historique des dépôts USDT du client (statut + lien explorateur)
   et un avertissement si un envoi sur le mauvais réseau / avec le mauvais jeton a été détecté.
   Bandeau « Dépôt détecté » : dès qu'un envoi apparaît sur la blockchain (avant les confirmations),
   le navigateur le repère via un serveur RPC public et prévient le client. Information seulement :
   le crédit reste fait uniquement par le serveur (crypto-deposit-scan). */
(function(){
  'use strict';
  var info=null, state='idle', mode='mm', net='bsc', poll=null, baseId=null, qrLib=null, pendBusy=false;

  var NETS={
    bsc:{label:'BSC (BEP20)', token:'USDT BEP20', short:'USDT \u00B7 BEP-20 (BSC)'},
    plasma:{label:'Plasma', token:'USDT0', short:'USDT0 \u00B7 Plasma'}
  };
  var NET_LABEL={bsc:'BSC',plasma:'Plasma',ethereum:'Ethereum',polygon:'Polygon',arbitrum:'Arbitrum',base:'Base',optimism:'Optimism'};
  var EXPLORER={bsc:'https://bscscan.com/tx/',plasma:'https://plasmascan.to/tx/'};
  var GEN_LABEL='Afficher mon adresse de paiement';

  /* Petits logos des réseaux (SVG) : BNB Smart Chain et Plasma */
  var LOGO_BSC='<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false">'+
    '<circle cx="32" cy="32" r="32" fill="#F3BA2F"/>'+
    '<g fill="#fff">'+
      '<polygon points="32,25.5 38.5,32 32,38.5 25.5,32"/>'+
      '<polygon points="32,13 40.5,21.5 36.5,25.5 32,21 27.5,25.5 23.5,21.5"/>'+
      '<polygon points="32,51 40.5,42.5 36.5,38.5 32,43 27.5,38.5 23.5,42.5"/>'+
      '<polygon points="13,32 18.5,26.5 23,31 23,33 18.5,37.5"/>'+
      '<polygon points="51,32 45.5,26.5 41,31 41,33 45.5,37.5"/>'+
    '</g></svg>';
  /* Logo Plasma : barres blanches en tunnel sur fond vert foncé (redessiné d'après l'image fournie) */
  var LOGO_PLASMA='<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="32" fill="#1A2E29"/><g fill="#fff" transform="translate(32 32) scale(.09) translate(-540 -363)"><polygon points="310,364 325,366 325,360 310,362"/><polygon points="312,343 331,328 326,323 311,342"/><polygon points="318,322 341,291 335,288 316,321"/><polygon points="327,303 357,257 351,254 325,303"/><polygon points="339,286 379,227 372,223 337,285"/><polygon points="354,272 406,201 398,196 352,270"/><polygon points="371,260 437,180 428,174 369,258"/><polygon points="390,251 471,165 462,157 388,249"/><polygon points="410,246 507,156 498,147 408,244"/><polygon points="431,244 545,153 535,143 429,242"/><polygon points="452,246 582,157 573,145 450,244"/><polygon points="472,252 618,168 609,154 470,249"/><polygon points="491,261 652,185 643,169 489,258"/><polygon points="508,273 682,207 674,190 506,269"/><polygon points="522,288 708,234 702,215 521,284"/><polygon points="534,305 729,266 724,245 533,301"/><polygon points="543,324 744,300 740,279 542,320"/><polygon points="548,344 753,336 751,315 548,340"/><polygon points="550,365 755,374 755,352 550,361"/><polygon points="548,386 751,411 753,390 548,382"/><polygon points="542,406 740,447 744,426 543,402"/><polygon points="533,425 724,481 729,460 534,421"/><polygon points="521,442 702,511 708,492 522,438"/><polygon points="506,457 674,536 682,519 508,453"/><polygon points="489,468 643,557 652,541 491,465"/><polygon points="470,477 609,572 618,558 472,474"/><polygon points="450,482 573,581 582,569 452,480"/><polygon points="429,484 535,583 545,573 431,482"/><polygon points="408,482 498,579 507,570 410,480"/><polygon points="388,477 462,569 471,561 390,475"/><polygon points="369,468 428,552 437,546 371,466"/><polygon points="352,456 398,530 406,525 354,454"/><polygon points="337,441 372,503 379,499 339,440"/><polygon points="325,423 351,472 357,469 327,423"/><polygon points="316,405 335,438 341,435 318,404"/><polygon points="311,384 326,403 331,398 312,383"/></g></svg>';

  /* Détection précoce (lecture seule, depuis le navigateur) */
  var TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  var PEND={
    bsc:{rpcs:['https://bsc-rpc.publicnode.com','https://bsc.drpc.org'], token:'0x55d398326f99059fF775485246999027B3197955', dec:18, back:400},
    plasma:{rpcs:['https://rpc.plasma.to'], token:'0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', dec:6, back:900}
  };

  function $id(i){ return document.getElementById(i); }

  function injectCss(){
    if($id('cbCryptoCss')) return;
    var s=document.createElement('style'); s.id='cbCryptoCss';
    s.textContent=
      '.cb-mode-tabs{display:flex;gap:8px;margin:0 0 14px}'+
      '.cb-mode-tabs[hidden]{display:none}'+
      '.cb-mode-tabs .wtx-chip{flex:1;text-align:center}'+
      '#walletSheet:not(.cb-crypto-mode) #walletCryptoPanel{display:none}'+
      '#walletSheet.cb-crypto-mode > section.wallet-step:not(#walletCryptoPanel){display:none}'+
      '#walletSheet.done #walletCryptoPanel,#walletSheet.done .cb-mode-tabs{display:none}'+
      /* Choix du réseau : petit logo à gauche, puis nom, jeton et minimum (une carte par réseau) */
      '#cbNets{display:grid!important;grid-template-columns:1fr!important;gap:10px}'+
      '#cbNets .cb-net{display:flex!important;align-items:center;gap:14px;width:100%;text-align:left;padding:12px 14px!important}'+
      '.cb-net-logo{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:var(--surface-elev,rgba(255,255,255,.06));border:1px solid var(--line-strong,rgba(255,255,255,.14))}'+
      '.cb-net-logo svg{width:30px;height:30px;display:block}'+
      '.cb-net-tx{min-width:0;flex:1}'+
      '.cb-net-tx b{display:block;font-size:16px;font-weight:700;line-height:1.25;color:var(--text-strong,inherit)}'+
      '.cb-net-tx span{display:block;margin-top:2px;font-size:14px;color:var(--muted,#9aa3b5)}'+
      '.cb-net-tx small{display:block;margin-top:2px;font-size:13px;color:var(--muted,#9aa3b5);opacity:.8}'+
      /* Case de confirmation du réseau et du jeton, avant d'afficher l'adresse */
      '.cb-confirm{display:flex;align-items:flex-start;gap:12px;margin:14px 0 0;padding:12px 14px;border:1px solid var(--danger,#ef4444);border-radius:14px;font-size:14px;line-height:1.45;color:var(--text);cursor:pointer;-webkit-tap-highlight-color:transparent}'+
      '.cb-confirm[hidden]{display:none}'+
      '.cb-confirm input{flex:none;width:22px;height:22px;margin:1px 0 0;accent-color:var(--primary,#1E6BFF);cursor:pointer}'+
      '.cb-confirm small{display:block;margin-top:4px;font-size:12px;opacity:.75}'+
      /* Bouton « Afficher mon adresse de paiement » + petit chargement */
      '.cb-gen{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:54px;margin:14px 0 0;padding:12px 16px;border:0;border-radius:16px;background:var(--brand-grad,#1E6BFF);color:var(--brand-ink,#fff);font:inherit;font-size:16px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
      '.cb-gen[hidden]{display:none}'+
      '.cb-gen:disabled{opacity:.85;cursor:wait}'+
      '.cb-gen.cb-off{opacity:.45;cursor:not-allowed}'+
      '.cb-spin{width:20px;height:20px;border:3px solid currentColor;border-right-color:transparent;border-radius:50%;animation:cbSpin .7s linear infinite}'+
      '@keyframes cbSpin{to{transform:rotate(360deg)}}'+
      '#cbReveal[hidden]{display:none}'+
      /* Récapitulatif : réseau, montant, taux, frais */
      '.cb-sum{margin:14px 0 0;padding:12px 14px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:14px;background:var(--surface-elev,transparent);display:grid;gap:8px;font-size:14px}'+
      '.cb-sum div{display:flex;justify-content:space-between;align-items:baseline;gap:12px}'+
      '.cb-sum span{color:var(--muted,#9aa3b5)}'+
      '.cb-sum b{text-align:right;color:var(--text-strong,inherit)}'+
      '.cb-sum .rate b{color:#16a34a}'+
      '.cb-sum .fee b{color:#ea580c}'+
      '.cb-note{margin:12px 0 0;padding:12px;border:1px solid var(--primary-line,rgba(59,130,246,.35));border-radius:12px;background:var(--primary-soft,rgba(59,130,246,.12));font-size:13px;line-height:1.45;color:var(--text)}'+
      '.cb-qr{display:flex;justify-content:center;margin:14px 0}'+
      '.cb-qr[hidden]{display:none}'+
      '.cb-addr{font-size:13px!important;letter-spacing:0!important;word-break:break-all;line-height:1.4}'+
      '#walletVerify:disabled{opacity:1;background:var(--surface-elev,#1a1a24);color:var(--muted,#9aa3b5);box-shadow:none;border:1px solid var(--line-strong,rgba(255,255,255,.14));cursor:not-allowed}'+
      '.cb-list{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:8px;font-size:13px;color:var(--text)}'+
      '.cb-list li{padding:10px 12px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:12px;background:var(--surface-elev,transparent)}'+
      '.cb-list li.warn{border-color:var(--danger,#ef4444)}'+
      '.cb-pending{margin:14px 0 0;padding:12px;border:1px solid var(--primary-line,rgba(59,130,246,.35));border-radius:12px;background:var(--primary-soft,rgba(59,130,246,.12));font-size:13px;line-height:1.45;color:var(--text)}'+
      '.cb-pending[hidden]{display:none}'+
      '.cb-lost{margin:14px 0 0;padding:12px;border:1px solid var(--danger,#ef4444);border-radius:12px;font-size:13px;line-height:1.45;color:var(--text)}'+
      '.cb-lost[hidden]{display:none}'+
      '.cb-lost b{display:block;margin-bottom:4px}'+
      '.cb-hist-title{margin:18px 0 6px;font-size:14px;font-weight:700;color:var(--text)}'+
      '.cb-hist-title[hidden]{display:none}'+
      '.cb-hist{margin:0;padding:0;list-style:none;display:grid;gap:8px}'+
      '.cb-hist li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:12px;font-size:13px;color:var(--text)}'+
      '.cb-hist .cb-h-main{display:grid;gap:2px;min-width:0}'+
      '.cb-hist .cb-h-main small{opacity:.7;font-size:11px}'+
      '.cb-hist .cb-h-side{display:grid;gap:4px;justify-items:end;text-align:right;flex:none}'+
      '.cb-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(245,158,11,.18);color:#f59e0b}'+
      '.cb-badge.ok{background:rgba(34,197,94,.18);color:#22c55e}'+
      '.cb-hist a{font-size:11px;color:var(--accent,#38bdf8);text-decoration:underline}';
    document.head.appendChild(s);
  }

  // QR code : petite bibliothèque indépendante (n'entre pas en conflit avec celle déjà utilisée sur le site)
  function loadQrLib(){
    if(qrLib) return qrLib;
    qrLib=new Promise(function(resolve,reject){
      if(typeof window.qrcode==='function'){ resolve(window.qrcode); return; }
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload=function(){ typeof window.qrcode==='function'?resolve(window.qrcode):reject(new Error('qr')); };
      s.onerror=function(){ reject(new Error('qr')); };
      document.head.appendChild(s);
    });
    qrLib.catch(function(){ qrLib=null; });
    return qrLib;
  }
  function drawQr(text){
    var box=$id('cbQrBox'), img=$id('cbQr'); if(!box||!img) return;
    loadQrLib().then(function(q){
      var qr=q(0,'M'); qr.addData(text); qr.make();
      img.src=qr.createDataURL(6,2);
      box.hidden=false;
    }).catch(function(){ box.hidden=true; });
  }

  function build(){
    var sheet=$id('walletSheet'), need=$id('walletNeed');
    if(!sheet||!need||$id('walletCryptoPanel')) return;
    injectCss();

    var tabs=document.createElement('div');
    tabs.id='cbModeTabs'; tabs.className='cb-mode-tabs'; tabs.hidden=true;
    tabs.innerHTML='<button type="button" class="wtx-chip active" data-m="mm">MonCash / NatCash</button>'+
                   '<button type="button" class="wtx-chip" data-m="crypto">Crypto (USDT)</button>';
    need.insertAdjacentElement('afterend',tabs);

    var panel=document.createElement('section');
    panel.id='walletCryptoPanel'; panel.className='wallet-step';
    panel.innerHTML=
      '<div class="wallet-step-head"><span class="wallet-step-num" aria-hidden="true">\u20AE</span>'+
      '<div><h3>Dépose des USDT</h3><p id="cbRate">Choisis le réseau, puis affiche ton adresse personnelle.</p></div></div>'+
      '<div class="wallet-ops" id="cbNets" role="radiogroup" aria-label="Réseau">'+
        '<button type="button" class="wallet-op cb-net active" data-net="bsc" role="radio" aria-checked="true">'+
          '<span class="cb-net-logo" aria-hidden="true">'+LOGO_BSC+'</span>'+
          '<span class="cb-net-tx"><b>BNB Smart Chain</b><span>Tether USD (BSC)</span><small class="cb-net-min">Min: 5 USDT</small></span></button>'+
        '<button type="button" class="wallet-op cb-net" data-net="plasma" role="radio" aria-checked="false">'+
          '<span class="cb-net-logo" aria-hidden="true">'+LOGO_PLASMA+'</span>'+
          '<span class="cb-net-tx"><b>Plasma</b><span>USDT0 (Plasma)</span><small class="cb-net-min">Min: 5 USDT</small></span></button>'+
      '</div>'+
      '<label class="cb-confirm" id="cbConfirmRow"><input type="checkbox" id="cbConfirm"><span id="cbConfirmTxt"></span></label>'+
      '<button type="button" class="cb-gen cb-off" id="cbGen" aria-disabled="true">'+GEN_LABEL+'</button>'+
      '<div id="cbReveal" hidden>'+
        '<div class="wallet-acc"><small>Ton adresse de dépôt personnelle</small>'+
          '<div class="wallet-acc-row"><span id="cbAddr" class="wallet-acc-num cb-addr">—</span>'+
          '<button id="cbCopy" type="button" class="wallet-copy">Copier</button></div></div>'+
        '<div class="cb-qr" id="cbQrBox" hidden><img id="cbQr" alt="QR code de ton adresse" width="180" height="180" '+
          'style="width:180px;height:180px;max-width:100%;image-rendering:pixelated;background:#fff;padding:8px;border-radius:12px;display:block"></div>'+
        '<div class="cb-sum" id="cbSum"></div>'+
        '<div class="cb-note" id="cbNote"></div>'+
        '<ul class="cb-list" id="cbList"></ul>'+
      '</div>'+
      '<div class="cb-pending" id="cbPending" role="status" aria-live="polite" hidden></div>'+
      '<div class="cb-lost" id="cbLost" role="alert" hidden></div>'+
      '<div id="cbWait" class="msg" role="status"></div>'+
      '<h4 class="cb-hist-title" id="cbHistTitle" hidden>Mes dépôts USDT</h4>'+
      '<ul class="cb-hist" id="cbHist"></ul>';

    var steps=sheet.querySelectorAll(':scope > section.wallet-step');
    steps[steps.length-1].insertAdjacentElement('afterend',panel);

    tabs.addEventListener('click',function(e){
      var b=e.target.closest('[data-m]'); if(b) setMode(b.dataset.m);
    });
    $id('cbNets').addEventListener('click',function(e){
      var b=e.target.closest('[data-net]'); if(!b) return;
      var changed=(net!==b.dataset.net);
      net=b.dataset.net;
      if(changed) resetReveal();   // autre réseau : on cache l'adresse et on redemande la confirmation
      render();
    });
    $id('cbConfirm').addEventListener('change',updateGate);
    $id('cbGen').addEventListener('click',function(){
      var b=this; if(b.disabled||!info) return;
      var c=$id('cbConfirm');
      if(!c||!c.checked){
        try{ showToast('Coche la confirmation du réseau pour afficher ton adresse'); }catch(_){}
        return;
      }
      b.disabled=true; b.innerHTML='<span class="cb-spin" aria-label="Chargement"></span>';
      setTimeout(function(){
        b.hidden=true; b.disabled=false; b.textContent=GEN_LABEL;
        var row=$id('cbConfirmRow'); if(row) row.hidden=true;
        var r=$id('cbReveal'); if(r) r.hidden=false;
        render();
      },700);
    });
    $id('cbCopy').addEventListener('click',function(){
      if(info&&info.address&&typeof walletCopy==='function') walletCopy(info.address,'Adresse copiée');
    });
  }

  /* Le bouton « Afficher mon adresse » reste grisé tant que la case n'est pas cochée */
  function updateGate(){
    var c=$id('cbConfirm'), g=$id('cbGen'); if(!c||!g) return;
    g.classList.toggle('cb-off',!c.checked);
    g.setAttribute('aria-disabled',String(!c.checked));
  }

  function resetReveal(){
    var g=$id('cbGen'), r=$id('cbReveal'), c=$id('cbConfirm'), row=$id('cbConfirmRow');
    if(c) c.checked=false;
    if(row) row.hidden=false;
    if(g){ g.hidden=false; g.disabled=false; g.textContent=GEN_LABEL; }
    if(r) r.hidden=true;
    updateGate();
  }

  function render(){
    if(!info) return;
    var n=NETS[net]||NETS.bsc;
    document.querySelectorAll('#cbNets .wallet-op').forEach(function(b){
      var on=b.dataset.net===net; b.classList.toggle('active',on); b.setAttribute('aria-checked',String(on));
    });
    /* Texte de la case de confirmation : réseau et jeton du réseau choisi */
    var ct=$id('cbConfirmTxt');
    if(ct) ct.innerHTML='Je vais envoyer uniquement des <b>'+n.token+'</b> sur le réseau <b>'+n.label+'</b>.<small>Un autre réseau ou un autre jeton sera perdu.</small>';
    /* Adresse coupée en deux moitiés égales (évite un petit bout orphelin sur la 2e ligne) */
    var addrEl=$id('cbAddr'), addr=String(info.address||''), half=Math.ceil(addr.length/2);
    addrEl.textContent='';
    addrEl.appendChild(document.createTextNode(addr.slice(0,half)));
    addrEl.appendChild(document.createElement('br'));
    addrEl.appendChild(document.createTextNode(addr.slice(half)));
    var rate=Number(info.rate_htg)||0, min=Number(info.min_usdt)||5, fee=Number(info.fee_percent)||0;
    document.querySelectorAll('#cbNets .cb-net-min').forEach(function(e){ e.textContent='Min: '+min+' USDT'; });
    $id('cbRate').textContent=rate>0?('1 USDT = '+rate+' HTG. Crédit automatique.'):'Crédit automatique après confirmation.';

    /* Récapitulatif */
    var sum=$id('cbSum'); sum.innerHTML='';
    function row(label,value,cls){
      var d=document.createElement('div'); if(cls) d.className=cls;
      var s=document.createElement('span'); s.textContent=label;
      var b=document.createElement('b'); b.textContent=value;
      d.appendChild(s); d.appendChild(b); sum.appendChild(d);
    }
    row('Réseau',n.short);
    row('Montant envoyé','Libre (minimum '+min+' USDT)');
    if(rate>0) row('Taux appliqué','1 USDT = '+fmtNum(rate,2)+' HTG','rate');
    if(fee>0) row('Frais déduits automatiquement',fmtNum(fee,2)+' % du montant converti','fee');
    $id('cbNote').textContent=fee>0
      ?('Après confirmation blockchain, le montant reçu est converti au taux'+(rate>0?' de 1 USDT = '+fmtNum(rate,2)+' HTG':' en vigueur')+', puis les frais de '+fmtNum(fee,2)+' % sont déduits automatiquement. Le montant net est crédité à ton portefeuille.')
      :('Après confirmation blockchain, le montant reçu est converti au taux'+(rate>0?' de 1 USDT = '+fmtNum(rate,2)+' HTG':' en vigueur')+' puis crédité automatiquement à ton portefeuille.');

    var list=$id('cbList'); list.innerHTML='';
    function li(html,cls){ var e=document.createElement('li'); if(cls)e.className=cls; e.innerHTML=html; list.appendChild(e); }
    li('Envoie uniquement des <b>'+n.token+'</b> sur le réseau <b>'+n.label+'</b>. Un autre réseau ou un autre jeton sera perdu.','warn');
    li('En dessous de <b>'+min+' USDT</b>, le dépôt n\u2019est pas crédité.');
    li('Ton solde est crédité automatiquement en 1 à 3 minutes. Tu peux laisser cette fenêtre ouverte.');
    drawQr(info.address);
  }

  /* ---------- Historique des dépôts USDT du client ---------- */
  function fmtNum(v,d){
    var x=Number(v); if(!isFinite(x)) return '0';
    return x.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:d});
  }
  function fmtDate(iso){
    try{ return new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
    catch(_){ return ''; }
  }
  async function loadHistory(){
    var ul=$id('cbHist'), title=$id('cbHistTitle'); if(!ul||!title) return;
    try{
      var r=await sb.from('crypto_deposits')
        .select('id,network,tx_hash,amount_usdt,rate_htg,amount_htg,status,created_at')
        .eq('user_id',currentUserId).order('created_at',{ascending:false}).limit(10);
      var rows=(r&&r.data)||[];
      ul.innerHTML='';
      title.hidden=!rows.length;
      rows.forEach(function(d){
        var li=document.createElement('li');
        var main=document.createElement('div'); main.className='cb-h-main';
        var amt=document.createElement('b'); amt.textContent=fmtNum(d.amount_usdt,2)+' USDT';
        var sub=document.createElement('small');
        var gross=Number(d.amount_usdt||0)*Number(d.rate_htg||0), net=Number(d.amount_htg||0), fees=Math.max(0,gross-net);
        sub.textContent=(NET_LABEL[d.network]||String(d.network||''))+' · '+fmtDate(d.created_at);
        if(d.status==='credited') sub.textContent+=' · Brut: '+fmtNum(gross,2)+' HTG · Frais: '+fmtNum(fees,2)+' HTG · Net: +'+fmtNum(net,2)+' HTG';
        else if(d.status==='below_min') sub.textContent+=' · Minimum requis non atteint — aucun crédit';
        else sub.textContent+=' · Crédit en attente de confirmation';
        main.appendChild(amt); main.appendChild(sub);
        var side=document.createElement('div'); side.className='cb-h-side';
        var ok=d.status==='credited';
        var badge=document.createElement('span'); badge.className='cb-badge'+(ok?' ok':''); badge.textContent=ok?'Crédité':(d.status==='below_min'?'Sous le minimum':'En cours');
        side.appendChild(badge);
        var base=EXPLORER[d.network];
        if(base&&/^0x[0-9a-fA-F]{64}$/.test(d.tx_hash||'')){
          var a=document.createElement('a'); a.href=base+d.tx_hash; a.target='_blank'; a.rel='noopener noreferrer';
          a.textContent=d.network==='plasma'?'Voir sur PlasmaScan':'Voir sur BscScan';
          side.appendChild(a);
        }
        li.appendChild(main); li.appendChild(side); ul.appendChild(li);
      });
    }catch(_){}
  }

  /* ---------- Envois détectés sur le mauvais réseau / avec le mauvais jeton ---------- */
  async function loadLost(){
    var box=$id('cbLost'); if(!box) return;
    try{
      var r=await sb.from('crypto_unrecognized').select('network,token_symbol,amount').eq('user_id',currentUserId).eq('status','open');
      var rows=(r&&r.data)||[];
      if(!rows.length){ box.hidden=true; box.innerHTML=''; return; }
      box.innerHTML='';
      var h=document.createElement('b'); h.textContent='Envoi détecté sur ton adresse, non crédité';
      box.appendChild(h);
      var p=document.createElement('div');
      var parts=rows.map(function(x){ return fmtNum(x.amount,2)+' '+x.token_symbol+' sur '+(NET_LABEL[x.network]||x.network); });
      p.textContent='Nous voyons '+parts.join(', ')+'. Ce n\u2019est pas le bon réseau ou le bon jeton, donc ce n\u2019est pas crédité automatiquement. Ne renvoie rien : contacte-nous avec ton adresse de dépôt et nous regarderons ce qui est possible.';
      box.appendChild(p);
      box.hidden=false;
    }catch(_){}
  }

  /* ---------- Détection précoce : « Dépôt détecté, confirmation en cours » ---------- */
  function rpcCall(url,method,params){
    var ctrl=(typeof AbortController==='function')?new AbortController():null;
    var t=setTimeout(function(){ if(ctrl) ctrl.abort(); },6000);
    return fetch(url,{
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:method,params:params}),
      signal:ctrl?ctrl.signal:undefined
    }).then(function(r){ return r.json(); }).then(function(j){
      clearTimeout(t); if(!j||j.error) throw new Error('rpc'); return j.result;
    },function(e){ clearTimeout(t); throw e; });
  }
  async function pendingFor(name,addr,credited,min){
    var c=PEND[name];
    var topicTo='0x'+'0'.repeat(24)+String(addr).slice(2).toLowerCase();
    for(var i=0;i<c.rpcs.length;i++){
      try{
        var latest=parseInt(await rpcCall(c.rpcs[i],'eth_blockNumber',[]),16);
        var from=Math.max(0,latest-c.back);
        var logs=await rpcCall(c.rpcs[i],'eth_getLogs',[{
          address:c.token, topics:[TRANSFER_TOPIC,null,topicTo],
          fromBlock:'0x'+from.toString(16), toBlock:'latest'
        }]);
        var out=[];
        (logs||[]).forEach(function(l){
          if(l.removed) return;
          var h=String(l.transactionHash||'').toLowerCase();
          if(credited[h]) return;
          var amt=Number(BigInt(l.data))/Math.pow(10,c.dec);
          if(amt>=min) out.push({net:name,amount:amt,hash:h});
        });
        return out;
      }catch(_){ /* on essaie le serveur suivant */ }
    }
    return [];
  }
  function hidePending(){ var b=$id('cbPending'); if(b){ b.hidden=true; b.textContent=''; } }
  async function checkPending(){
    var box=$id('cbPending'); if(!box||!info||!info.address||pendBusy) return;
    pendBusy=true;
    try{
      // Dépôts déjà crédités : on ne les affiche pas comme « en attente »
      var credited={};
      var r=await sb.from('crypto_deposits').select('tx_hash').eq('user_id',currentUserId).order('created_at',{ascending:false}).limit(30);
      if(!r||r.error) return;
      (r.data||[]).forEach(function(d){ if(d.tx_hash) credited[String(d.tx_hash).toLowerCase()]=1; });
      var min=Number(info.min_usdt)||5;
      var res=await Promise.all([
        pendingFor('bsc',info.address,credited,min),
        pendingFor('plasma',info.address,credited,min)
      ]);
      var all=[].concat(res[0],res[1]);
      if(mode!=='crypto'||!all.length){ hidePending(); return; }
      var parts=all.map(function(x){ return fmtNum(x.amount,2)+' USDT sur '+(NET_LABEL[x.net]||x.net); });
      box.textContent='\u23F3 Dépôt détecté : '+parts.join(', ')+'. Confirmation en cours, ton solde sera crédité dans quelques instants.';
      box.hidden=false;
    }catch(_){} finally{ pendBusy=false; }
  }

  async function snapshot(){
    try{
      var r=await sb.from('wallet_transactions').select('id').eq('user_id',currentUserId).eq('type','deposit').like('provider','USDT%').order('created_at',{ascending:false}).limit(1);
      return (r.data&&r.data[0])?r.data[0].id:null;
    }catch(_){ return null; }
  }
  function stopPoll(){ if(poll){ clearInterval(poll); poll=null; } }
  async function startPoll(){
    stopPoll();
    baseId=await snapshot();
    poll=setInterval(check,8000);
    checkPending();
  }
  async function check(){
    var d=$id('walletDeposit');
    if(!d||d.classList.contains('hidden')||mode!=='crypto'){ stopPoll(); return; }
    checkPending();
    try{
      var r=await sb.from('wallet_transactions').select('id,amount_htg').eq('user_id',currentUserId).eq('type','deposit').like('provider','USDT%').order('created_at',{ascending:false}).limit(1);
      var t=r.data&&r.data[0]; if(!t||t.id===baseId) return;
      baseId=t.id; stopPoll(); hidePending();
      var w=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle();
      walletBal=Number((w&&w.data&&w.data.balance_htg)||0);
      walletRenderBalance();
      showToast('✅ '+fmt(Number(t.amount_htg))+' HTG ajoutés à ton portefeuille');
      try{ beep(); }catch(_){}
      loadWallet();
      loadHistory();
      walletShowSuccess(Number(t.amount_htg),walletBal);
    }catch(_){}
  }

  function setMode(m){
    mode=m;
    var sheet=$id('walletSheet'); if(!sheet) return;
    sheet.classList.toggle('cb-crypto-mode',m==='crypto');
    document.querySelectorAll('#cbModeTabs [data-m]').forEach(function(b){ b.classList.toggle('active',b.dataset.m===m); });
    if(m==='crypto'){ resetReveal(); render(); startPoll(); loadHistory(); loadLost(); } else { stopPoll(); hidePending(); }
  }

  async function load(){
    if(state==='loading'||state==='ok') return;
    state='loading';
    try{
      var r=await sb.functions.invoke('crypto-deposit-address');
      if(r.error||!r.data||!r.data.address){ state='idle'; return; }
      info=r.data; state='ok';
      var tabs=$id('cbModeTabs'); if(tabs) tabs.hidden=false;
    }catch(_){ state='idle'; }
  }

  function onOpen(){
    build();
    setMode('mm');
    load().then(function(){ var t=$id('cbModeTabs'); if(t&&info) t.hidden=false; });
  }
  function onClose(){ stopPoll(); hidePending(); var s=$id('walletSheet'); if(s) s.classList.remove('cb-crypto-mode'); mode='mm'; }

  /* Retour visuel sur les boutons « Copier » : « Copié ✓ » pendant 2 secondes
     (adresse USDT, numéro MonCash/NatCash, ID Cash Boost). */
  function copyFeedback(){
    document.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('#cbCopy,#walletCopyNum,#walletCopyId'); if(!b) return;
      if(b._cbHtml==null) b._cbHtml=b.innerHTML;
      b.textContent=(b.id==='walletCopyId')?'\u2713':'Copié \u2713';
      clearTimeout(b._cbT);
      b._cbT=setTimeout(function(){ b.innerHTML=b._cbHtml; b._cbHtml=null; },2000);
    });
  }

  function init(){
    copyFeedback();
    var d=$id('walletDeposit'); if(!d) return;
    var wasHidden=d.classList.contains('hidden');
    new MutationObserver(function(){
      var hidden=d.classList.contains('hidden');
      if(hidden!==wasHidden){ wasHidden=hidden; if(hidden) onClose(); else onOpen(); }
    }).observe(d,{attributes:true,attributeFilter:['class']});
  }
  init();
})();
