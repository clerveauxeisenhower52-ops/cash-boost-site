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
  if(status.data?.configured){showToast('Un PIN existe déjà. Utilise « Modifier mon PIN ».');return;}
  const pin=window.prompt('Choisis un PIN à 4 chiffres :');
  if(pin===null)return;
  if(!/^\\d{4}$/.test(pin)){showToast('Le PIN doit contenir exactement 4 chiffres.');return;}
  const confirmPin=window.prompt('Confirme ton PIN :');
  if(confirmPin!==pin){showToast('Les deux codes ne correspondent pas.');return;}
  const r=await sb.rpc('wallet_pin_set',{p_pin:pin});
  if(r.error||!r.data?.ok){showToast(r.data?.status==='pin_already_set'?'Un PIN existe déjà.':'Impossible d’enregistrer le PIN.');return;}
  showToast('Code PIN activé. Il sera demandé avant les achats et transferts.');
};

window.cbWalletPinChange = async function(){
  const oldPin=window.prompt('Entre ton PIN actuel :'); if(oldPin===null)return;
  const newPin=window.prompt('Choisis ton nouveau PIN à 4 chiffres :'); if(newPin===null)return;
  if(!/^\\d{4}$/.test(oldPin)||!/^\\d{4}$/.test(newPin)){showToast('Chaque PIN doit contenir 4 chiffres.');return;}
  const confirmPin=window.prompt('Confirme le nouveau PIN :'); if(confirmPin!==newPin){showToast('Les deux codes ne correspondent pas.');return;}
  const r=await sb.rpc('wallet_pin_change',{p_old_pin:oldPin,p_new_pin:newPin});
  if(r.error||!r.data?.ok){showToast(r.data?.status==='locked'?'PIN bloqué 15 minutes.':'Modification du PIN refusée. Vérifie ton ancien code.');return;}
  showToast('PIN modifié avec succès.');
};
window.cbWalletPinRecover = async function(){
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError||!user?.email){showToast('Impossible de retrouver ton adresse e-mail de compte.');return;}
  const isolated=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const sent=await isolated.auth.signInWithOtp({email:user.email,options:{shouldCreateUser:false}});
  if(sent.error){showToast('Envoi du code e-mail impossible. Réessaie plus tard.');return;}
  const otp=window.prompt('Un code a été envoyé à '+user.email+'. Entre le code reçu :');
  if(otp===null)return;
  if(!/^\\d{6}$/.test(otp)){showToast('Le code e-mail doit contenir 6 chiffres.');return;}
  const verified=await isolated.auth.verifyOtp({email:user.email,token:otp,type:'email'});
  if(verified.error||verified.data?.user?.id!==user.id){showToast('Code invalide ou compte différent. Recommence.');return;}
  const newPin=window.prompt('Choisis ton nouveau PIN à 4 chiffres :');
  if(newPin===null)return;
  if(!/^\\d{4}$/.test(newPin)){showToast('Le PIN doit contenir 4 chiffres.');return;}
  const confirmPin=window.prompt('Confirme ton nouveau PIN :');
  if(confirmPin!==newPin){showToast('Les deux codes ne correspondent pas.');return;}
  const reset=await isolated.rpc('wallet_pin_recover',{p_new_pin:newPin});
  if(reset.error||!reset.data?.ok){showToast(reset.data?.status==='email_otp_required'?'La vérification e-mail a expiré. Recommence.':'Réinitialisation du PIN impossible.');return;}
  showToast('PIN réinitialisé. Ta session principale reste inchangée.');
  await isolated.auth.signOut();
};

document.addEventListener('DOMContentLoaded',()=>{
  const account=document.getElementById('page-account');
  const email=document.getElementById('emailCard');
  if(!account||!email||document.getElementById('pinSecurityCard'))return;
  const card=document.createElement('div');
  card.id='pinSecurityCard';card.className='card account card-mt';
  card.innerHTML='<h2 class="account-section-title">Sécurité du portefeuille</h2><p class="account-text">Protège les achats avec ton solde et les transferts avec un code PIN à 4 chiffres.</p><button id="pinSetupBtn" type="button" class="primary-btn">Activer mon code PIN</button><button id="pinChangeBtn" type="button" class="secondary-btn">Modifier mon PIN</button><button id="pinRecoverBtn" type="button" class="secondary-btn">PIN oublié ? Recevoir un code par e-mail</button><div id="pinSecurityMsg" class="msg" role="status"></div>';
  email.parentNode.insertBefore(card,email);
  document.getElementById('pinSetupBtn').addEventListener('click',window.cbWalletPinSetup);
  document.getElementById('pinChangeBtn').addEventListener('click',window.cbWalletPinChange);
  document.getElementById('pinRecoverBtn').addEventListener('click',window.cbWalletPinRecover);
  sb.rpc('wallet_pin_status').then(r=>{
    const b=document.getElementById('pinSetupBtn');
    if(b&&r.data?.configured){b.textContent='PIN déjà activé';b.disabled=true;}
  }).catch(()=>{});
});
