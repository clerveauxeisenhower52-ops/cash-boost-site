// ---------------- Portefeuille ----------------
let walletRows=[],walletFilter='all',walletQuery='',walletShown=20;
let walletOp='MonCash',walletBal=0,walletHidden=false,walletDepBusy=false,walletNeedAmt=0,walletRealtimeChannel=null;
try{ walletHidden=localStorage.getItem('cashboost_wallet_hidden')==='1'; }catch(_){}
const WALLET_TX_LABELS={deposit:'Dépôt',purchase:'Achat',transfer_in:'Transfert reçu',transfer_out:'Transfert envoyé',refund:'Remboursement',adjustment:'Ajustement'};
function walletRenderBalance(){
  const txt=walletHidden?'••••• HTG':fmt(walletBal)+' HTG';
  const el=$('walletBalance'); if(el) el.textContent=txt;
  const h=$('hdrWalletAmt'); if(h) h.textContent=txt;
  const hb=$('homeBal'); if(hb) hb.textContent=txt;
}
function walletRenderOp(){
  document.querySelectorAll('#walletOps .wallet-op').forEach(b=>{const on=b.dataset.op===walletOp;b.classList.toggle('active',on);b.setAttribute('aria-checked',String(on));});
  const info=PAY_INFO[walletOp]||{};
  $('walletAccName').textContent=info.name||'—';
  $('walletAccNum').textContent=info.number?('+509 '+String(info.number).replace(/(\d{4})(\d{4})/,'$1 $2')):'—';
  const qrBox=$('walletQrBox'),qrImg=$('walletQrImg');
  if(qrBox&&qrImg){
    if(info.qr){ qrImg.src=info.qr; $('walletQrApp').textContent=walletOp; qrBox.hidden=false; }
    else{ qrImg.removeAttribute('src'); qrBox.hidden=true; }
  }
  const len=codeLenFor(walletOp),inp=$('walletCode');
  inp.maxLength=len;
  $('walletCodeLabel').textContent=(walletOp==='NatCash'?'TransCode':'Txn ID')+' ('+len+' chiffres)';
  inp.placeholder=walletOp==='NatCash'?'Ex. 26072853633942':'Ex. 260728536339';
  const hint=$('walletStepHint');
  if(hint) hint.innerHTML=walletOp==='NatCash'
    ?'Ouvre ton SMS NatCash et copie le <b>TransCode</b> (14 chiffres). Ton portefeuille sera crédité instantanément.'
    :'Ouvre ton SMS MonCash et copie le <b>Txn ID</b> (12 chiffres). Ton portefeuille sera crédité instantanément.';
  if(inp.value.length>len) inp.value=inp.value.slice(0,len);
  walletCodeRefresh();
}
const WALLET_TX_GROUPS={deposit:['deposit'],purchase:['purchase','refund'],transfer:['transfer_in','transfer_out']};
const walletNorm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function walletTxLabel(r){
  const ref=r.reference?String(r.reference):'';
  return (WALLET_TX_LABELS[r.type]||'Mouvement')+(r.provider&&r.provider!=='Solde'?' '+esc(r.provider):'')+((r.type==='transfer_in'||r.type==='transfer_out')&&ref?' · '+esc(ref):'')+((r.type==='purchase'||r.type==='refund')&&ref?' #'+esc(ref.replace('order:','').slice(0,6).toUpperCase()):'');
}
function walletTxHtml(r){
  const amt=Number(r.amount_htg),pos=amt>=0;
  return '<div class="wallet-tx"><div><b>'+walletTxLabel(r)+'</b><small>'+esc(fmtDateTime(r.created_at))+'</small></div><div class="amt '+(pos?'pos':'neg')+'">'+(pos?'+':'−')+esc(fmt(Math.abs(amt)))+' HTG</div></div>';
}
function walletTxMatches(r){
  if(walletFilter!=='all'&&!(WALLET_TX_GROUPS[walletFilter]||[]).includes(r.type))return false;
  const q=walletNorm(walletQuery).trim();
  if(!q)return true;
  const amt=Math.abs(Number(r.amount_htg));
  const hay=walletNorm([walletTxLabel(r).replace(/&[a-z#0-9]+;/g,' '),r.reference||'',fmtDateTime(r.created_at),amt,fmt(amt)].join(' '));
  return q.split(/\s+/).every(w=>hay.includes(w));
}
function walletRenderTx(){
  const box=$('walletTx'); if(!box)return;
  const all=walletRows||[],rows=all.filter(walletTxMatches);
  const shown=rows.slice(0,walletShown);
  const cnt=$('walletTxCount'),more=$('walletMore');
  if(!all.length){
    box.innerHTML='<div class="wallet-empty"><svg class="wallet-empty-ic" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h13l-3-3M17 17H4l3 3"/></svg><strong>Aucune transaction</strong>Ton premier dépôt ou achat apparaîtra ici.</div>';
    if(cnt)cnt.classList.add('hidden'); if(more)more.classList.add('hidden'); return;
  }
  box.innerHTML=shown.length?shown.map(walletTxHtml).join(''):'<div class="wallet-empty"><strong>Aucun résultat</strong>Essaie un autre filtre ou un autre mot.</div>';
  const filtering=walletFilter!=='all'||walletQuery.trim()!=='';
  if(cnt){cnt.textContent=rows.length+(rows.length>1?' transactions':' transaction');cnt.classList.toggle('hidden',!filtering);}
  if(more)more.classList.toggle('hidden',rows.length<=walletShown);
}
(function walletHistoryInit(){
  const bar=$('walletFilters'),inp=$('walletSearch'),more=$('walletMore');
  if(!bar||!inp||!more)return;
  bar.addEventListener('click',e=>{
    const b=e.target.closest('.wtx-chip'); if(!b)return;
    walletFilter=b.dataset.f; walletShown=20;
    bar.querySelectorAll('.wtx-chip').forEach(x=>x.classList.toggle('active',x===b));
    walletRenderTx();
  });
  let tm;
  inp.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(()=>{walletQuery=inp.value;walletShown=20;walletRenderTx();},150);});
  more.addEventListener('click',()=>{walletShown+=20;walletRenderTx();});
})();
async function loadWallet(){
  walletRenderOp(); walletRenderBalance();
  if(!currentUserId)return;
  walletLoadMeta();
  try{
    const [w,t]=await Promise.all([
      sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle(),
      sb.from('wallet_transactions').select('id,type,amount_htg,provider,reference,created_at').eq('user_id',currentUserId).order('created_at',{ascending:false}).limit(200)
    ]);
    walletBal=Number(w?.data?.balance_htg||0);
    walletRenderBalance();
    walletRows=t?.data||[];
    walletRenderTx();
  }catch(e){ console.error('loadWallet',e); }
}
async function walletCopy(v,msg){
  try{await navigator.clipboard.writeText(v);}
  catch(_){const t=document.createElement('textarea');t.value=v;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(__){}t.remove();}
  showToast(msg||'Numéro copié');
}
function walletCodeRefresh(){
  const need=codeLenFor(walletOp),inp=$('walletCode'); if(!inp)return;
  const n=inp.value.replace(/\D/g,'').length,c=$('walletCodeCount'),b=$('walletVerify');
  if(c){ c.textContent=n+'/'+need; c.classList.toggle('ok',n===need); }
  if(b) b.disabled=walletDepBusy||n!==need;
}
function walletShowSuccess(amount,bal){
  $('walletSuccAmt').textContent='+'+fmt(amount)+' HTG';
  $('walletSuccBal').textContent=fmt(bal)+' HTG';
  $('walletSuccBack').classList.toggle('hidden',!(walletNeedAmt>0));
  const sh=$('walletSheet'); sh.classList.add('done'); sh.scrollTop=0;
  const f=$('walletSuccTx'); if(f)f.focus();
  pushNudgeShow();
}
// Carte des 3 étapes (vérification, crédit, confirmation)
function wspSet(st){
  const box=$('walletSteps'); if(!box)return; box.hidden=false;
  box.querySelectorAll('.wsp-item').forEach((el,i)=>{
    const v=st[i]||'wait'; el.dataset.s=v;
    el.querySelector('.wsp-ic').textContent=(v==='done'?'✓':'');
  });
}
function wspHide(){ const b=$('walletSteps'); if(b) b.hidden=true; }
const wspWait=ms=>new Promise(r=>setTimeout(r,ms));
let walletAutoT=null,walletAutoN=0;
const WALLET_AUTO_MAX=6,WALLET_AUTO_SEC=20;
function walletAutoStop(){
  const was=!!walletAutoT||walletAutoN>0;
  if(walletAutoT){ clearInterval(walletAutoT); walletAutoT=null; }
  walletAutoN=0; wspHide(); return was;
}
function walletAutoStart(){
  if(walletAutoN>=WALLET_AUTO_MAX){
    walletAutoStop();
    setMsg('walletMsg','Code toujours introuvable. Vérifie le code, ou réessaie dans quelques minutes.','err'); return;
  }
  walletAutoN++; let left=WALLET_AUTO_SEC;
  const tick=()=>setMsg('walletMsg','Code introuvable pour l\u2019instant (le SMS peut arriver avec un léger délai). Nouvelle vérification dans '+left+' s… ('+walletAutoN+'/'+WALLET_AUTO_MAX+')','err');
  tick();
  if(walletAutoT) clearInterval(walletAutoT);
  walletAutoT=setInterval(()=>{
    left--;
    if(left<=0){ clearInterval(walletAutoT); walletAutoT=null; walletDeposit(true); }
    else tick();
  },1000);
}
async function walletDeposit(auto){
  if(walletDepBusy)return;
  if(auto===true){
    const d=$('walletDeposit');
    if(!d||d.classList.contains('hidden')){ walletAutoStop(); return; }
  }else walletAutoStop();
  const need=codeLenFor(walletOp),code=$('walletCode').value.replace(/\D/g,'');
  if(code.length!==need){ walletAutoStop(); setMsg('walletMsg','Le code doit contenir exactement '+need+' chiffres.','err'); return; }
  walletDepBusy=true; walletCodeRefresh(); setMsg('walletMsg',''); wspSet(['active','wait','wait']);
  let res=null,err=null;
  try{ const r=await sb.rpc('wallet_deposit',{p_transcode:code,p_provider:walletOp}); res=r.data; err=r.error; }catch(e){ err=e; }
  walletDepBusy=false; walletCodeRefresh();
  if(err||!res){ walletAutoStop(); setMsg('walletMsg','⚠️ Vérification momentanément indisponible. Réessaie dans un instant.','err'); return; }
  if(res.status!=='not_found') walletAutoStop();
  switch(res.status){
    case 'credited':
      $('walletCode').value=''; walletCodeRefresh(); setMsg('walletMsg','');
      wspSet(['done','active','wait']); await wspWait(450);
      wspSet(['done','done','active']); await wspWait(450);
      wspSet(['done','done','done']); await wspWait(500);
      wspHide();
      if(Number.isFinite(Number(res.balance))){ walletBal=Number(res.balance); walletRenderBalance(); }
      showToast('✅ '+fmt(res.amount)+' HTG ajoutés à ton portefeuille');
      beep(); loadWallet();
      walletShowSuccess(res.amount,walletBal); break;
    case 'not_found':
      walletAutoStart(); break;
    case 'already_used':
      setMsg('walletMsg','Ce code a déjà été utilisé.','err'); break;
    case 'too_many_attempts':
      setMsg('walletMsg','Trop d\u2019essais. Réessaie dans 15 minutes.','err'); break;
    case 'invalid_code':
      setMsg('walletMsg','Code invalide pour '+walletOp+'.','err'); break;
    case 'invalid_amount':
      setMsg('walletMsg','Montant du paiement non reconnu. Contacte le support avec ton code.','err'); break;
    default:
      setMsg('walletMsg','Impossible de vérifier ce code.','err');
  }
}
function walletOpenSheet(missing){
  const d=$('walletDeposit'); if(!d)return;
  walletAutoStop();
  walletNeedAmt=(typeof missing==='number'&&missing>0)?Math.ceil(missing):0;
  const nb=$('walletNeed');
  if(nb){ nb.hidden=!walletNeedAmt; if(walletNeedAmt) nb.innerHTML='Il te manque <b>'+fmt(walletNeedAmt)+' HTG</b> pour ta commande. Envoie au moins ce montant.'; }
  $('walletSheet').classList.remove('done');
  $('walletCode').value='';
  walletRenderOp(); setMsg('walletMsg','');
  d.classList.remove('hidden'); document.body.style.overflow='hidden';
  const first=d.querySelector('.wallet-op.active')||$('walletClose'); if(first)first.focus();
}
function walletCloseSheet(){
  const d=$('walletDeposit'); if(!d||d.classList.contains('hidden'))return;
  walletAutoStop();
  d.classList.add('hidden'); document.body.style.overflow='';
  const add=$('walletAddBtn'); if(add)add.focus();
}
(function initWallet(){
  const add=$('walletAddBtn'); if(!add)return;
  add.addEventListener('click',walletOpenSheet);
  $('walletClose').addEventListener('click',walletCloseSheet);
  $('walletDeposit').addEventListener('click',e=>{ if(e.target===e.currentTarget)walletCloseSheet(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!$('walletQrLight').classList.contains('hidden')){ walletQrClose(); return; } walletCloseSheet(); walletTrClose(); } });
  document.querySelectorAll('#walletOps .wallet-op').forEach(b=>b.addEventListener('click',()=>{ walletAutoStop(); walletOp=b.dataset.op; walletRenderOp(); setMsg('walletMsg',''); }));
  $('walletCode').addEventListener('input',e=>{ e.target.value=e.target.value.replace(/\D/g,''); walletCodeRefresh(); if(walletAutoStop())setMsg('walletMsg',''); });
  $('walletCopyNum').addEventListener('click',()=>walletCopy(String((PAY_INFO[walletOp]||{}).number||'')));
  $('walletVerify').addEventListener('click',()=>walletDeposit(false));
  $('walletEye').addEventListener('click',()=>{ walletHidden=!walletHidden; try{localStorage.setItem('cashboost_wallet_hidden',walletHidden?'1':'0');}catch(_){} walletRenderBalance(); });
})();

// ---------------- QR agrandissable, notifications temps réel ----------------
function walletQrOpen(){
  const src=($('walletQrImg')||{}).src; if(!src)return;
  $('walletQrBig').src=src; $('walletQrLight').classList.remove('hidden');
  const c=$('walletQrLightClose'); if(c)c.focus();
}
function walletQrClose(){
  const l=$('walletQrLight'); if(!l||l.classList.contains('hidden'))return;
  l.classList.add('hidden'); const b=$('walletQrBtn'); if(b)b.focus();
}
async function walletNotifyPurchase(tx){
  const amt=Math.abs(Number(tx.amount_htg)||0);
  let name='';
  try{
    const oid=String(tx.reference||'').replace('order:','');
    if(oid){ const {data}=await sb.from('orders').select('service').eq('id',oid).maybeSingle(); if(data&&data.service) name=svcName(data.service); }
  }catch(_){}
  showToast('🛒 −'+fmt(amt)+' HTG : achat'+(name?' '+name:''));
}
function setupWalletRealtime(uid){
  if(walletRealtimeChannel){ sb.removeChannel(walletRealtimeChannel); walletRealtimeChannel=null; }
  walletRealtimeChannel=sb.channel('cashboost-my-wallet-'+uid)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'wallet_transactions',filter:'user_id=eq.'+uid},(p)=>{
      const tx=p.new||{};
      if(tx.id&&!notifyOnce('wtx:'+tx.id))return;
      if(tx.type==='transfer_in'){
        showToast('💸 Tu as reçu '+fmt(Math.abs(Number(tx.amount_htg)||0))+' HTG'+(tx.reference?' de '+tx.reference:''));
        beep(true);
      }else if(tx.type==='refund'){
        showToast('↩️ Remboursement de '+fmt(Math.abs(Number(tx.amount_htg)||0))+' HTG');
        beep(true);
      }else if(tx.type==='deposit'){
        // pendant un dépôt, l'écran de succès prévient déjà le client
        const sh=$('walletDeposit');
        if(!sh||sh.classList.contains('hidden')){ showToast('➕ +'+fmt(Math.abs(Number(tx.amount_htg)||0))+' HTG ajoutés'); beep(); }
      }else if(tx.type==='purchase'){
        walletNotifyPurchase(tx);
      }else if(tx.type==='transfer_out'){
        showToast('📤 −'+fmt(Math.abs(Number(tx.amount_htg)||0))+' HTG : transfert envoyé'+(tx.reference?' à '+tx.reference:''));
      }else if(tx.type==='adjustment'){
        const v=Number(tx.amount_htg)||0;
        showToast((v>=0?'➕ +':'➖ −')+fmt(Math.abs(v))+' HTG : ajustement de ton solde');
      }
      loadWallet();
    }).subscribe();
}
(function initWalletNew(){
  if(!$('walletQrBtn'))return;
  $('walletQrBtn').addEventListener('click',walletQrOpen);
  $('walletQrLightClose').addEventListener('click',walletQrClose);
  $('walletQrLight').addEventListener('click',e=>{ if(e.target===e.currentTarget)walletQrClose(); });
  $('walletSuccClose').addEventListener('click',walletCloseSheet);
  $('walletSuccTx').addEventListener('click',()=>{
    walletCloseSheet();
    setTimeout(()=>{ const t=$('walletTx'); if(t)t.scrollIntoView({behavior:'smooth',block:'start'}); },80);
  });
  $('walletSuccBack').addEventListener('click',()=>{ walletCloseSheet(); showPage('home'); });
  $('walletTrSuccClose').addEventListener('click',walletTrClose);
  $('walletTrSuccTx').addEventListener('click',()=>{
    walletTrClose();
    setTimeout(()=>{ const t=$('walletTx'); if(t)t.scrollIntoView({behavior:'smooth',block:'start'}); },80);
  });
})();

