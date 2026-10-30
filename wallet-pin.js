// Protection PIN Cash Boost : le serveur vérifie le code et délivre une autorisation à usage unique.
window.cbWalletPinAuthorize = async function(action){
  const status=await sb.rpc('wallet_pin_status');
  if(status.error) throw new Error('Vérification PIN indisponible.');
  if(!status.data?.configured) throw new Error('Configure d’abord ton code PIN dans Mon compte.');
  const pin=window.prompt('Entre ton code PIN à 4 chiffres pour confirmer :');
  if(pin===null) return null;
  if(!/^\\d{4}$/.test(pin)){ showToast('Le PIN doit contenir 4 chiffres.'); return null; }
  const r=await sb.rpc('wallet_pin_verify',{p_pin:pin,p_action:action});
  if(r.error) throw new Error('Vérification PIN indisponible.');
  if(!r.data?.ok){
    const messages={invalid_pin:'Code PIN incorrect.',locked:'Trop d’erreurs. Réessaie dans 15 minutes.',pin_not_set:'Configure d’abord ton code PIN.'};
    showToast(messages[r.data?.status]||'Validation PIN refusée.');
    return null;
  }
  return r.data.authorization;
};
window.cbWalletPinSetup = async function(){
  const status=await sb.rpc('wallet_pin_status');
  if(status.error){showToast('Impossible de vérifier le PIN.');return;}
  if(status.data?.configured){showToast('Un PIN est déjà configuré. La modification sécurisée sera disponible après vérification de l’ancien PIN.');return;}
  const pin=window.prompt('Choisis un PIN à 4 chiffres :');
  if(pin===null)return;
  if(!/^\\d{4}$/.test(pin)){showToast('Le PIN doit contenir exactement 4 chiffres.');return;}
  const confirmPin=window.prompt('Confirme ton PIN :');
  if(confirmPin!==pin){showToast('Les deux codes ne correspondent pas.');return;}
  const r=await sb.rpc('wallet_pin_set',{p_pin:pin});
  if(r.error||!r.data?.ok){showToast(r.data?.status==='pin_already_set'?'Un PIN existe déjà.':'Impossible d’enregistrer le PIN.');return;}
  showToast('Code PIN activé. Il sera demandé avant les achats et transferts.');
};
document.addEventListener('DOMContentLoaded',()=>{
  const account=document.getElementById('page-account');
  const email=document.getElementById('emailCard');
  if(!account||!email||document.getElementById('pinSecurityCard'))return;
  const card=document.createElement('div');
  card.id='pinSecurityCard';card.className='card account card-mt';
  card.innerHTML='<h2 class="account-section-title">Sécurité du portefeuille</h2><p class="account-text">Protège les achats avec ton solde et les transferts avec un code PIN à 4 chiffres.</p><button id="pinSetupBtn" type="button" class="primary-btn">Activer mon code PIN</button><div id="pinSecurityMsg" class="msg" role="status"></div>';
  email.parentNode.insertBefore(card,email);
  document.getElementById('pinSetupBtn').addEventListener('click',window.cbWalletPinSetup);
  sb.rpc('wallet_pin_status').then(r=>{
    const b=document.getElementById('pinSetupBtn');
    if(b&&r.data?.configured)b.textContent='PIN déjà activé';
  }).catch(()=>{});
});
