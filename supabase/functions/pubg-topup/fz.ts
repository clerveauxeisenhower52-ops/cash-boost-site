// FazerCards client for PUBG Mobile Auto. API key is read only from Supabase Edge Function secrets.
const API = 'https://api.fzr.cards/api/v2';
export class FzError extends Error {
  status: number; body: any;
  constructor(status: number, msg: string, body: any) { super(msg); this.status=status; this.body=body; }
}
export async function fz(method: string, path: string, body?: unknown, idem?: string): Promise<any> {
  const key = Deno.env.get('FAZERCARDS_API_KEY') || '';
  if (!key) throw new FzError(401, 'FAZERCARDS_API_KEY missing', null);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const headers: Record<string,string> = {'X-API-Key':key,'Content-Type':'application/json'};
    if (idem) headers['Idempotency-Key']=idem;
    const res=await fetch(API+path,{method,signal:ctrl.signal,headers,body:body?JSON.stringify(body):undefined});
    let data:any=null; try { data=await res.json(); } catch {}
    if(!res.ok || data?.ok===false) throw new FzError(res.status,String(data?.error||('HTTP '+res.status)),data);
    return data;
  } catch(e) { if(e instanceof FzError) throw e; throw new FzError(0,String((e as any)?.message||e),null); }
  finally { clearTimeout(timer); }
}
export const norm=(s:unknown)=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export async function getPubgCategory(): Promise<any|null> {
  let cursor:string|null=null;
  for(let i=0;i<10;i++){
    const q='?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):'');
    const d=await fz('GET','/topups'+q);
    const items:any[]=d.items||[];
    // Only match a category explicitly naming PUBG Mobile; never fall back to another game.
    const hits=items.filter(c=>/pubg/i.test(c.name||'') && /mobile/i.test(c.name||''));
    const hit=hits.find(c=>/global/i.test(c.name||''))||hits.find(c=>!/kr|korea|japan|vietnam|tw|taiwan/i.test(c.name||''))||hits[0];
    if(hit)return hit;
    if(!d.meta?.has_more||!d.meta?.next_cursor)break;
    cursor=d.meta.next_cursor;
  }
  return null;
}
export async function getOffers(categoryId:string):Promise<any>{
  return fz('GET','/topups/offers?category_id='+encodeURIComponent(categoryId));
}
export async function validatePubgPlayer(pid:string,_purchaseCategoryId?:string):Promise<{supported:boolean;valid:boolean|null;region?:string;player_name?:string;fieldKey?:string}> {
  // FazerCards has a separate validation namespace: e.g. "pubg_mobile".
  // It is NOT the purchasable top-up category (e.g. "pubg_mobile_auto").
  const list=await fz('GET','/topups/validate-id');
  const items:any[]=(list.items||[]);
  const item=items.find((i:any)=>norm(i.name)==='pubgmobile')
    ||items.find((i:any)=>/pubg/i.test(String(i.name||''))&&/mobile/i.test(String(i.name||'')));
  // Diagnostic (sans donnée sensible) : catégories PUBG proposées pour la validation et celle retenue.
  console.log('pubg-validate-diag: items',JSON.stringify(items.filter((i:any)=>/pubg/i.test(String(i.name||''))).map((i:any)=>({category_id:i.category_id,name:i.name,fields:(i.fields||[]).map((f:any)=>f.key)}))),'chosen',item?.category_id??null);
  if(!item?.category_id)return {supported:false,valid:null};
  const fields:any[]=Array.isArray(item.fields)?item.fields:[];
  const field=fields.find((f:any)=>String(f.key||'').toLowerCase()==='player_id')
    ||fields.find((f:any)=>/player|game|account|uid|id/i.test(String(f.key||'')));
  if(!field?.key)return {supported:false,valid:null};
  const r=await fz('POST','/topups/validate-id',{category_id:item.category_id,fields:{[field.key]:pid}});
  const playerName=r.player_name||r.player?.name||r.account?.name||r.nickname||r.name||null;
  // Diagnostic : forme de la réponse (clés, valid, région, présence d'un pseudo) — le pseudo lui-même n'est pas enregistré.
  console.log('pubg-validate-diag: response',JSON.stringify({keys:Object.keys(r||{}),valid:r?.valid,region:r?.region??r?.player?.region??null,hasName:typeof playerName==='string'&&playerName.length>0,fieldKey:field.key}));
  return {supported:true,valid:r.valid===true,region:r.region||r.player?.region,player_name:typeof playerName==='string'?playerName:null,fieldKey:field.key};
}
