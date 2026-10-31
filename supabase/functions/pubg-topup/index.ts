import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fz, FzError, getPubgCategory, getOffers, norm, validatePubgPlayer } from './fz.ts';

const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const INTERNAL_SECRET=Deno.env.get('INTERNAL_SECRET')||'';
const MAX_DRIFT=1.15;
// Safety: dry-run is ON by default. Only an explicit secret value "false" enables real PUBG purchases.
const PUBG_DRY_RUN=false; // LIVE explicitly enabled by owner
const FAIL_STATUSES=new Set(['failed','failure','canceled','cancelled','rejected','refunded','error','declined','expired']);
const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Max-Age':'86400'
};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...corsHeaders,'Content-Type':'application/json'}});

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function safeEqual(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;}
async function authorized(req:Request){
  const provided=req.headers.get('x-webhook-secret')||'';
  if(!provided)return false;
  const {data,error}=await sb.from('internal_secrets').select('value').eq('name','webhook_secret').maybeSingle();
  return !error&&!!data?.value&&safeEqual(provided,String(data.value));
}
async function alert(msg:string){
  try {
    if(!INTERNAL_SECRET)return;
    await sb.functions.invoke('notify-email',{body:{to:Deno.env.get('ADMIN_EMAIL')||'',service:'ALERTE PUBG MOBILE AUTO',amount:msg},headers:{'x-internal-secret':INTERNAL_SECRET}});
  } catch(e){console.error('admin alert',String((e as any)?.message||e));}
}
async function hold(o:any,reason:string){
  await sb.from('orders').update({payout_status:'pending',payout_locked_at:null,auto_validation_reason:reason.slice(0,300)}).eq('id',o.id);
  await alert('Commande '+String(o.id).slice(0,8)+' suspendue : '+reason);
  return {ok:false,held:true,reason};
}
// Attente silencieuse (ex. recharge du solde FazerCards en cours) : pas d'alerte à chaque passage, une seule après 15 min.
async function wait(o:any,reason:string){
  await sb.from('orders').update({payout_status:'pending',payout_locked_at:null,auto_validation_reason:reason.slice(0,300)}).eq('id',o.id);
  const age=Date.now()-new Date(o.created_at).getTime();
  if(age>15*60*1000&&age<17*60*1000)await alert('Commande '+String(o.id).slice(0,8)+' en attente depuis plus de 15 min : '+reason);
  return {ok:false,waiting:true,reason};
}
async function reject(o:any,reason:string){
  await sb.from('orders').update({status:'rejetée',payout_status:'failed',auto_validation_reason:reason.slice(0,300),client_message:'La recharge PUBG a échoué. Ton solde est remboursé automatiquement.'}).eq('id',o.id);
  await alert('Commande '+String(o.id).slice(0,8)+' rejetée : '+reason);
  return {ok:false,rejected:true,reason};
}
async function complete(o:any,fzId:string){
  await sb.from('orders').update({status:'complétée',payout_status:'sent',auto_validated:true,auto_validation_reason:'UC PUBG livrées (FazerCards '+fzId+')'}).eq('id',o.id);
  return {ok:true,done:true,status:'completed'};
}
async function checkOrder(o:any){
  try{
    const d=await fz('GET','/orders/'+encodeURIComponent(o.tx_hash));
    const st=String(d.order?.status||'').toLowerCase();
    if(st==='completed')return complete(o,o.tx_hash);
    if(FAIL_STATUSES.has(st))return reject(o,'FazerCards : '+st);
    return {ok:true,done:false,status:st||'processing'};
  }catch(e){return {ok:true,done:false,status:'check_error',error:String((e as any)?.message||e)};}
}
// Ne reconnaît que des offres « UC » (jamais « WOW Coins » ni les passes).
function offerUcCount(name:string):number|null{
  const s=String(name||'');
  const m=s.match(/^\s*(60|325|660|1800|3850|8100)\s*(?:uc|unknown cash|unknown cashes)\s*$/i);
  return m?Number(m[1]):null;
}
async function fulfil(orderId:string){
  const {data:o}=await sb.from('orders').update({payout_status:'processing',payout_locked_at:new Date().toISOString()})
    .eq('id',orderId).eq('service','PUBG Mobile (Auto)').eq('status','en attente').eq('payout_status','pending').select('*').maybeSingle();
  if(!o){
    const {data:old}=await sb.from('orders').select('*').eq('id',orderId).maybeSingle();
    if(old&&old.service==='PUBG Mobile (Auto)'&&old.status==='en attente'&&old.payout_status==='processing'&&old.tx_hash)return checkOrder(old);
    return {skipped:true};
  }
  if(!o.pack_id)return hold(o,'Pack PUBG manquant');
  const [{data:pack},{data:cost}]=await Promise.all([
    sb.from('pubg_packs').select('id,label,uc,active').eq('id',o.pack_id).maybeSingle(),
    sb.from('pubg_pack_costs').select('fazer_product,fazer_offer_id,cost_usd').eq('pack_id',o.pack_id).maybeSingle()
  ]);
  if(!pack||!cost||!Number(cost.cost_usd))return hold(o,'Pack ou coût FazerCards non configuré');
  const pid=String(o.merutag||'').replace(/\s/g,'');
  if(!/^[0-9]{5,20}$/.test(pid))return reject(o,'ID joueur PUBG invalide');
  let cat:any;
  try{cat=await getPubgCategory();}catch(e){return hold(o,'Catalogue FazerCards indisponible : '+String((e as any)?.message||e));}
  if(!cat)return hold(o,'Aucune catégorie PUBG Mobile explicite trouvée dans le catalogue FazerCards');
  let validation:any;
  try{validation=await validatePubgPlayer(pid,String(cat.category_id));}catch(e){return hold(o,'Validation PUBG indisponible : '+String((e as any)?.message||e));}
  if(!validation.supported)return hold(o,'FazerCards ne propose pas de validation d’ID PUBG; commande suspendue pour éviter une livraison au mauvais compte');
  if(validation.valid!==true)return reject(o,'FazerCards ne confirme pas cet ID joueur PUBG');
  if(validation.region && !/global|global version|international/i.test(String(validation.region)))return reject(o,'Région PUBG non compatible : '+String(validation.region));
  let catalog:any;
  try{catalog=await getOffers(String(cat.category_id));}catch(e){return hold(o,'Offres PUBG indisponibles : '+String((e as any)?.message||e));}
  const offers:any[]=catalog.offers||[];
  let offer=cost.fazer_offer_id?offers.find(x=>String(x.offer_id)===String(cost.fazer_offer_id)):null;
  if(!offer&&cost.fazer_product)offer=offers.find(x=>norm(x.name)===norm(cost.fazer_product));
  if(!offer){
    const byUc=offers.filter(x=>offerUcCount(String(x.name))===Number(pack.uc));
    if(byUc.length===1)offer=byUc[0];
    else return hold(o,'Offre FazerCards ambiguë ou introuvable pour '+pack.label+'; configuration manuelle requise');
  }
  const price=Number(offer.price_usd);
  if(!Number.isFinite(price)||price<=0)return hold(o,'Prix FazerCards invalide pour '+pack.label);
  if(price>Number(cost.cost_usd)*MAX_DRIFT)return hold(o,'Prix FazerCards '+price+' USD supérieur au seuil autorisé pour '+pack.label);
  // Le solde FazerCards doit couvrir la commande : sinon on attend la recharge automatique au lieu d'échouer et de rembourser le client.
  let fzBalance:number;
  try{fzBalance=Number((await fz('GET','/balance')).balance);}catch(e){return wait(o,'Solde FazerCards illisible : '+String((e as any)?.message||e));}
  if(!Number.isFinite(fzBalance)||fzBalance<price)return wait(o,'Solde FazerCards insuffisant ('+(Number.isFinite(fzBalance)?fzBalance.toFixed(2):'?')+' USD pour '+price+' USD) : recharge automatique en cours');
  const fieldKey=catalog.fields?.find((f:any)=>/player|game|account|uid|id/i.test(String(f.key||'')))?.key||validation.fieldKey||'player_id';
  if(PUBG_DRY_RUN){
    await sb.from('orders').update({
      payout_status:'pending',
      payout_locked_at:null,
      auto_validation_reason:'DRY_RUN : vérifications réussies, aucune commande FazerCards envoyée'
    }).eq('id',o.id);
    return {ok:true,done:false,dry_run:true,status:'not_submitted'};
  }
  try{
    const r=await fz('POST','/topups/order',{category_id:cat.category_id,offer_id:offer.offer_id,fields:{[fieldKey]:pid}},o.id);
    const fzId=String(r.order?.id||'');
    if(!fzId)return hold(o,'Réponse FazerCards sans identifiant de commande');
    await sb.from('orders').update({tx_hash:fzId,auto_validation_reason:'FazerCards '+fzId+' en cours'}).eq('id',o.id);
    const st=String(r.order?.status||'').toLowerCase();
    if(st==='completed')return complete(o,fzId);
    for(let i=0;i<4;i++){await sleep(2500);const res:any=await checkOrder({...o,tx_hash:fzId});if(res.done||res.rejected)return res;}
    return {ok:true,done:false,status:'processing',fazerOrder:fzId};
  }catch(e){
    const err=e as FzError;const msg=String(err?.message||e);const status=Number(err?.status||0);
    if(status===400||status===404)return reject(o,'FazerCards a refusé la commande : '+msg);
    return hold(o,'Erreur FazerCards ('+(status||'réseau')+') : '+msg);
  }
}
async function sweep(){
  const since=new Date(Date.now()-3*24*3600*1000).toISOString();
  const {data:rows}=await sb.from('orders').select('*').eq('service','PUBG Mobile (Auto)').eq('status','en attente').gt('created_at',since).order('created_at',{ascending:true}).limit(6);
  const out:any[]=[];
  for(const o of rows||[]){
    const age=Date.now()-new Date(o.created_at).getTime();
    const locked=o.payout_locked_at?new Date(o.payout_locked_at).getTime():0;
    if(o.payout_status==='pending'&&age>20000)out.push({id:o.id,...await fulfil(o.id)});
    else if(o.payout_status==='processing'&&o.tx_hash)out.push({id:o.id,...await checkOrder(o)});
    else if(o.payout_status==='processing'&&!o.tx_hash&&locked&&Date.now()-locked>3*60*1000){
      await sb.from('orders').update({payout_status:'pending',payout_locked_at:null}).eq('id',o.id);
      out.push({id:o.id,released:true});
    }
  }
  return {ok:true,processed:out.length,out};
}

