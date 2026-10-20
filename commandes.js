function updateTotal(){_updateTotal();updateProgress();}
function _updateTotal(){
  const raw=$('qty').value.trim(),q=Number(raw),t=$('total');
  if(!raw||!Number.isFinite(q)||q<=0){$('summaryUsd').textContent='—';t.textContent='—';return;}
  $('summaryUsd').textContent='$'+q;
  const appliedRate = getRateForAmount(q);
  t.textContent=fmt(q*appliedRate)+' HTG';
  t.classList.remove('bump');void t.offsetWidth;t.classList.add('bump');
}

function askConfirm(o){
  return new Promise(res=>{
    const v=$('confirmView');
    $('cvSvc').textContent=currentService.name;
    $('cvAmt').textContent=o.qty+' USD · '+fmt(o.total)+' HTG';
    $('cvTagLabel').textContent=currentService.field_label||'Compte';
    $('cvTag').textContent=o.merutag;
    $('cvPhone').textContent='+'+o.phone;
    $('cvPay').textContent=(window.cbWallet&&window.cbWallet.on)?'Mon solde':$('payMethod').value;
    const needNet = currentService.id === 'Plasma One Auto';
    const netBox = $('cvNet'), netCheck = $('cvNetCheck'), okBtn = $('cvOk');
    netBox.classList.toggle('show', needNet);
    netCheck.checked = false;
    okBtn.disabled = needNet;
    okBtn.style.opacity = needNet ? '.5' : '';
    netCheck.onchange = () => { okBtn.disabled = needNet && !netCheck.checked; okBtn.style.opacity = okBtn.disabled ? '.5' : ''; };
    const done=r=>{v.classList.remove('show');v.setAttribute('aria-hidden','true');$('cvOk').onclick=null;$('cvCancel').onclick=null;v.onclick=null;netCheck.onchange=null;okBtn.disabled=false;okBtn.style.opacity='';res(r);};
    $('cvOk').onclick=()=>{ if(needNet && !netCheck.checked) return; done(true); };
    $('cvCancel').onclick=()=>done(false);
    v.onclick=e=>{if(e.target===v)done(false);};
    v.classList.add('show');v.setAttribute('aria-hidden','false');
  });
}
function setFieldErr(key,msg){
  let el=$('err_'+key);
  const anchor=key==='qty'?$('qty').closest('.amount-box'):key==='proof'?$('proofUploadZone'):$(key);
  if(!el){el=document.createElement('div');el.id='err_'+key;el.className='field-err';el.setAttribute('role','alert');anchor.after(el);}
  el.textContent=msg||'';el.classList.toggle('show',!!msg);anchor.classList.toggle('invalid',!!msg);
}
function showFieldErrs(errs){['qty','merutag','custPhone','proof'].forEach(k=>setFieldErr(k,errs[k]||''));}
function scrollToErr(){const el=document.querySelector('.field-err.show');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});}
function obNextStep(){
  const q=Number($('qty').value),qtyOk=Number.isFinite(q)&&q>=MIN_QTY;
  const infoOk=!!$('merutag').value.trim()&&normPhone($('custPhone').value).length>=11;
  const isPlasma = currentService && currentService.id === 'Plasma One Auto';
  const proofOk = (window.cbWallet&&window.cbWallet.on) ? true : isPlasma 
    ? (document.getElementById('transcodeInput')?.value.trim().length === codeLenFor($('payMethod').value))
    : !!( $('payProof').files?.[0] || $('payProofCamera').files?.[0] || originalProofFile );
  
  if(!qtyOk)return {label:'Choisis un montant',target:'secAmount',wait:true};
  if(!infoOk)return {label:'Compléter mes infos',target:'secInfo',wait:true};
  if(!proofOk)return {label: isPlasma ? 'Entrer le Transcode' : 'Ajouter la preuve', target: isPlasma ? 'transcodeSection' : 'proofUploadZone', wait:true};
  return {label:'Confirmer',target:null,wait:false};
}
function updateOrderBar(){
  const b=$('obConfirm');if(!b||b.classList.contains('loading'))return;
  const n=obNextStep();b.textContent=n.label;b.classList.toggle('is-wait',n.wait);
}
function updateProgress(){
  if(!$('orderProgress'))return;
  const q=Number($('qty').value),qtyOk=Number.isFinite(q)&&q>=MIN_QTY;
  const infoOk=!!$('merutag').value.trim()&&normPhone($('custPhone').value).length>=11;
  const isPlasma = currentService && currentService.id === 'Plasma One Auto';
  const proofOk = (window.cbWallet&&window.cbWallet.on) ? true : isPlasma 
    ? (document.getElementById('transcodeInput')?.value.trim().length === codeLenFor($('payMethod').value))
    : !!( $('payProof').files?.[0] || $('payProofCamera').files?.[0] || originalProofFile );

  const raw=[qtyOk,infoOk,proofOk],st=raw.map((v,i)=>raw.slice(0,i+1).every(Boolean)),active=st.indexOf(false); // une étape n'est validée que si les précédentes le sont
  $$('#orderProgress .op-step').forEach((b,i)=>{b.classList.toggle('done',st[i]);b.classList.toggle('active',i===active);});
  $('orderProgress').style.setProperty('--op',st.filter(Boolean).length);
  $$('.quick button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.amount)===q));
  const ot=$('obTotal'),nt=$('total').textContent;if(ot.textContent!==nt){ot.textContent=nt;ot.classList.remove('bump');void ot.offsetWidth;ot.classList.add('bump');}
  const amt=q>0?q*getRateForAmount(q):0;
  $('copyAmountVal').textContent=amt?fmt(amt)+' HTG':'';
  const pab=$('payAmountBig');if(pab){pab.textContent=amt?fmt(amt)+' HTG':'Choisis d\'abord un montant';pab.classList.toggle('is-empty',!amt);}
  updateOrderBar();
  if(qtyOk&&$('err_qty'))setFieldErr('qty','');
  if($('merutag').value.trim()&&$('err_merutag'))setFieldErr('merutag','');
  if(normPhone($('custPhone').value).length>=11&&$('err_custPhone'))setFieldErr('custPhone','');
  if(proofOk&&$('err_proof'))setFieldErr('proof','');
}
function updateWalletStatus(){
  const box=$('walletTools'),st=$('walletStatus'),inp=$('merutag');if(!box||!st||!inp)return;
  const isWallet=!!currentService&&currentService.id==='Plasma One Auto';
  box.hidden=!isWallet;if(!isWallet)return;
  const pb=$('walletPaste');if(pb)pb.hidden=!(window.isSecureContext&&navigator.clipboard&&navigator.clipboard.readText);
  const v=inp.value.trim();st.className='wallet-status';
  if(!v){st.textContent='';return;}
  if(/^0x[a-fA-F0-9]{40}$/.test(v)){st.textContent='✓ Adresse valide';st.classList.add('ok');return;}
  let msg='Adresse invalide.';
  if(!v.startsWith('0x'))msg='L\'adresse doit commencer par 0x.';
  else if(/[^0-9a-fA-F]/.test(v.slice(2)))msg='Caractères non valides (0-9 et a-f seulement).';
  else if(v.length<42)msg='Il manque '+(42-v.length)+' caractère'+(42-v.length>1?'s':'')+'.';
  else if(v.length>42)msg='Trop long : '+(v.length-42)+' caractère'+(v.length-42>1?'s':'')+' en trop.';
  st.textContent=msg;st.classList.add('bad');
}
function updatePayInfo(){
  const method=$('payMethod').value;
  const info=PAY_INFO[method];
  if(!info) return;
  $('payName').textContent=info.name;
  $('payNumber').textContent=info.number;
  $('payAppName').textContent=method;
  const qrApp=$('payQrApp');
  if(qrApp) qrApp.textContent=method;
  const logoImg=$('payRecipientLogo');
  if(logoImg) logoImg.src=info.logo;
  document.querySelectorAll('.pay-method-card').forEach(card=>{
    card.classList.toggle('selected',card.dataset.method===method);
  });
  document.querySelectorAll('.proof-example-img').forEach(e=>{e.hidden=e.dataset.for!==method;});
  renderPayQr(info.number);
  
  // Changement dynamique du texte d'aide pour le Transcode
  const helpText = document.getElementById('transcodeHelp');
  if(helpText) {
    if(method === 'MonCash') {
      const _ti=document.getElementById('transcodeInput'); if(_ti) _ti.maxLength=12;
      helpText.innerHTML = "Ouvre ton SMS MonCash et copie le <b>Txn ID</b> (12 chiffres). Tes USDT seront envoyés instantanément.";
    } else {
      const _ti=document.getElementById('transcodeInput'); if(_ti) _ti.maxLength=14;
      helpText.innerHTML = "Ouvre ton SMS NatCash et copie le <b>TransCode</b> (14 chiffres). Tes USDT seront envoyés instantanément.";
    }
  }
}

function renderPayQr(number){
  const method = $('payMethod').value;
  const info = PAY_INFO[method];
  const img = $('payQrImg');
  const canvas = $('payQrCanvas');
  const box = img ? img.closest('.pay-qr-box') : null;
  if(!img) return;
  if(canvas){
    canvas.style.display = 'none';
    canvas.hidden = true;
  }
  if(info && info.qr){
    if(box) box.style.display = '';
    img.style.display = 'block';
    img.hidden = false;
    img.src = info.qr;
    return;
  }
  img.style.display = 'none';
  img.hidden = true;
  img.removeAttribute('src');
  if(box) box.style.display = 'none';
}

let lastOrderId=null,focusOrderUntil=0;
// Message montré au client : jamais le détail technique d'une suspicion (ça aiderait un fraudeur)
function clientReason(o){
  if(o.status==='rejetée'&&o.client_message)return {review:false,text:String(o.client_message)+' Ton solde a été remboursé.'};
  const r=String(o.auto_validation_reason||'');
  if(/client suspect/i.test(r))return {review:true,text:'Ton compte est en cours de vérification. Contacte le support.'};
  if(/suspect|suspicion|\bIA\b|manipul|retouch|forensi|fraude|jpeg|photoshop|barre d.état|incohérent|incoherent/i.test(r))
    return {review:true,text:'Ton reçu est en cours de vérification. On te répond rapidement.'};
  if(o.status==='rejetée'&&r)return {review:false,text:r.replace(/^Rejeté\s*:\s*/i,'')};
  return {review:false,text:''};
}
// Frise : Paiement reçu → Vérification → USDT envoyés (Plasma automatisé) ou Livré
function orderTimeline(o,review){
  const auto=o.service==='Plasma One Auto';
  const done=o.status==='complétée',rejected=o.status==='rejetée'&&!review;
  const n=done?((auto&&o.payout_status&&o.payout_status!=='sent')?2:3):1;
  const steps=['Paiement reçu','Vérification',auto?'USDT envoyés':'Livré'];
  const prep=done&&auto&&o.payout_status&&o.payout_status!=='sent';
  const note=prep?'<div class="otl-note" style="margin-top:10px;font-size:12px;font-weight:600;color:var(--muted);">⏳ USDT en préparation · ils arrivent dans quelques minutes</div>':'';
  return '<ol class="otl" aria-label="Suivi de la commande">'+steps.map((t,i)=>{
    let c=i<n?'done':(i===n?'active':'');
    if(rejected&&i===1)c='bad';
    if(rejected&&i===2)c='';
    return '<li class="otl-step '+c+'"><i aria-hidden="true"></i><span>'+t+'</span></li>';
  }).join('')+'</ol>'+note;
}
async function redoOrder(o){
  await openService(o.service);
  if(!currentService||currentService.id!==o.service)return;
  // Free Fire : amount_usd est un coût interne, pas une quantité à ressaisir
  if(o.service!=='Free Fire')$('qty').value=o.amount_usd;
  if(o.merutag)$('merutag').value=o.merutag;
  if(o.payment_method&&['MonCash','NatCash'].includes(o.payment_method))$('payMethod').value=o.payment_method;
  updatePayInfo();updateTotal();updateWalletStatus();
  showToast('Commande préremplie · vérifie ton solde puis confirme');
}
// Colonnes strictement nécessaires à l'affichage : on ne charge plus « * »
// (ocr_data, image_forensics, fraud_type, payout_nonce… n'ont rien à faire dans le navigateur du client)
const MY_ORDER_COLS='id,amount_usd,total_htg,merutag,status,created_at,payment_method,payment_proof_path,service,tx_hash,payout_status,pack_id,client_message,auto_validation_reason';
async function loadMyOrders(){
  const el=$('ordersList');
  el.innerHTML='<div class="skeleton-order"></div><div class="skeleton-order"></div>';
  const {data:{user}}=await sb.auth.getUser();if(!user)return;
  const {data,error}=await sb.from('orders').select(MY_ORDER_COLS).eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){el.innerHTML='<div class="order-meta">Impossible de charger les commandes.</div>';return;}
  // Libellés des packs Free Fire (ex. « 100 💎 ») ; si la lecture échoue, on affiche un libellé générique
  const packLabels={};
  {
    const ids=[...new Set((data||[]).map(o=>o.pack_id).filter(Boolean))];
    if(ids.length){
      try{
        const {data:pk}=await sb.from('freefire_packs').select('id,label').in('id',ids);
        (pk||[]).forEach(p=>{packLabels[p.id]=p.label;});
      }catch(_){}
    }
  }
  {
    const pend=(data||[]).filter(o=>o.status!=='complétée' && o.status!=='rejetée').length;
    const nb=document.querySelector('.bottom button[data-page="orders"] .nav-icon');
    if(nb){let b=nb.querySelector('.nav-badge');if(pend){if(!b){b=document.createElement('span');b.className='nav-badge';nb.appendChild(b);}b.textContent=pend;}else if(b)b.remove();}
  }
  {
    const tc=$('totalCard');
    if(tc){
      const done=(data||[]).filter(o=>o.status==='complétée');
      const sum=done.reduce((s,o)=>s+(Number(o.total_htg)||0),0);
      $('totalAchats').textContent='G '+fmt(sum);
    }
  }
  if(!data?.length){el.innerHTML='<div class="empty-state"><div class="empty-ico">🧾</div><h3>Aucune commande pour le moment</h3><p>Ta première recharge apparaîtra ici.</p><button type="button" class="primary-btn" id="emptyGo">Faire une recharge</button></div>';$('emptyGo').onclick=()=>showPage('home');return;}
  el.innerHTML=data.map(o=>{
    const done=o.status==='complétée';
    const rejected=o.status==='rejetée';
    const svc=SERVICES.find(x=>x.id===o.service);
    const canReorder=svc&&serviceReady(svc);
    // Lien TX uniquement pour un vrai hash blockchain (0x + 64 hexa) : les références internes de livraison ne sont jamais montrées
    const hasChainTx = o.tx_hash && /^0x[a-fA-F0-9]{64}$/.test(String(o.tx_hash));
    const txLink = hasChainTx ? `<div class="order-meta">TX : <a href="https://plasmascan.to/tx/${esc(o.tx_hash)}" target="_blank" rel="noopener" class="proof-link" style="margin-top:4px" title="${esc(o.tx_hash)}">${esc(String(o.tx_hash).slice(0,10))}…${esc(String(o.tx_hash).slice(-8))} 🔗</a></div>` : '';
    const cr=clientReason(o);
    const review=rejected&&cr.review;
    const rejMsg = rejected&&cr.text ? (review?`<div class="order-meta">${esc(cr.text)}</div>`:`<div class="order-meta" style="color:var(--danger)">❌ ${esc(cr.text)}</div>`) : '';
    const statusClass = done?'done':((rejected&&!review)?'rejected':'pending');
    const statusText = done?'✓ Complétée':(review?'⏳ En vérification':(rejected?'❌ Rejetée':'⏳ En attente'));
    // Free Fire : on montre le pack acheté, jamais le coût d'achat stocké dans amount_usd
    const isFF = o.service==='Free Fire';
    const topLeft = isFF ? (packLabels[o.pack_id]||'Pack Free Fire') : (esc(o.amount_usd)+' USD');
    return `<div class="order" data-oid="${esc(o.id)}">
      <div class="order-top"><strong>${isFF?esc(topLeft):topLeft}</strong><strong>${fmt(o.total_htg)} HTG</strong></div>
      <div class="order-meta">${esc(svcName(o.service))} · <span class="order-ago">${timeAgo(o.created_at)}</span> · <span class="tag-ellipsis" title="${esc(o.merutag)}">${esc(o.merutag)}</span></div>
      <div class="order-meta">${esc(o.payment_method||'')} · <span class="status ${statusClass}">${statusText}</span></div>
      ${orderTimeline(o,review)}
      ${rejMsg}
      ${txLink}
      ${o.payment_proof_path?`<a class="proof-link" href="#" data-proof="${esc(o.payment_proof_path)}">🧾 Voir ma preuve de paiement</a>`:''}
      ${canReorder && !rejected?`<button type="button" class="reorder-btn" data-reorder="${esc(o.service)}">Commander à nouveau</button>`:''}
      ${canReorder && rejected && !review?`<button type="button" class="reorder-btn" data-redo="${esc(o.id)}">Refaire la commande</button>`:''}
    </div>`;
  }).join('');
  attachProofLinks();
  el.querySelectorAll('[data-reorder]').forEach(btn=>{
    btn.onclick=()=>openService(btn.dataset.reorder);
  });
  window._myOrders=data;
  el.querySelectorAll('[data-redo]').forEach(btn=>{
    btn.onclick=()=>{const o=(window._myOrders||[]).find(x=>String(x.id)===btn.dataset.redo);if(o)redoOrder(o);};
  });
  // Après une commande : la nouvelle commande est mise en avant quelques secondes
  if(Date.now()<focusOrderUntil){
    const t=el.querySelector(lastOrderId?'.order[data-oid="'+CSS.escape(String(lastOrderId))+'"]':'.order');
    if(t){t.classList.add('order-new');setTimeout(()=>t.classList.remove('order-new'),5000);}
  }
}
function attachProofLinks(){document.querySelectorAll('[data-proof]').forEach(link=>{if(link.dataset.bound==='1')return;link.dataset.bound='1';link.onclick=async(e)=>{e.preventDefault();const path=link.dataset.proof,oldText=link.textContent;link.textContent='Ouverture…';link.style.pointerEvents='none';const {data,error}=await sb.storage.from('payment-proofs').createSignedUrl(path,600);if(error||!data?.signedUrl){link.textContent='❌ Impossible d\'ouvrir la preuve';link.style.pointerEvents='';return;}const fromAdmin=link.closest('#adminList')!==null;$('proofBack').textContent=fromAdmin?'← Retour à l\'administration':'← Retour aux commandes';$('proofViewerImg').src=data.signedUrl;$('proofViewer').classList.add('show');document.body.style.overflow='hidden';link.textContent=oldText;link.style.pointerEvents='';};});}

