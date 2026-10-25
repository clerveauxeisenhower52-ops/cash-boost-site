/* Cash Boost : écran « Effectuer un dépôt » (choix MonCash / NatCash / Crypto)
   S'appuie sur la fenêtre « Ajouter des fonds » existante : un clic sur une carte ouvre l'étape de dépôt déjà en place.
   MonCash et NatCash sont séparés : l'étape n'affiche que le compte choisi. */
(function(){
  'use strict';
  function $id(i){ return document.getElementById(i); }
  var CHEV='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  // Icône USDT dessinée en SVG : carré arrondi vert, barre du haut, pied et anneau en blanc
  var USDT_ICON='<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false">'+
    '<rect width="32" height="32" rx="8" fill="#26A17B"/>'+
    '<rect x="7" y="7" width="18" height="4.2" rx="1.2" fill="#fff"/>'+
    '<rect x="13.9" y="9.5" width="4.2" height="16.5" rx="1.2" fill="#fff"/>'+
    '<ellipse cx="16" cy="15.6" rx="9.4" ry="2.9" fill="none" stroke="#fff" stroke-width="1.7"/>'+
    '</svg>';

  function injectCss(){
    if($id('dpCss')) return;
    var s=document.createElement('style'); s.id='dpCss';
    s.textContent=
      '#cbModeTabs{display:none!important}'+
      '#walletSheet.dp-choose > section.wallet-step,#walletSheet.dp-choose #walletCryptoPanel{display:none!important}'+
      '#walletSheet.dp-sep #walletOps{display:none!important}'+
      '#walletSheet:not(.dp-choose) #dpChoose{display:none}'+
      '#walletSheet.dp-choose #dpBack{display:none}'+
      '#walletSheet.done #dpChoose,#walletSheet.done #dpBack{display:none!important}'+
      '.dp-sub{margin:0 0 14px;color:var(--muted);font-size:15px;line-height:1.45}'+
      '.dp-card{display:flex;align-items:center;gap:16px;width:100%;padding:14px 16px;margin:0 0 12px;text-align:left;cursor:pointer;color:var(--text);font:inherit;'+
        'background:var(--surface);border:1px solid var(--line-strong,rgba(255,255,255,.12));border-radius:22px;-webkit-tap-highlight-color:transparent}'+
      '.dp-card:active{background:var(--primary-soft,rgba(0,229,255,.08))}'+
      '.dp-logo{flex:none;width:58px;height:58px;border-radius:16px;overflow:hidden;display:grid;place-items:center;background:var(--primary-soft,rgba(0,229,255,.12))}'+
      '.dp-logo img{width:100%;height:100%;object-fit:cover;display:block}'+
      '.dp-logo.usdt{background:none}'+
      '.dp-tx{flex:1;min-width:0}'+
      '.dp-tx b{display:block;font:700 18px \'Space Grotesk\',Inter,sans-serif;color:var(--text-strong,inherit)}'+
      '.dp-tx small{display:block;margin-top:3px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}'+
      '.dp-chev{flex:none;color:var(--muted);display:grid}'+
      '.dp-tip{margin-top:6px;padding:14px 16px;border-radius:18px;font-size:14px;line-height:1.5;color:var(--text);'+
        'background:var(--surface-elev,transparent);border:1px solid var(--line-strong,rgba(255,255,255,.12))}'+
      '.dp-tip b{color:var(--text-strong,inherit)}'+
      '.dp-back{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;padding:8px 12px;border-radius:12px;cursor:pointer;font:600 14px Inter,sans-serif;'+
        'color:var(--text);background:transparent;border:1px solid var(--line-strong,rgba(255,255,255,.12))}';
    document.head.appendChild(s);
  }

  function toast(m){ try{ showToast(m); }catch(_){} }

  function whenCryptoReady(cb){
    var n=0;
    (function t(){
      var tb=$id('cbModeTabs');
      if(tb&&!tb.hidden){ cb(); return; }
      if(++n>12){ toast('Dépôt crypto indisponible pour le moment.'); return; }
      setTimeout(t,250);
    })();
  }

  function build(){
    var sheet=$id('walletSheet'), need=$id('walletNeed');
    if(!sheet||!need||$id('dpChoose')) return;
    injectCss();

    var box=document.createElement('div');
    box.id='dpChoose';
    box.innerHTML=
      '<p class="dp-sub">Choisis le type de dépôt que tu souhaites effectuer.</p>'+
      '<button type="button" class="dp-card" data-dp="MonCash"><span class="dp-logo"><img src="moncash.png" alt="" onerror="this.style.display=\'none\'"></span>'+
        '<span class="dp-tx"><b>MonCash</b><small>Paiement mobile en HTG</small></span><span class="dp-chev">'+CHEV+'</span></button>'+
      '<button type="button" class="dp-card" data-dp="NatCash"><span class="dp-logo"><img src="natcash.png" alt="" onerror="this.style.display=\'none\'"></span>'+
        '<span class="dp-tx"><b>NatCash</b><small>Paiement mobile en HTG</small></span><span class="dp-chev">'+CHEV+'</span></button>'+
      '<button type="button" class="dp-card" data-dp="crypto"><span class="dp-logo usdt" aria-hidden="true">'+USDT_ICON+'</span>'+
        '<span class="dp-tx"><b>Crypto</b><small>USDT · BSC et Plasma</small></span><span class="dp-chev">'+CHEV+'</span></button>'+
      '<div class="dp-tip"><b>Astuce :</b> les dépôts sont crédités directement sur ton solde après vérification du paiement. Tu n\u2019as pas besoin d\u2019attendre une approbation manuelle.</div>';
    need.insertAdjacentElement('afterend',box);

    var back=document.createElement('button');
    back.id='dpBack'; back.type='button'; back.className='dp-back';
    back.textContent='\u2190 Changer de méthode';
    box.insertAdjacentElement('afterend',back);

    box.addEventListener('click',function(e){
      var c=e.target.closest('[data-dp]'); if(!c) return;
      var k=c.dataset.dp;
      if(k==='crypto'){
        whenCryptoReady(function(){
          sheet.classList.remove('dp-choose','dp-sep');
          var t=document.querySelector('#cbModeTabs [data-m="crypto"]'); if(t) t.click();
        });
        return;
      }
      sheet.classList.remove('dp-choose');
      var op=document.querySelector('#walletOps .wallet-op[data-op="'+k+'"]'); if(op) op.click();
      var m=document.querySelector('#cbModeTabs [data-m="mm"]'); if(m) m.click();
      // MonCash et NatCash sont séparés : on n'affiche que le compte choisi
      sheet.classList.add('dp-sep');
      var st=sheet.querySelector(':scope > section.wallet-step');
      if(st){
        var h=st.querySelector('h3'), p=st.querySelector('.wallet-step-head p');
        if(h) h.textContent='Compte '+k;
        if(p) p.textContent='Envoie ton dépôt vers ce compte '+k+'.';
      }
    });
    back.addEventListener('click',function(){
      var m=document.querySelector('#cbModeTabs [data-m="mm"]'); if(m) m.click();
      sheet.classList.remove('dp-sep');
      sheet.classList.add('dp-choose');
    });
  }

  function onOpen(){
    // on laisse d'abord le module crypto construire ses éléments
    setTimeout(function(){
      build();
      var sheet=$id('walletSheet'), title=$id('walletSheetTitle');
      if(title) title.textContent='Effectuer un dépôt';
      if(sheet){ sheet.classList.remove('dp-sep'); sheet.classList.add('dp-choose'); }
    },0);
  }

  function init(){
    var d=$id('walletDeposit'); if(!d) return;
    var wasHidden=d.classList.contains('hidden');
    new MutationObserver(function(){
      var hidden=d.classList.contains('hidden');
      if(hidden!==wasHidden){ wasHidden=hidden; if(!hidden) onOpen(); }
    }).observe(d,{attributes:true,attributeFilter:['class']});
  }
  init();
})();
