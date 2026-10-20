let adminFilter = 'pending', adminQuery = '', adminCache = [];
async function loadAdmin(){
  if(!profile?.is_admin)return;
  loadWalletBalance();
  $('adminArea').classList.remove('hidden');
  fillSettingsForm();
  const el=$('adminList');
  el.innerHTML='<div class="skeleton-order"></div><div class="skeleton-order"></div>';
  const {data,error}=await sb.from('orders').select('*').order('created_at',{ascending:false});
  if(error){el.innerHTML='<div class="order-meta">Erreur de chargement.</div>';return;}
  if(!data?.length){el.innerHTML='<div class="order-meta">Aucune commande.</div>';return;}
  adminCache=data;
  renderAdmin(data);
}

function renderAdmin(data){
  const el=$('adminList');
  const pendingCount = data.filter(o => o.status === 'en attente').length;
  const rejectedCount = data.filter(o => o.status === 'rejetée').length;
  const notified = getAhNotified();
  const afterHoursPending = data.filter(o =>
    o.status === 'en attente' && o.customer_phone && wasAfterHours(o.created_at) && !notified.includes(o.id)
  );
  let ahBanner = '';
  if(afterHoursPending.length){
    ahBanner = `<div class="ah-banner">
      <div class="ah-banner-head">
        <strong>🌙 ${afterHoursPending.length} commande${afterHoursPending.length>1?'s':''} hors horaires</strong>
        <span>À prévenir ce matin</span>
      </div>
      <div class="ah-banner-list">
        ${afterHoursPending.slice(0,8).map(o => `
          <div class="ah-row">
            <div class="ah-row-info">
              <strong>${esc(o.full_name||'Client')}</strong>
              <span>${esc(o.amount_usd)} USD · ${esc(svcName(o.service))} · ${timeAgo(o.created_at)}</span>
            </div>
            <a class="ah-wa-btn" href="${waTakenInChargeLink(o)}" target="_blank" rel="noopener" data-ah-id="${esc(o.id)}">💬 Prise en charge</a>
          </div>`).join('')}
      </div>
    </div>`;
  }
  const todayStr = new Date().toDateString();
  const todayOrders = data.filter(o => new Date(o.created_at).toDateString() === todayStr);
  const todayUsd = todayOrders.reduce((s,o) => s + (Number(o.amount_usd)||0), 0);
  const statsHtml = `<div class="admin-stats">
    <div><strong>${pendingCount}</strong><span>en attente</span></div>
    <div><strong>${todayOrders.length}</strong><span>aujourd'hui</span></div>
    <div><strong>${fmt(todayUsd)} $</strong><span>volume du jour</span></div>
  </div>`;
  const filtersHtml = statsHtml + `<div class="admin-filters">
    <button type="button" class="admin-filter-btn ${adminFilter==='pending'?'active':''}" data-af="pending">En attente${pendingCount?`<span class="admin-pending-badge">${pendingCount}</span>`:''}</button>
    <button type="button" class="admin-filter-btn ${adminFilter==='all'?'active':''}" data-af="all">Toutes (${data.length})</button>
    <button type="button" class="admin-filter-btn ${adminFilter==='done'?'active':''}" data-af="done">Complétées</button>
    <button type="button" class="admin-filter-btn ${adminFilter==='rejected'?'active':''}" data-af="rejected">Rejetées (${rejectedCount})</button>
  </div>` + ahBanner;

  const q = adminQuery.trim().toLowerCase();
  const filtered = data.filter(o => {
    if(q && ![o.full_name,o.merutag,o.customer_phone,o.customer_email,svcName(o.service)].join(' ').toLowerCase().includes(q)) return false;
    if(adminFilter==='pending') return o.status === 'en attente';
    if(adminFilter==='done') return o.status === 'complétée';
    if(adminFilter==='rejected') return o.status === 'rejetée';
    return true;
  });

  if(!filtered.length){
    el.innerHTML = filtersHtml + '<div class="order-meta" style="padding:16px 0;text-align:center">Aucune commande dans ce filtre.</div>';
  } else {
    el.innerHTML = filtersHtml + filtered.map(o=>{
      const done = o.status === 'complétée';
      const rejected = o.status === 'rejetée';
      const txHash = o.tx_hash ? `<div class="order-meta">TX : <a href="https://plasmascan.to/tx/${esc(o.tx_hash)}" target="_blank" rel="noopener" class="proof-link">${esc(String(o.tx_hash).slice(0,10))}…</a> ${o.payout_status?`· ${esc(o.payout_status)}`:''}</div>` : '';
      const rejMsg = rejected && o.auto_validation_reason ? `<div class="order-meta" style="color:var(--danger)">Motif : ${esc(o.auto_validation_reason)}</div>` : '';
      return `<div class="order">
        <div class="order-top"><strong>${esc(o.full_name||'Client')}</strong><strong>${esc(o.amount_usd)} USD</strong></div>
        <div class="order-meta">${esc(svcName(o.service))} · <button type="button" class="copy-tag" data-copy="${esc(o.merutag)}" aria-label="Copier ${esc(o.merutag)}">${esc(o.merutag)} 📋</button> · <span class="order-ago">${timeAgo(o.created_at)}</span>${(!done && !rejected && wasAfterHours(o.created_at))?' <span class="ah-tag">hors horaires</span>':''}${rejected?' <span class="ah-tag" style="background:var(--danger-soft);color:var(--danger)">rejetée</span>':''}</div>
        <div class="order-meta">${esc(o.payment_method||'')}${o.customer_phone?' · +'+esc(o.customer_phone):''}</div>
        ${rejMsg}
        ${txHash}
        ${o.payment_proof_path?`<a class="proof-link" href="#" data-proof="${esc(o.payment_proof_path)}">🧾 Voir la preuve</a>`:'<div class="order-meta">Aucune preuve jointe.</div>'}
        <select class="admin-status" data-id="${esc(o.id)}" style="margin-top:8px;height:42px">
          <option value="en attente" ${o.status==='en attente'?'selected':''}>en attente</option>
          <option value="complétée" ${done?'selected':''}>complétée</option>
          <option value="rejetée" ${rejected?'selected':''}>rejetée</option>
        </select>
        ${(!done && !rejected && o.customer_phone && wasAfterHours(o.created_at))?`<a class="wa-notify ah-take" href="${waTakenInChargeLink(o)}" target="_blank" rel="noopener" data-ah-id="${esc(o.id)}">💬 Prise en charge (matin)</a>`:''}
        ${(done && o.customer_phone)?`<a class="wa-notify" href="${waNotifyLink(o)}" target="_blank" rel="noopener">💬 WhatsApp client</a>`:''}
        ${(!done && !rejected && o.customer_phone && !wasAfterHours(o.created_at))?`<a class="wa-notify" href="${waNotifyLink(o)}" target="_blank" rel="noopener">💬 WhatsApp client</a>`:''}
      </div>`;
    }).join('');
  }

  attachProofLinks();
  el.querySelectorAll('[data-af]').forEach(btn=>{
    btn.onclick = () => { adminFilter = btn.dataset.af; loadAdmin(); };
  });
  el.querySelectorAll('[data-ah-id]').forEach(a=>{
    a.addEventListener('click', () => {
      markAhNotified(a.dataset.ahId);
      setTimeout(() => { a.closest('.ah-row')?.classList.add('ah-done'); }, 400);
    });
  });
  document.querySelectorAll('.admin-status').forEach(sel=>{
    sel.onchange = async () => {
      const ns = sel.value, oid = sel.dataset.id;
      sel.disabled = true;
      const {data:order, error:fe} = await sb.from('orders').select('id,customer_email,service,amount_usd,customer_phone,full_name').eq('id',oid).single();
      if(fe||!order){ showToast('Impossible de récupérer la commande.'); loadAdmin(); return; }
      const {error:ue} = await sb.from('orders').update({status:ns}).eq('id',oid);
      if(ue){ showToast('Erreur de mise à jour.'); loadAdmin(); return; }
      if(ns==='complétée'){
        let notifyClient = true; // pas d'email « complétée » si les USDT ne sont pas partis
        if(order.service === 'Plasma One Auto'){
          notifyClient = false;
          showToast('🔍 Vérification du reçu en cours…');
          try {
            const { data: verif, error: verifErr } = await sb.functions.invoke('verify-receipt', {
              body: { orderId: order.id }
            });
            if(verifErr){
              showToast('⚠️ Vérification impossible · vérifie manuellement');
            } else if(verif?.auto_validated && verif?.envoi?.startsWith('envoye')){
              notifyClient = true;
              showToast('✅ Reçu vérifié · 💸 USDT envoyés');
            } else if(verif?.auto_validated && verif?.envoi?.startsWith('broadcast')){
              notifyClient = true;
              showToast('✅ Reçu vérifié · 💸 USDT en route');
            } else if(verif?.already_processed){
              showToast('⚠️ Déjà traitée · USDT non confirmés, vérifie le statut d\'envoi');
            } else if(verif?.auto_validated){
              showToast('✅ Reçu vérifié');
            } else if(verif?.user_message){
              showToast('⚠️ ' + verif.user_message);
            } else {
              showToast('⚠️ Non validé · vérifie manuellement');
            }
          } catch (e) {
            console.error('verify-receipt invoke error:', e);
            showToast('⚠️ Vérification indisponible · vérifie manuellement');
          }
        } else {
          showToast('✅ Commande marquée complétée');
        }
        if(notifyClient && order.customer_email){
          try { await sb.functions.invoke('notify-email',{body:{to:order.customer_email,service:svcName(order.service),amount:order.amount_usd}}); } catch(_){}
        }
      } else if(ns==='rejetée'){
        showToast('❌ Commande rejetée');
      } else {
        showToast('Statut mis à jour');
      }
      loadAdmin();
    };
  });
}

