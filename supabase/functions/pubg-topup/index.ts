import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fz, FzError, getPubgCategory, getOffers, norm, validatePubgPlayer } from './fz.ts';

const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const INTERNAL_SECRET=Deno.env.get('INTERNAL_SECRET')||'';
const MAX_DRIFT=1.15;
const FAIL_STATUSES=new Set(['failed','failure','canceled','cancelled','rejected','refunded','error','declined','expired']);
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});
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
async function reject(o:any,reason:string){
  await sb.from('orders').update({status:'rejetée',payout_status:'failed',auto_validation_reason:reason.slice(0,300),client_message:'La recharge PUBG a échoué. Le remboursement nécessite une vérification par le support.'}).eq('id',o.id);
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
function offerUcCount(name:string):number|null{
  const s=String(name||'');
  const m=s.match(/(?:^|[^0-9])(60|325|660|1800|3850|8100)\s*(?:uc|unknown cash|unknown cashes)?(?:[^0-9]|$)/i);
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
  const fieldKey=catalog.fields?.find((f:any)=>/player|game|account|uid|id/i.test(String(f.key||'')))?.key||validation.fieldKey||'player_id';
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
async function catalogDiag(){
  const cat=await getPubgCategory();
  if(!cat)return {category:null,warning:'No explicit PUBG Mobile category found'};
  const [offers,validations]=await Promise.all([
    getOffers(String(cat.category_id)),
    fz('GET','/topups/validate-id')
  ]);
  return {
    category:{category_id:cat.category_id,name:cat.name},
    fields:offers.fields||[],
    offers:(offers.offers||[]).map((x:any)=>({offer_id:x.offer_id,name:x.name,price_usd:x.price_usd})),
    validationItems:(validations.items||[]).filter((x:any)=>/pubg/i.test(x.name||'')).map((x:any)=>({category_id:x.category_id,name:x.name,fields:x.fields}))
  };
}
Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return new Response('Method not allowed',{status:405});
    if(!(await authorized(req)))return new Response('forbidden',{status:403});
    const body=await req.json().catch(()=>({}));
    if(body.action==='catalog')return json(await catalogDiag());
    if(body.action==='sweep')return json(await sweep());
    const id=String(body.orderId||body.record?.id||'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'orderId missing'},400);
    return json(await fulfil(id));
  }catch(e){console.error('pubg-topup:',e);return json({error:String((e as any)?.message||e)},500);}
});