function waNotifyLink(o){const nm=(o.full_name&&!String(o.full_name).includes('@'))?' '+String(o.full_name).split(' ')[0]:'';const txt='Bonjour'+nm+', ta recharge '+svcName(o.service)+' de '+o.amount_usd+' USD est complétée ✅ Merci d\'avoir choisi Cash Boost !';return 'https://wa.me/'+String(o.customer_phone||'').replace(/\D/g,'')+'?text='+encodeURIComponent(txt);}

async function loadWalletBalance() {
  try {
    const { data, error } = await sb.functions.invoke('check-wallet');
    if (error || !data) throw new Error("Erreur de lecture");

    const usdtEl = $('walletUsdt');
    const gasEl = $('walletGas');
    const alertEl = $('walletAlert');

    if (usdtEl) usdtEl.textContent = data.usdt.toFixed(2) + " USDT";
    if (gasEl) gasEl.textContent = data.gas.toFixed(4) + " XPL";

    // Alerte si le solde XPL est trop bas (ex: moins de 0.01 XPL)
    if (alertEl) {
      if (data.gas < 0.01) {
        alertEl.style.display = 'block';
        alertEl.innerHTML = "⚠️ Attention : Tu n'as presque plus de XPL pour payer les frais de réseau (gas). Recharge vite ton wallet !";
      } else {
        alertEl.style.display = 'none';
      }
    }
  } catch (e) {
    console.error("Erreur lecture wallet:", e);
    if ($('walletUsdt')) $('walletUsdt').textContent = "Erreur";
    if ($('walletGas')) $('walletGas').textContent = "Erreur";
  }
}