const SERVICE_LOGOS = {};

async function loadDeliveryStats(){
  try{
    const {data,error}=await sb.rpc('delivery_stats');
    if(error||!data)return;
    const n=Number(data.n)||0,m=Number(data.median_min),el=$('trustSpeed');
    if(el&&n>=5&&Number.isFinite(m)&&m>=0&&m<=30){el.textContent='Livré en '+Math.max(1,Math.round(m))+' min en général';el.title='Médiane des 7 derniers jours';}
  }catch(_){}
}
async function loadSettings(){
  try{const {data}=await sb.from('settings').select('key,value');if(data){const m=Object.fromEntries(data.map(r=>[r.key,r.value]));WHATSAPP=String(m.whatsapp||'').replace(/\D/g,'');}}catch(_){}
  try{const {data,error}=await sb.from('services').select('*').order('sort',{ascending:true});if(!error&&data)SERVICES=data;}catch(_){}
  if(SERVICES.length) saveSettingsCache(); else loadSettingsCache();   // hors ligne : on reprend la dernière version connue
  applySettings();
  loadDeliveryStats();
}

function renderServices(){
  const el=$('servicesList');
  if(!SERVICES.length){
    el.innerHTML=Array(4).fill(`<div class="skeleton-card"><div class="skeleton-visual"></div><div class="skeleton-info"><div class="skeleton-line"></div><div class="skeleton-btn"></div></div></div>`).join('');
    return;
  }
  // Services disponibles d'abord, "Bientôt" ensuite (l'ordre de la base est conservé dans chaque groupe)
  const list=SERVICES.filter(s=>s.visible!==false).slice().sort((a,b)=>Number(serviceReady(b))-Number(serviceReady(a)));
  const nbReady=list.filter(serviceReady).length,nbSoon=list.length-nbReady;
  if(!list.length){el.innerHTML='<div class="card" style="padding:18px;text-align:center;color:var(--muted);grid-column:1/-1">Aucun service disponible.</div>';return;}
  el.innerHTML=list.map((s,i)=>{
    const ready=serviceReady(s),logo=s.logo||SERVICE_LOGOS[s.id];
    const visual=logo?`<div class="service-visual meru-logo-visual"><img class="meru-brand-logo${s.id==='meru'?'':' svc-logo-sq'}" src="${logo}" alt="Logo ${esc(s.name)}"></div>`:`<div class="service-visual"><span class="svc-initials">${esc(initials(s.name))}</span></div>`;
    // "Plasma One — Traitement Automatisé" -> titre court + badge Auto / Manuel
    const parts=String(s.name).split(/\s+[—–-]\s+/),variant=parts.slice(1).join(' ');
    const badgeKind=/autom/i.test(variant)?'auto':(/manuel/i.test(variant)?'manuel':'');
    const badgeTxt=badgeKind==='auto'?'Auto':(badgeKind==='manuel'?'Manuel':'');
    const title=esc(badgeKind?parts[0]:s.name)+(badgeKind?`<span class="svc-badge svc-badge-${badgeKind}">${badgeTxt}</span>`:'');
    // Dernière carte seule sur sa ligne -> pleine largeur
    const idxInGroup=ready?i:i-nbReady,groupSize=ready?nbReady:nbSoon;
    const wide=(groupSize%2===1&&idxInGroup===groupSize-1)?' wide':'';
    // Pas de « Dès X USD » ni de « ⚡ Rapide » sous le nom du service
    const meta='';
    return `<div class="service-card${ready?'':' soon'}${wide}">${visual}<div class="service-info"><div class="service-title"><h2>${title}</h2>${meta}</div><button class="primary-btn" data-open="${esc(s.id)}" ${ready?'':'disabled'}>${ready?'Commander':'Bientôt'}</button></div></div>`;
  }).join('');
  el.querySelectorAll('[data-open]').forEach(b=>{b.onclick=()=>openService(b.dataset.open);});
}

