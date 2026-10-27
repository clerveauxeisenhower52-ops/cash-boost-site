document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  $('themeToggle').addEventListener('click',toggleTheme);
  $('hdrWallet').addEventListener('click',()=>showPage('wallet'));
  {const hr=$('homeRecharge'); if(hr) hr.addEventListener('click',()=>showPage('wallet'));}
          
  $('googleSignIn')?.addEventListener('click',signInWithGoogle);
  $$('.bottom button').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
  $('backHome')?.addEventListener('click',()=>showPage('home'));

  $('qty').addEventListener('input',(e)=>{
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val !== e.target.value) e.target.value = val;
    updateTotal();
    saveMeruForm();
  });

  $('dec').addEventListener('click',()=>{const c=Number($('qty').value);const n=Number.isFinite(c)&&c>0?Math.max(0,c-1):0;$('qty').value=n||'';updateTotal();saveMeruForm();});
  $('inc').addEventListener('click',()=>{const c=Number($('qty').value);$('qty').value=(Number.isFinite(c)&&c>0?c+1:MIN_QTY);updateTotal();saveMeruForm();});
  document.querySelector('.quick').addEventListener('click',e=>{const b=e.target.closest('button[data-amount]');if(!b)return;$('qty').value=b.dataset.amount;updateTotal();saveMeruForm();});
  $('merutag').addEventListener('input',()=>{saveMeruForm();showSavedHint(!!$('merutag').value.trim());});
  $('merutag').addEventListener('blur',()=>{saveMeruForm();showSavedHint(!!$('merutag').value.trim());});
  $('custPhone').addEventListener('input',()=>{const k=phoneKey();if(k){try{localStorage.setItem(k,$('custPhone').value);}catch(_){}}});

  // Visionneuse des anciennes preuves de paiement (historique client et administration)
  $('proofBack').addEventListener('click',()=>{$('proofViewer').classList.remove('show');$('proofViewerImg').removeAttribute('src');document.body.style.overflow='';});


  const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const LAST_EMAIL_KEY='cashboost_last_email';
  const MAIL_DOMAINS=['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','live.com','yahoo.fr','hotmail.fr','protonmail.com'];
  const MAIL_SAFE=['mail.com','email.com','aol.com','gmx.com','zoho.com','yandex.com','me.com','msn.com','pm.me','proton.me','orange.fr','free.fr'];
  let loginFails=0,resendTimer=null,checkEmailCurrent='';

  function lev(a,b){const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>[i]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
  function suggestEmail(v){
    const m=String(v).trim().toLowerCase().match(/^([^\s@]+)@([^\s@]+)$/);if(!m)return null;
    const dom=m[2];if(MAIL_DOMAINS.includes(dom)||MAIL_SAFE.includes(dom)||dom.length<6)return null;
    let best=null,bd=3;for(const d of MAIL_DOMAINS){const x=lev(dom,d);if(x<bd){bd=x;best=d;}}
    return best?m[1]+'@'+best:null;
  }
  function checkEmailUI(final){
    const v=$('authEmail').value.trim(),ok=EMAIL_RE.test(v),hint=$('emailHint');
    $('emailOk').classList.toggle('hidden',!ok);
    const sug=ok?suggestEmail(v):null;
    if(sug){
      hint.className='hint';hint.innerHTML='Tu voulais dire <button type="button" class="link" id="emailFix"></button> ?';
      $('emailFix').textContent=sug;$('emailFix').onclick=()=>{$('authEmail').value=sug;checkEmailUI(true);};
    }else if(final&&v&&!ok){hint.className='hint err';hint.textContent='Adresse e-mail invalide.';}
    else hint.className='hint hidden';
  }
  $('authEmail').addEventListener('input',()=>checkEmailUI(false));
  $('authEmail').addEventListener('blur',()=>checkEmailUI(true));
  try{const le=localStorage.getItem(LAST_EMAIL_KEY);if(le&&!$('authEmail').value){$('authEmail').value=le;checkEmailUI(false);}}catch(_){}

  const PW_LEVELS=[
    {w:15,c:'var(--danger)',t:'Trop court (8 minimum)'},
    {w:35,c:'var(--danger)',t:'Faible'},
    {w:60,c:'#f59e0b',t:'Moyen'},
    {w:82,c:'var(--success)',t:'Bon'},
    {w:100,c:'var(--success)',t:'Excellent'}
  ];
  function pwScore(p){let s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/\d/.test(p))s++;if(/[^A-Za-z0-9]/.test(p))s++;return s;}
  function updatePwMeter(){
    const p=$('authPass').value,f=$('pwFill'),l=$('pwLabel');
    if(!p){f.style.width='0';l.textContent='8 caractères minimum';return;}
    const s=pwScore(p),lv=p.length<8?0:(s<=1?1:(s===2?2:(s===3?3:4))),L=PW_LEVELS[lv];
    f.style.width=L.w+'%';f.style.background=L.c;l.textContent=L.t;
  }
  $('authPass').addEventListener('input',()=>{if(isSignup)updatePwMeter();});

  function setMode(signup){
    isSignup=signup;
    $('tabLogin').classList.toggle('active',!signup);$('tabSignup').classList.toggle('active',signup);
    $('tabLogin').setAttribute('aria-selected',String(!signup));$('tabSignup').setAttribute('aria-selected',String(signup));
    ['nameField','phoneField','termsRow','pwMeter'].forEach(id=>$(id).classList.toggle('hidden',!signup));
    $('forgotRow').classList.toggle('hidden',signup);
    $('passkeyLoginBtn').classList.toggle('hidden',signup||!PASSKEY_OK);
    $('authTitle').textContent=signup?'Créer un compte':'Se connecter';
    $('authSubmit').textContent=signup?'Créer mon compte':'Se connecter';
    $('authPass').setAttribute('autocomplete',signup?'new-password':'current-password');
    $('authEmail').setAttribute('autocomplete',signup?'email':'username');
    $('authPass').placeholder=signup?'8 caractères minimum':'Ton mot de passe';
    $('authReassure').textContent=signup?'🔒 Inscription gratuite · Tes données restent privées':'🔒 Connexion sécurisée';
    $('googleHint').classList.toggle('hidden',!signup);
    setMsg('authMsg','');
    if(signup)updatePwMeter();
  }
  $('tabLogin').addEventListener('click',()=>setMode(false));
  $('tabSignup').addEventListener('click',()=>setMode(true));

  function startResendTimer(){
    clearInterval(resendTimer);let s=60;const b=$('resendBtn');b.disabled=true;b.textContent="Renvoyer l'e-mail ("+s+"s)";
    resendTimer=setInterval(()=>{s--;if(s<=0){clearInterval(resendTimer);b.disabled=false;b.textContent="Renvoyer l'e-mail";}else b.textContent="Renvoyer l'e-mail ("+s+"s)";},1000);
  }
  function showCheck(email){
    checkEmailCurrent=email;$('checkEmail').textContent=email;
    const dom=(email.split('@')[1]||'').toLowerCase();
    $('openMail').classList.toggle('hidden',!(dom==='gmail.com'||dom==='googlemail.com'));
    $('loginCard').classList.add('hidden');$('checkCard').classList.remove('hidden');
    setMsg('checkMsg','');startResendTimer();
  }
  $('resendBtn').addEventListener('click',async()=>{
    const b=$('resendBtn');b.disabled=true;
    const {error}=await sb.auth.resend({type:'signup',email:checkEmailCurrent});
    if(error){setMsg('checkMsg',authErr(error.message),'err');b.disabled=false;return;}
    setMsg('checkMsg','E-mail renvoyé ✓','ok');startResendTimer();
  });
  $('checkBack').addEventListener('click',()=>{clearInterval(resendTimer);$('checkCard').classList.add('hidden');$('loginCard').classList.remove('hidden');setMode(false);});

  const LEGAL={
    terms:{t:"Conditions d'utilisation",b:`<p><b>1. Service.</b> Cash Boost te permet de commander des recharges et des cartes numériques, payées avec ton solde Cash Boost (portefeuille).</p>
<p><b>2. Commande.</b> Le total de ta commande est débité de ton solde au moment où tu la valides. Elle est ensuite traitée automatiquement ou par notre équipe. Les délais affichés sont indicatifs.</p>
<p><b>3. Informations saisies.</b> Tu es responsable de l'exactitude de l'identifiant, de l'adresse ou de l'e-mail indiqué. Une erreur de saisie peut entraîner une livraison au mauvais compte.</p>
<p><b>4. Solde et dépôts.</b> Pour commander, ton solde doit couvrir le total affiché. Tu alimentes ton solde par un dépôt (MonCash, NatCash ou USDT), crédité après vérification du paiement. Un dépôt incomplet, incorrect ou envoyé sur le mauvais réseau peut être retardé ou ne pas être crédité.</p>
<p><b>5. Annulation et remboursement.</b> Une recharge ou une carte déjà livrée ne peut pas être annulée, sauf erreur de notre part. Si une commande est rejetée ou si la recharge échoue, le montant débité est remboursé sur ton solde. En cas de problème, écris-nous sur WhatsApp.</p>
<p><b>6. Usage.</b> Toute fraude (fausse référence de transaction lors d'un dépôt, abus du solde, par exemple) peut entraîner la suspension du compte.</p>
<p><b>7. Modifications.</b> Les taux et les services peuvent changer. Le prix qui compte est celui affiché au moment de ta commande.</p>`},
    privacy:{t:"Politique de confidentialité",b:`<p><b>Données collectées.</b> Ton nom, ton e-mail, ton numéro WhatsApp (si tu le donnes), l'historique de tes commandes et les mouvements de ton portefeuille (dépôts, achats, transferts). Pour les anciennes commandes, les preuves de paiement que tu avais envoyées sont aussi conservées.</p>
<p><b>Utilisation.</b> Uniquement pour traiter tes commandes et tes dépôts, te contacter à leur sujet et t'envoyer des notifications si tu les actives.</p>
<p><b>Partage.</b> Tes données ne sont pas vendues. Elles sont accessibles à l'équipe Cash Boost pour traiter les commandes.</p>
<p><b>Stockage.</b> Les données sont conservées dans une base de données sécurisée tant que ton compte existe.</p>
<p><b>Sur ton appareil.</b> Ton e-mail, ton thème et ton brouillon de commande peuvent être mémorisés pour te faciliter la prochaine visite.</p>
<p><b>Tes droits.</b> Tu peux demander la modification ou la suppression de tes données en nous écrivant sur WhatsApp.</p>`}
  };
  function openLegal(k){const d=LEGAL[k];if(!d)return;$('legalTitle').textContent=d.t;$('legalBody').innerHTML=d.b;$('legalModal').classList.remove('hidden');}
  function closeLegal(){$('legalModal').classList.add('hidden');}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-legal]');if(b){e.preventDefault();openLegal(b.dataset.legal);}});
  $('legalClose').addEventListener('click',closeLegal);
  initPasskeys();
  $('legalModal').addEventListener('click',e=>{if(e.target.id==='legalModal')closeLegal();});

  function authErr(m){
    const s=String(m||'').toLowerCase();
    if(s.includes('invalid login'))return 'E-mail ou mot de passe incorrect.';
    if(s.includes('not confirmed'))return 'Confirme d\'abord ton e-mail (vérifie ta boîte de réception).';
    if(s.includes('already registered')||s.includes('already been registered'))return 'Cet e-mail a déjà un compte. Connecte-toi.';
    if(s.includes('rate limit')||s.includes('too many')||s.includes('seconds'))return 'Trop de tentatives. Réessaie dans quelques minutes.';
    if(s.includes('password'))return 'Mot de passe trop faible (8 caractères minimum).';
    if(s.includes('fetch')||s.includes('network'))return 'Problème de connexion. Vérifie ton internet.';
    return 'Une erreur est survenue. Réessaie.';
  }
  $('pwToggle').addEventListener('click',()=>{
    const i=$('authPass'),show=i.type==='password';
    i.type=show?'text':'password';
    $('pwToggle').textContent=show?'Masquer':'Afficher';
    $('pwToggle').setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');
  });
  ['authEmail','authPass','authName','authPhone'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('authSubmit').click();}}));
  ['newPass','newPass2'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('resetSubmit').click();}}));
  $('authSubmit').addEventListener('click',async()=>{
    const email=$('authEmail').value.trim(),pwd=$('authPass').value;
    if(!email||!pwd){setMsg('authMsg','Remplis tous les champs.','err');return;}
    if(!EMAIL_RE.test(email)){setMsg('authMsg','Adresse e-mail invalide.','err');checkEmailUI(true);return;}
    if(isSignup?pwd.length<8:pwd.length<6){setMsg('authMsg',isSignup?'Minimum 8 caractères.':'E-mail ou mot de passe incorrect.','err');return;}
    const btn=$('authSubmit');
    if(isSignup){
      const full_name=$('authName').value.trim();
      if(!full_name){setMsg('authMsg','Indique ton nom.','err');return;}
      const rawPhone=$('authPhone').value.trim(),phone=rawPhone?normPhone(rawPhone):'';
      if(rawPhone&&phone.length<11){setMsg('authMsg','Numéro WhatsApp invalide. Exemple : 37 12 34 56.','err');return;}
      if(!$('authTerms').checked){setMsg('authMsg','Accepte les conditions pour continuer.','err');return;}
      btn.disabled=true;btn.textContent='Création…';
      const meta={full_name};if(phone)meta.phone=phone;
      const {data:su,error}=await sb.auth.signUp({email,password:pwd,options:{data:meta}});
      btn.disabled=false;btn.textContent='Créer mon compte';
      if(error){setMsg('authMsg',authErr(error.message),'err');return;}
      if(su?.user&&Array.isArray(su.user.identities)&&su.user.identities.length===0){setMsg('authMsg',authErr('already registered'),'err');return;}
      try{localStorage.setItem(LAST_EMAIL_KEY,email);}catch(_){}
      if(!su?.session)showCheck(email);
    }else{
      btn.disabled=true;btn.textContent='Connexion…';
      const {error}=await sb.auth.signInWithPassword({email,password:pwd});
      btn.disabled=false;btn.textContent='Se connecter';
      if(error){
        if(/not confirmed/i.test(error.message)){showCheck(email);return;}
        if(/invalid login/i.test(error.message))loginFails++;
        if(loginFails>=3){$('forgotBtn').classList.add('emph');setMsg('authMsg','E-mail ou mot de passe incorrect. Mot de passe oublié ? Touche le bouton ci-dessous.','err');return;}
        setMsg('authMsg',authErr(error.message),'err');return;
      }
      loginFails=0;$('forgotBtn').classList.remove('emph');
      try{localStorage.setItem(LAST_EMAIL_KEY,email);}catch(_){}
    }
  });

  $('forgotBtn').addEventListener('click',async()=>{
    const email=$('authEmail').value.trim();
    if(!email){setMsg('authMsg','Entre ton e-mail.','err');return;}
    const btn=$('forgotBtn');btn.disabled=true;
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    if(error){setMsg('authMsg','Impossible d\'envoyer. Écris-nous sur WhatsApp.','err');btn.disabled=false;return;}
    setMsg('authMsg','Un lien de réinitialisation vient d\'être envoyé.','ok');
    setTimeout(()=>{btn.disabled=false;},60000);
  });

  $('resetSubmit').addEventListener('click',async()=>{
    const a=$('newPass').value,b=$('newPass2').value;
    if(a.length<8){setMsg('resetMsg','Minimum 8 caractères.','err');return;}
    if(a!==b){setMsg('resetMsg','Les mots de passe ne correspondent pas.','err');return;}
    const btn=$('resetSubmit');btn.disabled=true;
    const {error}=await sb.auth.updateUser({password:a});
    btn.disabled=false;
    if(error){setMsg('resetMsg',authErr(error.message),'err');return;}
    recoveryMode=false;history.replaceState(null,'',location.pathname);
    $('newPass').value='';$('newPass2').value='';
    $('resetCard').classList.add('hidden');$('loginCard').classList.remove('hidden');
    const {data:{session}}=await sb.auth.getSession();
    await handleAuth('SIGNED_IN',session);
  });

  $('logout').addEventListener('click',async()=>{
    try{const sub=await currentPushSub();if(sub)await sb.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);}catch(_){}
    localStorage.removeItem('cashboost_last_page');
    localStorage.removeItem('cashboost_last_service');
    currentUserId=null;
    await sb.auth.signOut();
  });

  $('pushBtn').addEventListener('click',async()=>{
    const btn=$('pushBtn');setMsg('pushMsg','');btn.disabled=true;
    try{
      if(btn.dataset.state==='on'){await disablePush();}
      else{
        const r=await enablePush();
        if(r==='granted'){setMsg('pushMsg','Notifications activées ✓','ok');pushNudgeHideAll();}
        else if(r==='save_error'){setMsg('pushMsg','Impossible d\'enregistrer.','err');btn.disabled=false;return;}
        else if(r==='denied'||r==='default'){setMsg('pushMsg','Autorisation refusée.','err');btn.disabled=false;refreshPushUI();return;}
        else setMsg('pushMsg','Erreur. Réessaie.','err');
      }
    }catch(e){setMsg('pushMsg','Erreur. Réessaie.','err');}
    btn.disabled=false;refreshPushUI();
  });

  const closeSuccess=()=>{$('successView').classList.remove('show');$('successView').setAttribute('aria-hidden','true');};
  $('svView').addEventListener('click',()=>{closeSuccess();focusOrderUntil=Date.now()+8000;showPage('orders');});
  $('svClose').addEventListener('click',()=>{closeSuccess();showPage('home');});
  $('svReorder')?.addEventListener('click',()=>{
    closeSuccess();
    if(currentService) openService(currentService.id);
    else showPage('home');
  });
  $('merutag').addEventListener('input',updateWalletStatus);
  $('walletPaste').addEventListener('click',async()=>{
    const inp=$('merutag');
    const fallback=msg=>{inp.focus();try{inp.select();}catch(_){}showToast(msg,6000);};
    try{
      if(!(navigator.clipboard&&navigator.clipboard.readText))throw {name:'Unsupported'};
      const t=String((await navigator.clipboard.readText())||'').trim();
      if(!t){showToast('Le presse-papiers est vide. Copie d\'abord ton adresse.');return;}
      inp.value=t;inp.dispatchEvent(new Event('input',{bubbles:true}));
    }catch(e){
      fallback(e&&e.name==='NotAllowedError'
        ?'Accès au presse-papiers refusé. Appuie longuement dans le champ, puis choisis « Coller ».'
        :'Le bouton Coller ne marche pas ici. Appuie longuement dans le champ, puis choisis « Coller ».');
    }
  });
  $('obConfirm').addEventListener('click',()=>{
    const n=obNextStep();
    if(n.target){const t=$(n.target);if(t)t.scrollIntoView({behavior:'smooth',block:'center'});return;}
    $('submitOrder').click();
  });
  // La barre collante disparaît quand le vrai bouton « Confirmer ma commande » est à l'écran (pas de doublon)
  if('IntersectionObserver' in window){
    const so=$('submitOrder'),obar=document.querySelector('.ob');
    if(so&&obar)new IntersectionObserver(es=>{es.forEach(e=>obar.classList.toggle('ob-hidden',e.isIntersecting));},{threshold:0.6}).observe(so);
  }
  $$('#orderProgress .op-step').forEach(b=>b.addEventListener('click',()=>$(b.dataset.go).scrollIntoView({behavior:'smooth',block:'start'})));
  document.addEventListener('input',updateProgress);document.addEventListener('change',updateProgress);

  // Commande : toujours payée avec le solde du portefeuille (fonction serveur wallet_purchase_idem).
  // Le débit et la création de la commande se font ensemble côté serveur.
  let orderInFlight=false;
  const doSubmitOrderInner=async()=>{
    setMsg('orderMsg','');$('orderSuccess').classList.remove('show');
    if(!currentService){setMsg('orderMsg','Choisis un service.','err');return;}

    const isPlasma = currentService.id === 'Plasma One Auto';
    const isPocket = currentService.id === 'pocket-option';
    const qty=Number($('qty').value),merutag=$('merutag').value.trim();
    const phone=normPhone($('custPhone').value);
    const errs={};

    if(!Number.isFinite(qty)||qty<MIN_QTY)errs.qty=qty>0?'Minimum : '+MIN_QTY+' USD.':'Entre un montant (minimum '+MIN_QTY+' USD).';
    if(!merutag)errs.merutag='Renseigne « '+currentService.field_label+' ».';

    if(isPlasma && merutag && (!/^0x[a-fA-F0-9]{40}$/.test(merutag) || /^0x0{40}$/.test(merutag))){
      errs.merutag = 'Adresse wallet invalide. Doit commencer par 0x et faire 42 caractères.';
    }
    if(phone.length<11)errs.custPhone='Numéro invalide. Exemple : 37 12 34 56.';

    showFieldErrs(errs);
    if(Object.keys(errs).length){scrollToErr();return;}
    if(!(await askConfirm({qty,merutag,phone,total:qty*getRateForAmount(qty)})))return;
    const {data:{user}}=await sb.auth.getUser();
    if(!user){setMsg('orderMsg','Session expirée. Reconnecte-toi.','err');return;}

    setSubmitLoading(true,'Paiement avec ton solde…');
    const total=qty*getRateForAmount(qty);
    const {data:ins,error}=await walletBuy({service:currentService.id,qty,merutag,phone});
    setSubmitLoading(false);
    if(error){setMsg('orderMsg',(error&&error.userMessage)||'Impossible d\'enregistrer la commande.','err');return;}

    if(isPlasma){
      setSubmitLoading(true,'Envoi des USDT…');
      try {
        const { data: verif, error: verifErr } = await sb.functions.invoke('verify-receipt', {
          body: { orderId: ins.id }
        });

        if(verifErr){
          console.error('verify-receipt error:', verifErr);
          showToast('ℹ️ Commande reçue · vérification en cours');
        } else if(verif?.auto_validated && verif?.envoi?.startsWith('envoye')){
          showToast('✅ −'+fmt(total)+' HTG · payé avec ton solde · 💸 USDT envoyés', 8000);
        } else if(verif?.auto_validated && verif?.envoi?.startsWith('broadcast')){
          showToast('✅ −'+fmt(total)+' HTG · payé avec ton solde · 💸 USDT en route', 8000);
        } else if(verif?.auto_validated){
          showToast('✅ −'+fmt(total)+' HTG · payé avec ton solde · traitement en cours', 8000);
        } else if(verif?.user_message){
          showToast('⚠️ ' + verif.user_message, 10000);
          setTimeout(() => {
            const paySection = $('secPay');
            if(paySection) paySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 3500);
        } else {
          showToast('ℹ️ Commande reçue · vérification en cours');
        }
      } catch(e){
        console.error('Erreur auto-validation:', e);
      } finally {
        setSubmitLoading(false);
      }
    }

    lastOrderId=ins?.id||null;
    $('svNum').textContent=ins?.id?'#'+String(ins.id).slice(0,6).toUpperCase():'—';
    $('svAmt').textContent=qty+' USD · '+fmt(total)+' HTG';
    // Sous-titre de l'écran de succès : le paiement est déjà débité du solde, donc validé
    const svSub=document.querySelector('#successView .sv-card > p:not(#svNote)');
    if(svSub) svSub.textContent = 'Ton paiement est validé.';
    const afterHours = !isOpenNow();
    if(isPlasma || isPocket){
      // Services automatiques : pas de notion d'horaires, les USDT partent dès que le paiement est vérifié
      $('svEta').textContent = 'Instantané';
      const note = $('svNote');
      if(note) note.textContent = 'Tes USDT sont envoyés automatiquement dès que ton paiement est vérifié.';
    } else if(afterHours){
      $('svEta').textContent = 'Dès l\'ouverture (8h)';
      const note = $('svNote');
      if(note) note.innerHTML = 'Commande reçue <strong>hors horaires</strong>. On te prévient sur WhatsApp <strong>dès l\'ouverture</strong> (8h00, heure d\'Haïti).';
    } else {
      $('svEta').textContent = currentService.delivery || '5 à 60 min';
      const note = $('svNote');
      if(note) note.textContent = 'On te prévient sur WhatsApp dès que c\'est prêt.';
    }
    clearMeruForm();
    $('successView').classList.add('show');$('successView').setAttribute('aria-hidden','false');
    launchConfetti();
    pushNudgeShow();
    loadMyOrders();
    payWalletRefresh();
  };

  async function doSubmitOrder(){
    if(orderInFlight)return;
    orderInFlight=true;
    try{ await doSubmitOrderInner(); }
    finally{ orderInFlight=false; }
  }
  $('submitOrder').addEventListener('click',()=>doSubmitOrder());

  (function(){
    const so=$('prefSound'),te=$('prefTest');
    if(!so)return;
    so.checked=prefOn(PREF_SOUND);
    so.addEventListener('change',()=>{ setPref(PREF_SOUND,so.checked); if(so.checked) beep(true); });
    if(te) te.addEventListener('click',()=>{
      if(!so.checked){ showToast('Le son est désactivé.'); return; }
      beep(true);
    });
  })();

  document.querySelectorAll('.admin-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('active',b===btn));
      $('adminServicesPane').classList.toggle('hidden',t!=='services');
      $('adminList').classList.toggle('hidden',t!=='orders');
      $('adminSearchWrap').classList.toggle('hidden',t!=='orders');
    });
  });
  $('saveSettings').addEventListener('click',async()=>{
    const wa=$('setWhatsapp').value.replace(/\D/g,'');
    const rows=[...document.querySelectorAll('#servicesAdmin .svc-edit')].map(box=>({id:box.dataset.id,...readSvcBox(box)}));
    for(const r of rows){const err=checkSvc(r);if(err){setMsg('settingsMsg',err,'err');return;}if(!Number.isFinite(r.rate))r.rate=0;if(!Number.isFinite(r.effective_rate))r.effective_rate=0;if(!Number.isFinite(r.min_qty))r.min_qty=5;}
    const btn=$('saveSettings');btn.disabled=true;let failed=false;
    for(const r of rows){
      const upd={name:r.name,description:r.description,field_label:r.field_label,field_placeholder:r.field_placeholder,delivery:r.delivery,rate:r.rate,effective_rate:r.effective_rate,min_qty:r.min_qty,active:r.active,visible:r.visible,rate_tiers:r.rate_tiers};
      if(r.file){try{upd.logo=await fileToLogo(r.file);}catch(_){setMsg('settingsMsg','Logo invalide.','err');btn.disabled=false;return;}}
      const {error}=await sb.from('services').update(upd).eq('id',r.id);
      if(error)failed=true;
    }
    const {error:e2}=await sb.from('settings').upsert({key:'whatsapp',value:wa});if(e2)failed=true;
    btn.disabled=false;
    if(failed){setMsg('settingsMsg','Erreur d\'enregistrement.','err');return;}
    await loadSettings();fillSettingsForm();
    setMsg('settingsMsg','Enregistré ✓','ok');
  });

  $('adminList').addEventListener('click',async e=>{
    const b=e.target.closest('.copy-tag');if(!b)return;
    const v=b.dataset.copy;
    try{await navigator.clipboard.writeText(v);}
    catch(_){const t=document.createElement('textarea');t.value=v;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(__){}t.remove();}
    b.classList.add('copied');showToast('MeruTag copié : '+v);
    setTimeout(()=>b.classList.remove('copied'),1500);
  });
  $('adminSearch').addEventListener('input',e=>{adminQuery=e.target.value;if(adminCache.length)renderAdmin(adminCache);});

  $('addSvcBtn').addEventListener('click',()=>{
    const box=$('newSvcBox');
    if(!box.classList.contains('hidden')){box.classList.add('hidden');return;}
    box.innerHTML='<h4>Nouveau service</h4>'+svcFieldsHtml({min_qty:5,active:true,rate_tiers:[]})+'<button id="createSvc" type="button" class="primary-btn" style="margin-top:6px">Créer</button><div id="newSvcMsg" class="msg"></div>';
    box.classList.remove('hidden');
    bindTiersUI(box);
    $('createSvc').addEventListener('click',createService);
    box.scrollIntoView({behavior:'smooth',block:'start'});
  });

  async function createService(){
    const box=$('newSvcBox'),r=readSvcBox(box),err=checkSvc(r);
    if(err){setMsg('newSvcMsg',err,'err');return;}
    if(!Number.isFinite(r.rate))r.rate=0;if(!Number.isFinite(r.effective_rate))r.effective_rate=0;if(!Number.isFinite(r.min_qty))r.min_qty=5;
    const btn=$('createSvc');btn.disabled=true;let logo=null;
    if(r.file){try{logo=await fileToLogo(r.file);}catch(_){setMsg('newSvcMsg','Logo invalide.','err');btn.disabled=false;return;}}
    let id=slugify(r.name),n=2;
    while(SERVICES.some(x=>x.id===id))id=slugify(r.name)+'-'+n++;
    const sort=SERVICES.reduce((m,x)=>Math.max(m,Number(x.sort)||0),0)+1;
    const {error}=await sb.from('services').insert({id,name:r.name,description:r.description||('Recharge ton compte '+r.name+' avec MonCash ou NatCash.'),delivery:r.delivery,field_label:r.field_label,field_placeholder:r.field_placeholder,rate:r.rate,effective_rate:r.effective_rate,min_qty:r.min_qty,active:r.active,visible:r.visible,sort,logo,rate_tiers:r.rate_tiers});
    btn.disabled=false;
    if(error){setMsg('newSvcMsg','Erreur de création.','err');return;}
    await loadSettings();fillSettingsForm();
    box.classList.add('hidden');
    setMsg('settingsMsg','Service « '+r.name+' » ajouté ✓','ok');
  }

  updateTotal();loadSettings();
  updateOpeningHoursNotice();
  setInterval(updateOpeningHoursNotice, 60_000);
  // Supabase déconseille d'attendre (await) d'autres appels Supabase dans ce callback : risque de blocage.
  // On décale donc le traitement d'un tour de boucle.
  sb.auth.onAuthStateChange((e,s)=>{ setTimeout(()=>handleAuth(e,s),0); });
  // Hors ligne au démarrage : pas d'attente du serveur, on ouvre l'appli tout de suite
  if(!navigator.onLine){ const u=cachedAuthUser(); if(u) enterOffline(u).finally(hideSplash); }
  // Retour de la connexion : on rouvre la vraie session (le jeton est renouvelé automatiquement)
  window.addEventListener('online',async()=>{
    if(!offlineMode) return;
    try{ const {data:{session}}=await sb.auth.getSession(); if(session){ offlineMode=false; await handleAuth('SIGNED_IN',session); } }catch(_){}
  });
  if(_recoveryLinkError){setTimeout(()=>{try{setMsg('authMsg','Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien avec « Mot de passe oublié ? ».','err');}catch(_){}},600);try{history.replaceState(null,'',location.pathname);}catch(_){}}
  // Splash screen supprimé après 9 secondes
setTimeout(()=>{if($('authView').classList.contains('hidden')&&$('appView').classList.contains('hidden'))showAuth();hideSplash();},9000);

  function syncOnline(){const b=$('offlineBar');if(b)b.hidden=navigator.onLine;}
  window.addEventListener('online',syncOnline);window.addEventListener('offline',syncOnline);syncOnline();
  
  // ⚠️ AUTO-RELOAD DÉSACTIVÉ : Permet de quitter l'app pour lire le SMS sans perdre sa saisie.
  // window.addEventListener('focus', detectUpdate);
  // window.addEventListener('pageshow', detectUpdate);
  // document.addEventListener('visibilitychange', () => { if (!document.hidden) detectUpdate(); });
  // detectUpdate();
  // setInterval(detectUpdate, 60000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg => {
        const show = () => window.cbShowUpdate && window.cbShowUpdate(reg);
        if (reg.waiting && navigator.serviceWorker.controller) show();
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) show(); });
        });
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      }).catch(() => {});
    });
  }
});
