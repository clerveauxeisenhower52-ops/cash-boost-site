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

  // ── Page de commande : étapes, marge du bas, adresse wallet ──
  // Exécuté tout de suite (comme l'onglet Services) : app.js branche ses écouteurs plus tard,
  // il récupère donc déjà la version corrigée de updateProgress.
  function polishServicePage(){
    const st=document.createElement('style');
    st.textContent='#page-service{padding-bottom:calc(28px + env(safe-area-inset-bottom))}'
      +'#merutag.is-addr{font-size:clamp(10px,3vw,12px);letter-spacing:-.1px;padding-left:10px;padding-right:10px}';
    document.head.appendChild(st);

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
  // Les boutons « Retour aux services », « Explorer les services », « Faire une recharge » ramènent à l'onglet Services
  // (ce gestionnaire passe après ceux de app.js, donc il a le dernier mot).
  function routeToServices(){
    document.addEventListener('click',e=>{
      if(e.target.closest('#backHome,#svClose,#emptyGo,#cbhExplore'))window.showPage('services');
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
