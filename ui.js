/* Cash Boost UI enhancements: client-side only; existing order/payment logic remains untouched. */
(function(){
  'use strict';

  // ── Onglet « Services » à côté d'Accueil ──
  // La liste des services quitte l'accueil et vit dans sa propre page, accessible depuis la barre du bas.
  // Exécuté tout de suite (le HTML est déjà chargé), avant que app.js ne branche les boutons de la barre.
  function setupServicesTab(){
    const home=document.getElementById('page-home');
    const list=document.getElementById('servicesList');
    const nav=document.querySelector('nav.bottom');
    if(!home||!list||!nav||document.getElementById('page-services'))return;

    const page=document.createElement('section');
    page.id='page-services';page.className='page hidden';
    const hero=home.querySelector(':scope > .hero');
    if(hero)page.appendChild(hero);
    page.appendChild(list);
    home.after(page);

    const homeBtn=nav.querySelector('button[data-page="home"]');
    const btn=document.createElement('button');
    btn.type='button';btn.setAttribute('data-page','services');
    btn.innerHTML='<span class="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></span>Services';
    if(homeBtn)homeBtn.after(btn);else nav.prepend(btn);

    const st=document.createElement('style');
    st.textContent='.bottom{grid-template-columns:repeat(5,1fr) !important}.bottom button{min-width:0;font-size:10.5px}';
    document.head.appendChild(st);

    const baseShow=window.showPage;
    window.showPage=function(p,rem=true){
      const sp=document.getElementById('page-services');
      if(p==='services'){
        ['home','service','orders','wallet','account'].forEach(x=>{const e=document.getElementById('page-'+x);if(e)e.classList.add('hidden');});
        if(sp)sp.classList.remove('hidden');
        document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.dataset.page==='services'));
        if(rem){try{localStorage.setItem('cashboost_last_page','services');}catch(_){}}
        window.scrollTo({top:0,behavior:'smooth'});
        return;
      }
      if(sp)sp.classList.add('hidden');
      baseShow(p,rem);
      // La page de commande d'un service dépend de l'onglet Services
      if(p==='service')document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.dataset.page==='services'));
    };
  }
  setupServicesTab();

  // ── Page de commande : étapes, marge du bas, adresse wallet, frais, solde insuffisant ──
  // Exécuté tout de suite (comme l'onglet Services) : app.js branche ses écouteurs plus tard,
  // il récupère donc déjà la version corrigée de updateProgress.
  function polishServicePage(){
    const st=document.createElement('style');
    st.textContent='#page-service{padding-bottom:calc(28px + env(safe-area-inset-bottom))}'
      +'#merutag.is-addr{font-size:clamp(10px,3vw,12px);letter-spacing:-.1px;padding-left:10px;padding-right:10px}'
      // Étape en cours : cercle bleu plein (dégradé de marque) avec chiffre blanc
      +'#orderProgress .op-step.active i{background:var(--brand-grad) !important;color:#fff !important;border-color:transparent !important;box-shadow:0 4px 14px -4px rgba(var(--brand-b-rgb),.6)}'
      // Solde insuffisant : « + Fonds » mis en avant (le bouton de paiement garde le style principal)
      +'.pay-wallet-add.cb-need{background:var(--brand-grad) !important;color:var(--brand-ink) !important;border-color:transparent !important;font-weight:700;animation:cbNeed 1.6s ease-in-out infinite}'
      +'@keyframes cbNeed{0%,100%{box-shadow:0 0 0 0 rgba(var(--brand-b-rgb),.5)}50%{box-shadow:0 0 0 8px rgba(var(--brand-b-rgb),0)}}'
      // Le message « il manque X HTG » est masqué quand le bouton propose déjà « Ajouter X HTG »
      +'#payWalletHint.cb-hide{display:none !important}';
    document.head.appendChild(st);

    // On ne juge le solde qu'une fois qu'il a été lu au moins une fois sur la page de commande
    let balKnown=false;
    const basePayRefresh=window.payWalletRefresh;
    if(typeof basePayRefresh==='function'){
      window.payWalletRefresh=async function(){
        try{return await basePayRefresh.apply(this,arguments);}
        finally{balKnown=true;}
      };
    }
    // Montant manquant (HTG, arrondi au-dessus) ; 0 si le solde suffit ou si rien n'est choisi
    function missingFunds(){
      if(!balKnown||typeof walletBal!=='number')return 0;
      const q=Number(document.getElementById('qty').value);
      if(!(q>0))return 0;
      const total=Math.round(q*getRateForAmount(q)*100)/100;
      return total>walletBal?Math.ceil(total-walletBal):0;
    }
    function formReady(){
      return typeof obNextStep==='function'&&!obNextStep().wait;
    }
    // Boutons « Payer » et « Confirmer » : si le solde ne suffit pas (et que le formulaire est complet),
    // ils ouvrent l'ajout de fonds au lieu d'envoyer la commande
    document.addEventListener('click',e=>{
      const b=e.target.closest('#obConfirm,#submitOrder');
      if(!b)return;
      const miss=missingFunds();
      if(miss>0&&formReady()){
        e.stopPropagation();e.preventDefault();
        showPage('wallet');
        setTimeout(()=>walletOpenSheet(miss),60);
      }
    },true);

    const baseProgress=window.updateProgress;
    if(typeof baseProgress!=='function')return;
    window.updateProgress=function(){
      baseProgress.apply(this,arguments);
      try{
        // Paiement par solde : l'étape « Paiement » n'est validée qu'une fois la commande envoyée.
        // Tant que les étapes 1 et 2 sont faites, c'est elle l'étape en cours (bleue).
        const steps=Array.from(document.querySelectorAll('#orderProgress .op-step'));
        if(window.cbWallet&&window.cbWallet.on&&steps.length===3){
          const ready=steps[0].classList.contains('done')&&steps[1].classList.contains('done');
          steps[2].classList.remove('done');
          steps[2].classList.toggle('active',ready);
          const bar=document.getElementById('orderProgress');
          if(bar)bar.style.setProperty('--op',steps.filter(s=>s.classList.contains('done')).length);
        }
        // Adresse wallet Plasma : police réduite pour tenir dans le champ, forme courte dans l'état
        const mt=document.getElementById('merutag'),ws=document.getElementById('walletStatus');
        if(mt)mt.classList.toggle('is-addr',!!currentService&&currentService.id==='Plasma One Auto');
        if(mt&&ws&&ws.classList.contains('ok')){
          const v=mt.value.trim();
          if(/^0x[a-fA-F0-9]{40}$/.test(v)&&ws.textContent.indexOf('…')<0)ws.textContent='✓ Adresse valide · '+v.slice(0,6)+'…'+v.slice(-4);
        }
        // Récapitulatif : frais = total à payer − (montant × taux affiché).
        // Montré en HTG avec l'équivalent en dollars ; « Inclus » si nul.
        const feeEl=document.querySelector('#page-service .fee-included');
        if(feeEl){
          const q=Number(document.getElementById('qty').value);
          let txt='Inclus';
          if(Number.isFinite(q)&&q>0){
            const shown=Number(RATE);
            const fee=Math.round((q*getRateForAmount(q)-q*shown)*100)/100;
            if(fee>0){
              txt=fmt(fee)+' HTG';
              if(shown>0)txt+=' (≈ '+fmt(Math.round(fee/shown*100)/100)+' $)';
            }
          }
          if(feeEl.textContent!==txt)feeEl.textContent=txt;
        }
        // Solde insuffisant : « + Fonds » en couleur, boutons « Payer » et « Confirmer » = « Ajouter X HTG »
        const miss=missingFunds();
        const fund=miss>0&&formReady();
        const addBtn=document.querySelector('#payWalletCard .pay-wallet-add');
        if(addBtn)addBtn.classList.toggle('cb-need',miss>0);
        const hint=document.getElementById('payWalletHint');
        if(hint)hint.classList.toggle('cb-hide',fund);
        const pay=document.getElementById('submitOrder'),payTxt=document.getElementById('submitOrderText'),spin=document.getElementById('submitOrderSpinner');
        const loading=!!spin&&!spin.classList.contains('hidden');
        if(pay&&payTxt&&!loading){
          if(fund){
            pay.classList.add('cb-fund');
            const t='Ajouter '+fmt(miss)+' HTG';
            if(payTxt.textContent!==t)payTxt.textContent=t;
          }else if(pay.classList.contains('cb-fund')){
            pay.classList.remove('cb-fund');
            payTxt.textContent='Payer avec mon solde';
          }
        }
        const ob=document.getElementById('obConfirm');
        if(ob&&fund&&!ob.classList.contains('loading')){
          ob.textContent='Ajouter '+fmt(miss)+' HTG';
          ob.classList.remove('is-wait');
        }
      }catch(_){}
    };
    // Le mode « paiement par solde » s'active après le chargement du solde : on rafraîchit tant que la page est ouverte
    setInterval(()=>{
      const p=document.getElementById('page-service');
      if(p&&!p.classList.contains('hidden'))window.updateProgress();
    },700);
  }
  polishServicePage();

  // Accueil : toutes les cartes de service gardent le même format vertical
  // (admin.js met « wide » sur la dernière carte quand le nombre est impair ; on retire cette classe).
  function keepCardsVertical(){
    const list=document.getElementById('servicesList');
    if(!list)return;
    const strip=()=>list.querySelectorAll('.service-card.wide').forEach(c=>c.classList.remove('wide'));
    strip();
    new MutationObserver(strip).observe(list,{childList:true,subtree:true});
  }
  // Les boutons « Retour aux services », « Explorer les services », « Faire une recharge » et
  // « Acheter avec mon solde » (Portefeuille) ramènent à l'onglet Services
  // (ce gestionnaire passe après ceux de app.js et portefeuille.js, donc il a le dernier mot).
  function routeToServices(){
    document.addEventListener('click',e=>{
      if(e.target.closest('#backHome,#svClose,#emptyGo,#cbhExplore,#walletBuyBtn'))window.showPage('services');
    });
  }
  function addSearchAndFilters(){
    const services=document.getElementById('servicesList');
    if(services && !document.getElementById('serviceSearch')){
      const wrap=document.createElement('div'); wrap.className='cb-tools cb-service-tools';
      wrap.innerHTML='<label class="cb-search-label" for="serviceSearch">Trouver un service</label><div class="cb-searchbox"><span aria-hidden="true">⌕</span><input id="serviceSearch" type="search" placeholder="Rechercher un service…" autocomplete="off"><button type="button" id="clearServiceSearch" aria-label="Effacer la recherche" hidden>✕</button></div><p class="cb-tool-hint">Recherche parmi les services disponibles.</p>';
      services.parentNode.insertBefore(wrap,services);
      const input=wrap.querySelector('#serviceSearch'), clear=wrap.querySelector('#clearServiceSearch');
      const apply=()=>{const q=input.value.trim().toLocaleLowerCase('fr');clear.hidden=!q;let visible=0;services.querySelectorAll(':scope > *').forEach(card=>{const match=!q||card.textContent.toLocaleLowerCase('fr').includes(q);card.hidden=!match;if(match)visible++;});let empty=wrap.querySelector('.cb-no-results');if(q&&visible===0){if(!empty){empty=document.createElement('div');empty.className='cb-no-results';empty.textContent='Aucun service ne correspond à cette recherche.';wrap.appendChild(empty);}}else if(empty)empty.remove();};
      input.addEventListener('input',apply);clear.addEventListener('click',()=>{input.value='';apply();input.focus();});
      new MutationObserver(apply).observe(services,{childList:true,subtree:true});
    }
    const orders=document.getElementById('ordersList');
    if(orders && !document.getElementById('orderSearch')){
      const wrap=document.createElement('div');wrap.className='cb-tools cb-order-tools';
      wrap.innerHTML='<label class="cb-search-label" for="orderSearch">Rechercher une commande</label><div class="cb-searchbox"><span aria-hidden="true">⌕</span><input id="orderSearch" type="search" placeholder="Service, montant ou statut…" autocomplete="off"></div><div class="cb-filter-row" role="group" aria-label="Filtrer les commandes"><button type="button" class="cb-filter active" data-order-filter="all">Toutes</button><button type="button" class="cb-filter" data-order-filter="pending">En cours</button><button type="button" class="cb-filter" data-order-filter="done">Complétées</button><button type="button" class="cb-filter" data-order-filter="rejected">Rejetées</button></div>';
      orders.parentNode.insertBefore(wrap,orders);
      let active='all';const input=wrap.querySelector('#orderSearch');
      const apply=()=>{const q=input.value.trim().toLocaleLowerCase('fr');let count=0;orders.querySelectorAll('.order').forEach(card=>{const text=card.textContent.toLocaleLowerCase('fr');const status=card.querySelector('.status');const s=(status?.textContent||'').toLocaleLowerCase('fr');const state=s.includes('complétée')?'done':s.includes('rejetée')?'rejected':'pending';const show=(!q||text.includes(q))&&(active==='all'||active===state);card.hidden=!show;if(show)count++;});let empty=wrap.querySelector('.cb-no-results');if(count===0&&orders.querySelector('.order')){if(!empty){empty=document.createElement('p');empty.className='cb-no-results';empty.textContent='Aucune commande ne correspond à ce filtre.';wrap.appendChild(empty);}}else if(empty)empty.remove();};
      input.addEventListener('input',apply);wrap.querySelectorAll('[data-order-filter]').forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.orderFilter;wrap.querySelectorAll('[data-order-filter]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});apply();}));
      new MutationObserver(apply).observe(orders,{childList:true,subtree:true});
    }
  }
  function init(){keepCardsVertical();routeToServices();addSearchAndFilters();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
