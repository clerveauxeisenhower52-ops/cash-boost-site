/* Cash Boost : dépôt crypto (USDT) dans « Ajouter des fonds »
   Ajoute un onglet « Crypto (USDT) » à côté de MonCash / NatCash.
   L'onglet n'apparaît que si la fonction crypto-deposit-address répond (dépôts crypto activés). */
(function(){
  'use strict';
  var info=null, state='idle', mode='mm', net='bsc', poll=null, baseId=null;

  var NETS={
    bsc:{label:'BSC (BEP20)', token:'USDT BEP20'},
    plasma:{label:'Plasma', token:'USDT0'}
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
      '.cb-qr{display:flex;justify-content:center;margin:14px 0}'+
      '.cb-qr canvas{background:#fff;border-radius:12px;padding:8px;max-width:100%;height:auto}'+
      '.cb-addr{font-size:13px!important;letter-spacing:0!important;word-break:break-all;line-height:1.4}'+
      '.cb-list{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:8px;font-size:13px;color:var(--text)}'+
      '.cb-list li{padding:10px 12px;border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:12px;background:var(--surface-elev,transparent)}'+
      '.cb-list li.warn{border-color:var(--danger,#ef4444)}';
    document.head.appendChild(s);
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
      '<div><h3>Dépose des USDT</h3><p id="cbRate">Choisis le réseau, puis envoie à ton adresse personnelle.</p></div></div>'+
      '<div class="wallet-ops" id="cbNets" role="radiogroup" aria-label="Réseau">'+
        '<button type="button" class="wallet-op active" data-net="bsc" role="radio" aria-checked="true"><span class="wallet-radio" aria-hidden="true"></span><span class="wallet-op-txt">BSC<small>USDT BEP20</small></span></button>'+
        '<button type="button" class="wallet-op" data-net="plasma" role="radio" aria-checked="false"><span class="wallet-radio" aria-hidden="true"></span><span class="wallet-op-txt">Plasma<small>USDT0</small></span></button>'+
      '</div>'+
      '<div class="wallet-acc"><small>Ton adresse de dépôt personnelle</small>'+
        '<div class="wallet-acc-row"><span id="cbAddr" class="wallet-acc-num cb-addr">—</span>'+
        '<button id="cbCopy" type="button" class="wallet-copy">Copier</button></div></div>'+
      '<div class="cb-qr"><canvas id="cbQr" width="180" height="180" aria-label="QR code de ton adresse"></canvas></div>'+
      '<ul class="cb-list" id="cbList"></ul>'+
      '<div id="cbWait" class="msg" role="status"></div>';

    var steps=sheet.querySelectorAll(':scope > section.wallet-step');
    steps[steps.length-1].insertAdjacentElement('afterend',panel);

    tabs.addEventListener('click',function(e){
      var b=e.target.closest('[data-m]'); if(b) setMode(b.dataset.m);
    });
    $id('cbNets').addEventListener('click',function(e){
      var b=e.target.closest('[data-net]'); if(!b) return;
      net=b.dataset.net; render();
    });
    $id('cbCopy').addEventListener('click',function(){
      if(info&&info.address&&typeof walletCopy==='function') walletCopy(info.address,'Adresse copiée');
    });
  }

  function render(){
    if(!info) return;
    var n=NETS[net]||NETS.bsc;
    document.querySelectorAll('#cbNets .wallet-op').forEach(function(b){
      var on=b.dataset.net===net; b.classList.toggle('active',on); b.setAttribute('aria-checked',String(on));
    });
    $id('cbAddr').textContent=info.address;
    var rate=Number(info.rate_htg)||0, min=Number(info.min_usdt)||5;
    $id('cbRate').textContent=rate>0?('1 USDT = '+rate+' HTG. Crédit automatique.'):'Crédit automatique après confirmation.';
    var list=$id('cbList'); list.innerHTML='';
    function li(html,cls){ var e=document.createElement('li'); if(cls)e.className=cls; e.innerHTML=html; list.appendChild(e); }
    li('Envoie uniquement des <b>'+n.token+'</b> sur le réseau <b>'+n.label+'</b>. Un autre réseau ou un autre jeton sera perdu.','warn');
    li('Minimum : <b>'+min+' USDT</b>. En dessous, le dépôt n\u2019est pas crédité.');
    li('Ton solde est crédité automatiquement en 1 à 3 minutes. Tu peux laisser cette fenêtre ouverte.');
    var cv=$id('cbQr');
    try{ if(typeof QRCode!=='undefined'&&QRCode.toCanvas) QRCode.toCanvas(cv,info.address,{width:180,margin:1}); }catch(_){}
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
  }
  async function check(){
    var d=$id('walletDeposit');
    if(!d||d.classList.contains('hidden')||mode!=='crypto'){ stopPoll(); return; }
    try{
      var r=await sb.from('wallet_transactions').select('id,amount_htg').eq('user_id',currentUserId).eq('type','deposit').like('provider','USDT%').order('created_at',{ascending:false}).limit(1);
      var t=r.data&&r.data[0]; if(!t||t.id===baseId) return;
      baseId=t.id; stopPoll();
      var w=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle();
      walletBal=Number((w&&w.data&&w.data.balance_htg)||0);
      walletRenderBalance();
      showToast('✅ '+fmt(Number(t.amount_htg))+' HTG ajoutés à ton portefeuille');
      try{ beep(); }catch(_){}
      loadWallet();
      walletShowSuccess(Number(t.amount_htg),walletBal);
    }catch(_){}
  }

  function setMode(m){
    mode=m;
    var sheet=$id('walletSheet'); if(!sheet) return;
    sheet.classList.toggle('cb-crypto-mode',m==='crypto');
    document.querySelectorAll('#cbModeTabs [data-m]').forEach(function(b){ b.classList.toggle('active',b.dataset.m===m); });
    if(m==='crypto'){ render(); startPoll(); } else stopPoll();
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
  function onClose(){ stopPoll(); var s=$id('walletSheet'); if(s) s.classList.remove('cb-crypto-mode'); mode='mm'; }

  function init(){
    var d=$id('walletDeposit'); if(!d) return;
    var wasHidden=d.classList.contains('hidden');
    new MutationObserver(function(){
      var hidden=d.classList.contains('hidden');
      if(hidden!==wasHidden){ wasHidden=hidden; if(hidden) onClose(); else onOpen(); }
    }).observe(d,{attributes:true,attributeFilter:['class']});
  }
  init();
})();
