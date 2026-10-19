/* Cash Boost UI enhancements: client-side only; existing order/payment logic remains untouched. */
(function(){
  'use strict';
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addSearchAndFilters,{once:true});else addSearchAndFilters();
})();