let DEFAULT_QUICK=null;
function presetAmounts(s){
  if(Array.isArray(s.amounts)&&s.amounts.length)return s.amounts.map(Number).filter(n=>n>0);
  if(/netflix/i.test(String(s.id)+' '+String(s.name)))return [15,20,25,30,40,50,60,100];
  return null;
}
function applyCurrentService(){
  const s=currentService;if(!s)return;
  RATE=Number(s.rate);EFFECTIVE_RATE=Number(s.effective_rate);MIN_QTY=Number(s.min_qty)||1;
  {const np=svcNameParts(s.name);$('svcTitle').innerHTML='Recharger '+esc(np.base)+(np.kind?`<span class="svc-badge svc-badge-${np.kind}">${np.label}</span>`:'');}
  $('minText').textContent='Minimum : '+MIN_QTY+' USD';
  const quickEl=document.querySelector('.quick'),boxEl=document.querySelector('.amount-box'),pre=presetAmounts(s);
  if(DEFAULT_QUICK===null)DEFAULT_QUICK=quickEl.innerHTML;
  if(pre){
    quickEl.innerHTML=pre.map(a=>`<button type="button" data-amount="${a}">$${a}</button>`).join('');
    quickEl.classList.add('preset');boxEl.classList.add('hidden');
    $('svcTitle').textContent=s.name;
    $('minText').textContent='Choisis la valeur de ta carte';
  }else{
    quickEl.innerHTML=DEFAULT_QUICK;quickEl.classList.remove('preset');boxEl.classList.remove('hidden');
  }
  $('svcHowTo').classList.toggle('hidden',!(pre&&/netflix/i.test(String(s.id)+' '+String(s.name))));
  document.querySelector('label[for="qty"]').textContent=pre?'Valeur de la carte (USD)':'Montant à recharger (USD)';
  document.querySelectorAll('.quick button').forEach(b=>b.classList.toggle('hidden',Number(b.dataset.amount)<MIN_QTY));
  $('sumLabel').textContent='Montant '+svcNameParts(s.name).base;
  $('svcInfoTitle').textContent='Informations '+svcNameParts(s.name).base;
  $('svcFieldLabel').textContent=s.field_label||'Identifiant du compte';
  $('merutag').placeholder = s.field_placeholder || (s.id === 'Plasma One Auto' ? '0x1234...abcd' : '');
  if($('netWarn')) $('netWarn').style.display = (s.id === 'Plasma One Auto') ? '' : 'none';
  $('rateDisplay').textContent='1 USD = '+fmt(RATE)+' HTG';
  $('rateRow').textContent=fmt(RATE)+' HTG / USD';
  renderStatusLine();
  updateTotal();
  updateWalletStatus();
}