// ---------------- ID client, compteurs, transfert interne ----------------
let walletMyId='',walletTrTarget=null,walletTrBusy=false,walletTrReq=null;
async function walletLoadMeta(){
  try{
    const r=await sb.rpc('wallet_my_id');
    if(r&&r.data){ walletMyId=String(r.data); const el=$('walletMyId'); if(el)el.textContent=walletMyId; }
  }catch(_){}
  const uid=currentUserId; if(!uid)return;
  const cnt=async q=>{ try{ const r=await q; return r.count||0; }catch(_){ return 0; } };
  const head={count:'exact',head:true};
  const [a,b,c,d]=await Promise.all([
    cnt(sb.from('orders').select('id',head).eq('user_id',uid)),
    cnt(sb.from('wallet_transactions').select('id',head).eq('user_id',uid).eq('type','deposit')),
    cnt(sb.from('wallet_transactions').select('id',head).eq('user_id',uid)),
    cnt(sb.from('orders').select('id',head).eq('user_id',uid).eq('status','en attente'))
  ]);
  [['walletStatOrders',a],['walletStatDeposits',b],['walletStatMoves',c],['walletStatPending',d]].forEach(([id,v])=>{ const el=$(id); if(el)el.textContent=String(v); });
}
function walletTrAmount(){ return Number(($('walletTrAmt').value||'').replace(/\D/g,''))||0; }
function walletTrRefreshBtn(){
  const b=$('walletTrSend'),a=walletTrAmount();
  b.disabled=!(walletTrTarget&&a>=1&&!walletTrBusy);
  b.textContent=(walletTrTarget&&a>=1)?('Envoyer '+fmt(a)+' HTG à '+walletTrTarget.name):'Envoyer';
}
async function walletTrLookup(){
  const digits=($('walletTrTo').value||'').replace(/\D/g,'');
  const nm=$('walletTrName'); walletTrTarget=null; nm.className='wallet-tr-name'; nm.textContent='';
  if(digits.length<8){ walletTrRefreshBtn(); return; }
  nm.textContent='Recherche…';
  let res=null; try{ const r=await sb.rpc('wallet_lookup',{p_id:digits}); res=r.data; }catch(_){}
  if(($('walletTrTo').value||'').replace(/\D/g,'')!==digits)return; // réponse périmée
  if(res&&res.status==='found'){ walletTrTarget={id:digits,name:res.name}; nm.textContent='Destinataire : '+res.name; nm.classList.add('ok'); }
  else{
    const M={not_found:'ID introuvable.',self:'Tu ne peux pas t\u2019envoyer de l\u2019argent à toi-même.',too_many_attempts:'Trop d\u2019essais. Réessaie dans 15 minutes.'};
    nm.textContent=M[res&&res.status]||'Vérification impossible. Réessaie.';
  }
  walletTrRefreshBtn();
}
function walletTrOpen(){
  const d=$('walletTransfer'); if(!d)return;
  $('walletTrSheet').classList.remove('done');
  $('walletTrTo').value=''; $('walletTrAmt').value=''; walletTrTarget=null; walletTrBusy=false;
  $('walletTrName').textContent=''; $('walletTrName').className='wallet-tr-name'; setMsg('walletTrMsg','');
  walletTrRefreshBtn();
  d.classList.remove('hidden'); document.body.style.overflow='hidden';
  $('walletTrTo').focus();
}
function walletTrClose(){
  const d=$('walletTransfer'); if(!d||d.classList.contains('hidden'))return;
  d.classList.add('hidden'); document.body.style.overflow='';
  const b=$('walletSendBtn'); if(b)b.focus();
}
function walletTrShowSuccess(a,who,bal){
  $('walletTrSuccAmt').textContent='−'+fmt(a)+' HTG';
  $('walletTrSuccTo').textContent=who||'—';
  $('walletTrSuccBal').textContent=fmt(bal)+' HTG';
  const sh=$('walletTrSheet'); sh.classList.add('done'); sh.scrollTop=0;
  const f=$('walletTrSuccTx'); if(f)f.focus();
}
async function walletTrSend(){
  const a=walletTrAmount(); if(!walletTrTarget||a<1||walletTrBusy)return;
  if(a>walletBal){ setMsg('walletTrMsg','Solde insuffisant ('+fmt(walletBal)+' HTG).','err'); return; }
  walletTrBusy=true; walletTrRefreshBtn(); setMsg('walletTrMsg','Envoi en cours…');
  let res=null,err=null;
  const rk=walletTrTarget.id+':'+a;
  if(!walletTrReq||walletTrReq.k!==rk) walletTrReq={k:rk,id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():null};
  try{
    let r=await sb.rpc('wallet_transfer',{p_to_id:walletTrTarget.id,p_amount:a,p_request_id:walletTrReq.id});
    // Si le correctif SQL n'est pas encore installé, on retombe sur l'ancienne version
    if(r.error&&/p_request_id|PGRST202|schema cache|Could not find/i.test(String(r.error.message||r.error.code||''))) r=await sb.rpc('wallet_transfer',{p_to_id:walletTrTarget.id,p_amount:a});
    res=r.data; err=r.error;
  }catch(e){ err=e; }
  walletTrBusy=false;
  if(err||!res){ setMsg('walletTrMsg','⚠️ Transfert momentanément indisponible. Réessaie dans un instant.','err'); walletTrRefreshBtn(); return; }
  switch(res.status){
    case 'sent':{
      walletTrReq=null;
      const who=walletTrTarget.name;
      setMsg('walletTrMsg','');
      if(Number.isFinite(Number(res.balance))){ walletBal=Number(res.balance); walletRenderBalance(); }
      showToast('✅ '+fmt(a)+' HTG envoyés à '+who);
      beep(); loadWallet();
      walletTrShowSuccess(a,who,walletBal); break;
    }
    case 'insufficient_funds': setMsg('walletTrMsg','Solde insuffisant.','err'); break;
    case 'not_found': setMsg('walletTrMsg','ID introuvable.','err'); break;
    case 'self': setMsg('walletTrMsg','Tu ne peux pas t\u2019envoyer de l\u2019argent à toi-même.','err'); break;
    case 'invalid_amount': setMsg('walletTrMsg','Montant invalide.','err'); break;
    case 'too_many_attempts': setMsg('walletTrMsg','Trop d\u2019essais. Réessaie dans 15 minutes.','err'); break;
    default: setMsg('walletTrMsg','Transfert impossible.','err');
  }
  walletTrRefreshBtn();
}
(function initWalletExtras(){
  const send=$('walletSendBtn'); if(!send)return;
  send.addEventListener('click',walletTrOpen);
  $('walletBuyBtn').addEventListener('click',()=>showPage('home'));
  $('walletCopyId').addEventListener('click',()=>{ if(walletMyId)walletCopy(walletMyId,'ID copié'); });
  $('walletTrClose').addEventListener('click',walletTrClose);
  $('walletTransfer').addEventListener('click',e=>{ if(e.target===e.currentTarget)walletTrClose(); });
  $('walletTrTo').addEventListener('input',walletTrLookup);
  $('walletTrAmt').addEventListener('input',e=>{ e.target.value=e.target.value.replace(/\D/g,''); walletTrRefreshBtn(); });
  $('walletTrSend').addEventListener('click',walletTrSend);
})();