async function simulate(input:any){
  if(!PUBG_DRY_RUN)return json({ok:false,error:'dry_run_disabled'},409);
  const pid=String(input.playerId||'').replace(/\\s/g,'');
  const packId=String(input.packId||'');
  if(!/^[0-9]{5,20}$/.test(pid))return json({ok:false,error:'invalid_player_id'},400);
  if(!packId)return json({ok:false,error:'pack_id_missing'},400);
  const [{data:pack},{data:cost}]=await Promise.all([
    sb.from('pubg_packs').select('id,label,uc,active').eq('id',packId).maybeSingle(),
    sb.from('pubg_pack_costs').select('fazer_product,fazer_offer_id,cost_usd').eq('pack_id',packId).maybeSingle()
  ]);
  if(!pack||!pack.active||!cost||!Number(cost.cost_usd))return json({ok:false,error:'pack_or_cost_not_configured'},409);
  const cat=await getPubgCategory();
  if(!cat)return json({ok:false,error:'pubg_category_unavailable'},502);
  const validation=await validatePubgPlayer(pid,String(cat.category_id));
  if(!validation.supported||validation.valid!==true)return json({ok:false,error:'player_not_confirmed'},422);
  if(validation.region&&!/global|global version|international/i.test(String(validation.region)))return json({ok:false,error:'unsupported_region'},422);
  const catalog=await getOffers(String(cat.category_id));
  const offers:any[]=catalog.offers||[];
  let offer=cost.fazer_offer_id?offers.find(x=>String(x.offer_id)===String(cost.fazer_offer_id)):null;
  if(!offer&&cost.fazer_product)offer=offers.find(x=>norm(x.name)===norm(cost.fazer_product));
  if(!offer){
    const byUc=offers.filter(x=>offerUcCount(String(x.name))===Number(pack.uc));
    if(byUc.length===1)offer=byUc[0];
  }
  if(!offer)return json({ok:false,error:'offer_not_found'},409);
  const price=Number(offer.price_usd);
  if(!Number.isFinite(price)||price<=0||price>Number(cost.cost_usd)*MAX_DRIFT)return json({ok:false,error:'supplier_price_out_of_range'},409);
  const balance=Number((await fz('GET','/balance')).balance);
  return json({
    ok:true,dry_run:true,
    checks:{player_valid:true,pack_active:true,offer_matched:true,price_within_limit:true},
    player:{name:validation.player_name||null,region:validation.region||null},
    pack:{id:pack.id,label:pack.label,uc:pack.uc},
    supplier:{offer_id:offer.offer_id,name:offer.name,price_usd:price,cost_limit_usd:Number(cost.cost_usd)*MAX_DRIFT},
    supplier_balance:{readable:Number.isFinite(balance),sufficient:Number.isFinite(balance)&&balance>=price},
    order_created:false,wallet_debited:false,provider_order_sent:false
  });
}

