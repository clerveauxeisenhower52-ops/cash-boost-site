/* Cash Boost : compteur « commandes livrées » sur l'Accueil.
   Le nombre vient de la fonction Supabase delivered_count() (un simple compte, aucune donnée client).
   Il ne s'affiche qu'à partir de MIN_SHOW commandes : change cette valeur pour l'afficher plus tôt ou plus tard. */
(function(){
  'use strict';
  var MIN_SHOW=50;
  var last=0;
  var st=document.createElement('style');
  st.textContent='.cb-delivered{margin:14px 0 4px;padding:10px 14px;border:1px solid var(--primary-line);border-radius:14px;background:var(--primary-soft);color:var(--text-strong);font-size:14px;font-weight:600;text-align:center}.cb-delivered b{font-family:"Space Grotesk",sans-serif;font-size:16px}';
  document.head.appendChild(st);
  function render(n){
    var el=document.getElementById('cbDelivered');
    if(!(n>=MIN_SHOW)){ if(el) el.remove(); return; }
    var txt=String(fmt(n));
    if(!el){
      var anchor=document.querySelector('#page-home .trust');
      if(!anchor) return;
      el=document.createElement('div');
      el.id='cbDelivered';el.className='cb-delivered';el.setAttribute('role','status');
      anchor.parentNode.insertBefore(el,anchor);
    }
    el.innerHTML='✅ <b></b> commandes livrées';
    el.querySelector('b').textContent=txt;
  }
  async function load(){
    if(Date.now()-last<60000) return;
    last=Date.now();
    try{
      var r=await sb.rpc('delivered_count');
      if(r&&!r.error&&r.data!==null&&r.data!==undefined) render(Number(r.data));
    }catch(_){}
  }
  try{
    // Supabase déconseille d'attendre d'autres appels dans ce callback : on décale d'un tour de boucle.
    sb.auth.onAuthStateChange(function(_e,s){ if(s) setTimeout(load,0); });
  }catch(_){}
})();