// ---------------- Paiement d'une commande avec le solde ----------------
window.cbWallet={on:true}; // les commandes se paient uniquement avec le portefeuille
function payWalletTotal(){ const q=Number($('qty').value); return q>0?Math.round(q*getRateForAmount(q)*100)/100:0; }
function payWalletRender(){
  const card=$('payWalletCard'); if(!card)return;
  const on=window.cbWallet.on;
  card.classList.toggle('selected',on); card.setAttribute('aria-pressed',String(on));
  const d=$('payWalletDesc'); if(d)d.textContent='Solde : '+(walletHidden?'••••• HTG':fmt(walletBal)+' HTG');
  document.querySelectorAll('#secPay .pay-method-card,#secPay .pay-instructions,#secPay .field.field-mt,#secPay .security-badge').forEach(el=>el.classList.toggle('wallet-mode-hide',on));
  const sub=document.querySelector('#secPay .section-head p');
  if(sub){ if(sub.dataset.orig===undefined)sub.dataset.orig=sub.textContent; sub.textContent=on?'Le montant est débité de ton solde':sub.dataset.orig; }
  const btn=$('submitOrder'),txt=$('submitOrderText');
  if(btn&&txt&&!btn.disabled)txt.textContent=on?'Payer avec mon solde':'Confirmer ma commande';
  const h=$('payWalletHint');
  if(h){
    const t=payWalletTotal(),short=on&&t>0&&t>walletBal;
    h.classList.toggle('hidden',!short);
    if(short)h.innerHTML='Solde insuffisant : il manque '+fmt(t-walletBal)+' HTG.<button type="button" data-act="addfunds">Ajouter des fonds</button>';
  }
  try{ updateProgress(); updateOrderBar(); }catch(_){}
}
async function payWalletRefresh(){
  payWalletRender();
  if(currentUserId){
    try{ const r=await sb.from('wallets').select('balance_htg').eq('user_id',currentUserId).maybeSingle(); walletBal=Number(r?.data?.balance_htg||0); walletRenderBalance(); }catch(_){}
  }
  payWalletRender();
}
// Le débit et la création de la commande se font ensemble côté serveur (fonction wallet_purchase)
// Un identifiant unique par commande : si la réponse se perd et que le client réessaie,
// le serveur reconnaît la même commande et ne débite pas une deuxième fois.
let walletReqKey='',walletReqId='';
function walletNewId(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
}
function walletReqFor(o){
  const key=[o.service,o.qty,o.merutag,o.phone||''].join('|');
  if(!walletReqId||key!==walletReqKey){ walletReqKey=key; walletReqId=walletNewId(); }
  return walletReqId;
}
async function walletBuy(o){
  let r=null,err=null;
  const rid=walletReqFor(o);
  try{ const x=await sb.rpc('wallet_purchase_idem',{p_request_id:rid,p_service:o.service,p_amount_usd:o.qty,p_merutag:o.merutag,p_phone:o.phone||null}); r=x.data; err=x.error; }catch(e){ err=e; }
  if(err||!r)return {data:null,error:{userMessage:'⚠️ Paiement momentanément indisponible. Réessaie dans un instant.'}};
  walletReqId='';   // réponse définitive : la prochaine commande aura un nouvel identifiant
  if(r.status==='paid'){ walletBal=Number(r.balance||0); walletRenderBalance(); return {data:{id:r.order_id},error:null}; }
  const M={
    insufficient_funds:'Solde insuffisant. Ajoute des fonds dans ton portefeuille.',
    amount_too_low:'Montant trop bas pour ce service.',
    service_unavailable:'Ce service est indisponible pour le moment.',
    invalid_input:'Informations de commande invalides.',
    unauthenticated:'Session expirée. Reconnecte-toi.'
  };
  return {data:null,error:{userMessage:M[r.status]||'Paiement impossible.'}};
}
(function initPayWallet(){
  const card=$('payWalletCard'); if(!card)return;
  const q=$('qty'); if(q)q.addEventListener('input',payWalletRender);
  payWalletRender();
  const sp=$('secPay');
  if(sp)sp.addEventListener('click',e=>{ if(e.target.closest('[data-act="addfunds"]')){ const miss=payWalletTotal()-walletBal; showPage('wallet'); setTimeout(()=>walletOpenSheet(miss>0?miss:0),60); } });
})();