async function openService(id){
  const s=SERVICES.find(x=>x.id===id);if(!s||!serviceReady(s))return;
  currentService=s;
  
  // --- NOUVEAU : Gestion Transcode vs Image ---
  const isPlasma = s.id === 'Plasma One Auto';
  document.getElementById('transcodeSection').classList.toggle('hidden', !isPlasma);
  
  const proofZone = document.getElementById('proofUploadZone');
  const proofPreview = document.getElementById('proofPreview');
  const proofTip = document.querySelector('.proof-tip');
  
  if(isPlasma) {
    if(proofZone) proofZone.style.display = 'none';
    if(proofPreview) proofPreview.style.display = 'none';
    if(proofTip) proofTip.style.display = 'none';
    $('transcodeInput').value = '';
    if(typeof acReset==='function'){ try{ acReset(); }catch(_){} }
  } else {
    if(proofZone) proofZone.style.display = '';
    if(proofPreview) proofPreview.style.display = '';
    if(proofTip) proofTip.style.display = '';
  }
  // -------------------------------------------

  $('qty').value='';$('merutag').value='';$('payMethod').value='MonCash';
  $('payProof').value='';$('payProofCamera').value='';
  $('proofPreview').classList.remove('show');$('proofPreviewImg').removeAttribute('src');
  $('proofUploadZone').classList.remove('filled');
  $('orderSuccess').classList.remove('show');setMsg('orderMsg','');
  originalProofFile = null;
  restorePhone();
  applyCurrentService();
  await restoreMeruForm();
  updateWalletStatus();
  updatePayInfo();
  updateOpeningHoursNotice();
  localStorage.setItem('cashboost_last_service',id);
  showPage('service');
}