async function catalogDiag(){
  const cat=await getPubgCategory();
  if(!cat)return {category:null,warning:'No explicit PUBG Mobile category found'};
  const [offers,validations]=await Promise.all([
    getOffers(String(cat.category_id)),
    fz('GET','/topups/validate-id')
  ]);
  return {
    dry_run:PUBG_DRY_RUN,
    category:{category_id:cat.category_id,name:cat.name},
    fields:offers.fields||[],
    offers:(offers.offers||[]).map((x:any)=>({offer_id:x.offer_id,name:x.name,price_usd:x.price_usd})),
    validationItems:(validations.items||[]).filter((x:any)=>/pubg/i.test(x.name||'')).map((x:any)=>({category_id:x.category_id,name:x.name,fields:x.fields}))
  };
}
// Trace serveur d'une vérification d'ID PUBG (exigée par la fonction SQL pubg_purchase avant tout débit).
async function trace(userId:string,playerId:string,status:string,region:string|null,playerName:string|null){
  try{
    const {error}=await sb.from('pubg_player_checks').insert({user_id:userId,player_id:playerId,status,region,player_name:playerName});
    if(error)console.error('pubg-validate-trace',error.message);
    await sb.from('pubg_player_checks').delete().eq('user_id',userId).lt('created_at',new Date(Date.now()-2*24*3600*1000).toISOString());
  }catch(e){console.error('pubg-validate-trace',String((e as any)?.message||e));}
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers:corsHeaders});
    const body=await req.json().catch(()=>({}));
    if(body.action==='validate'){
      const auth=req.headers.get('Authorization')||'';
      const token=auth.replace(/^Bearer\s+/i,'');
      if(!token)return new Response('unauthorized',{status:401,headers:corsHeaders});
      const {data:userData,error:userError}=await sb.auth.getUser(token);
      if(userError||!userData?.user)return new Response('unauthorized',{status:401,headers:corsHeaders});
      const pid=String(body.playerId||'').replace(/\s/g,'');
      if(!/^[0-9]{5,20}$/.test(pid))return json({ok:false,valid:false,error:'invalid_player_id'},400);
      // Limite par client (10 demandes / 10 min, 60 / jour) : protège la clé FazerCards contre les abus
      const {data:allowed,error:rlError}=await sb.rpc('pubg_validate_allow_request',{p_user_id:userData.user.id});
      if(rlError){console.error('pubg-validate-diag: rate_limit_error');return json({ok:false,valid:false,error:'validation_unavailable'});}
      if(allowed!==true){console.log('pubg-validate-diag: rate_limited');return json({ok:false,valid:false,error:'rate_limited'});}
      const category=await getPubgCategory();
      if(!category){console.log('pubg-validate-diag: no_category');return json({ok:false,valid:false,error:'pubg_validation_unavailable'});}
      const result=await validatePubgPlayer(pid,String(category.category_id));
      if(!result.supported){console.log('pubg-validate-diag: unsupported');return json({ok:false,valid:false,error:'provider_validation_unsupported'});}
      const uid=userData.user.id;
      const rg=result.region?String(result.region).slice(0,40):null;
      if(result.valid!==true){console.log('pubg-validate-diag: not_valid');await trace(uid,pid,'invalid',rg,null);return json({ok:false,valid:false,error:'player_not_verified'});}
      if(!result.player_name){console.log('pubg-validate-diag: valid_but_no_name');await trace(uid,pid,'unavailable',rg,null);return json({ok:false,valid:false,error:'player_name_unavailable'});}
      const pname=String(result.player_name).replace(/[\r\n]+/g,' ').trim().slice(0,40);
      // Même règle de région que fulfil() : seuls les comptes Global / International sont acceptés.
      await trace(uid,pid,(rg&&!/global|global version|international/i.test(rg))?'wrong_region':'valid',rg,pname);
      console.log('pubg-validate-diag: ok');
      return json({ok:true,valid:true,player_name:result.player_name,region:result.region||null});
    }
    if(!(await authorized(req)))return new Response('forbidden',{status:403,headers:corsHeaders});
    if(body.action==='simulate')return await simulate(body);
    if(body.action==='catalog')return json(await catalogDiag());
    if(body.action==='sweep')return json(await sweep());
    const id=String(body.orderId||body.record?.id||'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'orderId missing'},400);
    return json(await fulfil(id));
  }catch(e){console.error('pubg-topup:',e);return json({error:String((e as any)?.message||e)},500);}
});
