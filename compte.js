// ---------------- Mon compte : stats, email, mot de passe ----------------
async function loadAccountStats(){
  try{
    const {data:{user}}=await sb.auth.getUser(); if(!user)return;
    const since=$('accSince'); if(since) since.textContent=user.created_at?String(new Date(user.created_at).getFullYear()):'—';
    const ne=$('accNewEmail'); if(ne&&!ne.value) ne.value=user.email||'';
    const {data}=await sb.from('orders').select('total_htg').eq('user_id',user.id).eq('status','complétée');
    const sum=(data||[]).reduce((t,o)=>t+(Number(o.total_htg)||0),0);
    const tb=$('accTotalBuy'); if(tb) tb.textContent=fmt(sum)+' HTG';
  }catch(e){ console.error('loadAccountStats',e); }
}
const ACC_PWD_MIN=10;
function accPwdValid(p){ return p.length>=ACC_PWD_MIN&&/[a-z]/.test(p)&&/[A-Z]/.test(p)&&/\d/.test(p); }
// Texte d'aide affiché dans la fenêtre « Mot de passe » (suit la règle ci-dessus)
(function(){ const t=document.querySelector('#pwdCard .account-text'); if(t) t.textContent='Utilise au moins '+ACC_PWD_MIN+' caractères avec majuscules, minuscules et chiffres.'; })();
// Vérifie le mot de passe actuel avant toute modification sensible
async function accCheckPassword(pass){
  const {data:{user}}=await sb.auth.getUser();
  if(!user||!user.email) return {error:'Session expirée. Reconnecte-toi.'};
  const {error}=await sb.auth.signInWithPassword({email:user.email,password:pass});
  if(error) return {error:/rate|too many/i.test(error.message||'')?'Trop de tentatives. Réessaie dans quelques minutes.':'Mot de passe actuel incorrect.'};
  return {user};
}
(function initAccountForms(){
  const go=$('accGoOrders'); if(!go)return;
  go.addEventListener('click',()=>showPage('orders'));
  $('accEmailBtn').addEventListener('click',async()=>{
    const btn=$('accEmailBtn'),email=$('accNewEmail').value.trim().toLowerCase(),pwd=$('accEmailPwd').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ setMsg('accEmailMsg','Adresse email invalide.','err'); return; }
    if(email===String($('accountEmail').textContent||'').toLowerCase()){ setMsg('accEmailMsg','C’est déjà ton adresse actuelle.','err'); return; }
    if(!pwd){ setMsg('accEmailMsg','Entre ton mot de passe actuel.','err'); return; }
    btn.disabled=true; setMsg('accEmailMsg','Vérification…');
    try{
      const chk=await accCheckPassword(pwd);
      if(chk.error){ setMsg('accEmailMsg',chk.error,'err'); return; }
      const {error}=await sb.auth.updateUser({email},{emailRedirectTo:location.origin+location.pathname});
      if(error){ setMsg('accEmailMsg','Impossible de modifier l’email : '+(error.message||'erreur'),'err'); return; }
      $('accEmailPwd').value='';
      setMsg('accEmailMsg','✅ Un lien de vérification a été envoyé à '+email+'. Ton email changera après confirmation.','ok');
    }catch(e){ setMsg('accEmailMsg','Service momentanément indisponible. Réessaie.','err'); }
    finally{ btn.disabled=false; }
  });
  $('accPwdBtn').addEventListener('click',async()=>{
    const btn=$('accPwdBtn'),old=$('accPwdOld').value,n1=$('accPwdNew').value,n2=$('accPwdNew2').value;
    if(!old){ setMsg('accPwdMsg','Entre ton mot de passe actuel.','err'); return; }
    if(!accPwdValid(n1)){ setMsg('accPwdMsg','Le nouveau mot de passe doit avoir au moins '+ACC_PWD_MIN+' caractères avec majuscules, minuscules et chiffres.','err'); return; }
    if(n1!==n2){ setMsg('accPwdMsg','Les deux mots de passe ne correspondent pas.','err'); return; }
    if(n1===old){ setMsg('accPwdMsg','Le nouveau mot de passe doit être différent de l’actuel.','err'); return; }
    btn.disabled=true; setMsg('accPwdMsg','Vérification…');
    try{
      const chk=await accCheckPassword(old);
      if(chk.error){ setMsg('accPwdMsg',chk.error,'err'); return; }
      const {error}=await sb.auth.updateUser({password:n1});
      if(error){ setMsg('accPwdMsg','Impossible de modifier le mot de passe : '+(error.message||'erreur'),'err'); return; }
      $('accPwdOld').value=''; $('accPwdNew').value=''; $('accPwdNew2').value='';
      setMsg('accPwdMsg','✅ Mot de passe modifié.','ok');
    }catch(e){ setMsg('accPwdMsg','Service momentanément indisponible. Réessaie.','err'); }
    finally{ btn.disabled=false; }
  });
})();