function applySettings(){
  renderServices();
  if(currentService){const f=SERVICES.find(x=>x.id===currentService.id);if(f&&serviceReady(f)){currentService=f;applyCurrentService();}}
  document.querySelectorAll('a.wa-btn').forEach(a=>{if(WHATSAPP){a.href='https://wa.me/'+WHATSAPP+'?text='+encodeURIComponent('Bonjour Cash Boost, j\'ai besoin d\'aide.');a.classList.remove('hidden');}else{a.classList.add('hidden');}});
  const fw=$('footerWhatsapp');if(fw&&WHATSAPP)fw.href='https://wa.me/'+WHATSAPP;
  const ts=$('trustSupport');if(ts){if(WHATSAPP)ts.href='https://wa.me/'+WHATSAPP;else ts.classList.add('hidden');}
}
function stateOf(s){return s.visible===false?'hidden':(s.active?'active':'soon');}

function svcFieldsHtml(s){
  const st=stateOf(s),logo=s.logo||SERVICE_LOGOS[s.id]||'';
  let tiers = s.rate_tiers || [];
  if(typeof tiers === 'string'){ try{ tiers = JSON.parse(tiers); }catch(_){ tiers = []; } }
  if(!Array.isArray(tiers)) tiers = [];
  const tiersRows = tiers.map((t,i)=>`
    <tr>
      <td><input type="number" data-tier-min min="0" step="1" value="${t.min??''}" placeholder="Min USD"></td>
      <td><input type="number" data-tier-rate min="0" step="0.01" value="${t.rate??''}" placeholder="Taux"></td>
      <td><button type="button" class="tier-del" data-tier-del title="Supprimer">×</button></td>
    </tr>`).join('');
  return `${logo?`<img src="${logo}" alt="" style="width:56px;height:56px;border-radius:14px;object-fit:cover;margin-bottom:10px">`:''}
    <div class="field"><label>Nom du service</label><input type="text" data-f="name" value="${esc(s.name||'')}"></div>
    <div class="field"><label>Description</label><input type="text" data-f="description" value="${esc(s.description||'')}"></div>
    <div class="field"><label>Libellé du champ client</label><input type="text" data-f="field_label" value="${esc(s.field_label||'')}"></div>
    <div class="field"><label>Placeholder</label><input type="text" data-f="field_placeholder" value="${esc(s.field_placeholder||'')}"></div>
    <div class="field"><label>Délai de livraison</label><input type="text" data-f="delivery" value="${esc(s.delivery||'')}"></div>
    <div class="field"><label>Taux affiché au client (HTG/USD)</label><input type="number" step="0.01" data-f="rate" value="${s.rate??''}"></div>
    <div class="field"><label>Taux appliqué (frais inclus)</label><input type="number" step="0.01" data-f="effective_rate" value="${s.effective_rate??''}"></div>
    <div class="field">
      <label>Tarifs par paliers</label>
      <div class="tiers-box">
        <table class="tiers-table">
          <thead><tr><th>À partir de (USD)</th><th>Taux HTG</th><th></th></tr></thead>
          <tbody data-tiers-body>${tiersRows}</tbody>
        </table>
        <button type="button" class="tiers-add" data-tiers-add>+ Ajouter un palier</button>
      </div>
      <p class="field-help">Ex. : à partir de 50 USD → 155 HTG, à partir de 100 USD → 154 HTG. Laisser vide = taux unique.</p>
    </div>
    <div class="field"><label>Minimum (USD)</label><input type="number" step="1" data-f="min_qty" value="${s.min_qty??5}"></div>
    <div class="field"><label>État</label><select data-f="state">
      <option value="active" ${st==='active'?'selected':''}>Actif</option>
      <option value="soon" ${st==='soon'?'selected':''}>Bientôt</option>
      <option value="hidden" ${st==='hidden'?'selected':''}>Masqué</option>
    </select></div>
    <div class="field"><label>Logo (image)</label><input type="file" accept="image/*" data-f="logo"></div>`;
}
function bindTiersUI(root){
  (root||document).querySelectorAll('[data-tiers-add]').forEach(btn=>{
    if(btn.dataset.bound==='1')return;
    btn.dataset.bound='1';
    btn.onclick=()=>{
      const body = btn.closest('.tiers-box')?.querySelector('[data-tiers-body]');
      if(!body)return;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input type="number" data-tier-min min="0" step="1" placeholder="Min USD"></td>
        <td><input type="number" data-tier-rate min="0" step="0.01" placeholder="Taux"></td>
        <td><button type="button" class="tier-del" data-tier-del title="Supprimer">×</button></td>`;
      body.appendChild(tr);
      bindTiersUI(tr);
    };
  });
  (root||document).querySelectorAll('[data-tier-del]').forEach(btn=>{
    if(btn.dataset.bound==='1')return;
    btn.dataset.bound='1';
    btn.onclick=()=>btn.closest('tr')?.remove();
  });
}
function fillSettingsForm(){
  $('setWhatsapp').value=WHATSAPP;
  $('servicesAdmin').innerHTML=SERVICES.map(s=>`<div class="svc-edit" data-id="${esc(s.id)}"><h4>${esc(s.name)}</h4>${svcFieldsHtml(s)}</div>`).join('');
  bindTiersUI($('servicesAdmin'));
}
function readSvcBox(box){
  const g=f=>{const e=box.querySelector('[data-f="'+f+'"]');return e?e.value:'';};
  const st=g('state');
  const file=box.querySelector('[data-f="logo"]')?.files?.[0]||null;
  const rate_tiers = [];
  box.querySelectorAll('[data-tiers-body] tr').forEach(tr=>{
    const min = parseFloat(tr.querySelector('[data-tier-min]')?.value);
    const rate = parseFloat(tr.querySelector('[data-tier-rate]')?.value);
    if(Number.isFinite(min) && Number.isFinite(rate) && rate > 0){
      rate_tiers.push({ min, rate });
    }
  });
  rate_tiers.sort((a,b)=>a.min-b.min);
  return {
    name:g('name').trim(),
    description:g('description').trim(),
    field_label:g('field_label').trim(),
    field_placeholder:g('field_placeholder').trim(),
    delivery:g('delivery').trim(),
    rate:parseFloat(g('rate')),
    effective_rate:parseFloat(g('effective_rate')),
    min_qty:parseFloat(g('min_qty')),
    active:st==='active',
    visible:st!=='hidden',
    file,
    rate_tiers
  };
}
function checkSvc(r){if(!r.name)return 'Entre le nom du service.';if(!r.field_label)return 'Indique ce que le client doit donner.';if(r.active&&(!(r.rate>0)||!(r.effective_rate>0)||!(r.min_qty>0)))return 'Taux et minimum requis pour activer.';return '';}
function fileToLogo(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/')||file.size>8*1024*1024)return reject(new Error('image'));const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const n=256,c=document.createElement('canvas');c.width=n;c.height=n;const side=Math.min(img.width,img.height);c.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,n,n);URL.revokeObjectURL(url);resolve(c.toDataURL('image/png'));};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('load'));};img.src=url;});}
function slugify(t){return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'service';}