const PASSKEY_OK=!!(window.PublicKeyCredential&&sb.auth&&typeof sb.auth.registerPasskey==='function'&&typeof sb.auth.signInWithPasskey==='function'&&sb.auth.passkey);
function passkeyErr(e){
  const m=String((e&&e.message)||e||'');
  if((e&&e.name==='NotAllowedError')||/cancel|notallowed|abort|timed out/i.test(m))return 'Opération annulée.';
  if(/not.?confirmed/i.test(m))return "Confirme d'abord ton e-mail.";
  const detail=[(e&&(e.code||e.name))||'',m].filter(Boolean).join(' : ').slice(0,140);
  return "Impossible d'utiliser la passkey sur cet appareil. Utilise ton mot de passe."+(detail?' ('+detail+')':'');
}
async function loadPasskeys(){
  const card=$('passkeyCard');if(!card)return;
  if(!PASSKEY_OK){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  const list=$('passkeyList');
  try{
    const {data,error}=await sb.auth.passkey.list();
    if(error)throw error;
    const arr=Array.isArray(data)?data:(data&&data.passkeys)||[];
    list.innerHTML=arr.length?arr.map(p=>`<div class="passkey-item"><div><strong>${esc(p.friendly_name||'Passkey')}</strong><small>Ajoutée le ${esc(fmtDateTime(p.created_at))}</small></div><button type="button" class="link danger" data-pk-del="${esc(p.id)}">Supprimer</button></div>`).join(''):'<p class="account-text">Aucune passkey enregistrée sur ce compte.</p>';
  }catch(_){list.innerHTML='<p class="account-text">Impossible de charger tes passkeys.</p>';}
}
function initPasskeys(){
  const lb=$('passkeyLoginBtn');
  if(lb){
    lb.classList.toggle('hidden',!PASSKEY_OK||isSignup);
    lb.addEventListener('click',async()=>{
      setMsg('authMsg','');lb.disabled=true;
      try{const {error}=await sb.auth.signInWithPasskey();if(error)setMsg('authMsg',passkeyErr(error),'err');}
      catch(e){setMsg('authMsg',passkeyErr(e),'err');}
      lb.disabled=false;
    });
  }
  const add=$('passkeyAddBtn');
  if(add)add.addEventListener('click',async()=>{
    setMsg('passkeyMsg','');add.disabled=true;
    try{const {error}=await sb.auth.registerPasskey();if(error)setMsg('passkeyMsg',passkeyErr(error),'err');else{setMsg('passkeyMsg','Passkey ajoutée ✓','ok');loadPasskeys();}}
    catch(e){setMsg('passkeyMsg',passkeyErr(e),'err');}
    add.disabled=false;
  });
  const list=$('passkeyList');
  if(list)list.addEventListener('click',async e=>{
    const b=e.target.closest('[data-pk-del]');if(!b)return;
    if(!confirm('Supprimer cette passkey ?'))return;
    b.disabled=true;
    try{const {error}=await sb.auth.passkey.delete({passkeyId:b.dataset.pkDel});if(error)throw error;setMsg('passkeyMsg','Passkey supprimée.','ok');}
    catch(_){setMsg('passkeyMsg','Suppression impossible.','err');}
    loadPasskeys();
  });
}
