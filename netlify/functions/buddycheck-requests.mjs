// Standalone BuddyCheck requests: visitor submits; Fit Up approves.
// Always OFF until SQL migration, current lessons and environment flags are configured.
import {createHash,timingSafeEqual} from 'node:crypto';
const env=k=>globalThis.Netlify?.env.get(k)||process.env[k]||'';
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'}});
const on=()=>env('BUDDYCHECK_REQUESTS_ENABLED')==='true';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const eq=(a,b)=>{const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y)};
async function rpc(name,data){
 const url=env('BUDDYCHECK_SUPABASE_URL'),key=env('BUDDYCHECK_SUPABASE_SERVICE_ROLE_KEY');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key)throw Error('config');
 const r=await fetch(url+'/rest/v1/rpc/buddycheck_request_'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(7000)});
 if(!r.ok)throw Error('database');return r.json();
}
function admin(req){const expected=env('BUDDYCHECK_ADMIN_TOKEN');const given=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';return !!expected&&expected.length>=32&&given.length===expected.length&&eq(given,expected)}
export default async req=>{
 if(!['GET','POST'].includes(req.method))return respond({message:'Methode niet toegestaan.'},405);
 if(!on())return respond({open:false,lessons:[],message:'Aanvragen zijn nog gesloten.'},503);
 const u=new URL(req.url);
 if(req.method==='POST'&&req.headers.get('origin')!==u.origin)return respond({message:'Ongeldige herkomst.'},403);
 try{
  if(req.method==='GET'){
   if(u.searchParams.get('mode')==='admin')return admin(req)?respond(await rpc('admin_list',{})):respond({message:'Geen toegang.'},401);
   return respond(await rpc('schedule',{}));
  }
  if(!req.headers.get('content-type')?.startsWith('application/json'))return respond({message:'JSON vereist.'},415);
  const raw=await req.text();if(raw.length>2048)return respond({message:'Aanvraag te groot.'},413);
  const p=JSON.parse(raw);if(!p||typeof p!=='object')return respond({message:'Ongeldig verzoek.'},400);
  if(p.action==='decide'){
   if(!admin(req))return respond({message:'Geen toegang.'},401);
   if(!uuid(p.requestId)||!['approved','rejected'].includes(p.decision))return respond({message:'Ongeldige keuze.'},400);
   const v=await rpc('decide',{p_request_id:p.requestId,p_decision:p.decision});
   return respond(v,v.ok?200:409);
  }
  if(p.action!=='submit'||!uuid(p.lessonId)||typeof p.name!=='string'||p.name.trim().length<2||p.name.length>100||
   typeof p.email!=='string'||p.email.length>160||!/^\S+@\S+\.\S+$/.test(p.email)||typeof p.website!=='string'||p.website.length>200)
   return respond({ok:false,message:'Controleer naam en e-mailadres.'},400);
  if(p.website)return respond({ok:true,message:'Aanvraag ontvangen.'});
  const v=await rpc('submit',{p_lesson_id:p.lessonId,p_name:p.name.trim(),p_email:p.email.trim().toLowerCase()});
  return respond(v,v.ok?200:409);
 }catch{return respond({ok:false,message:'Aanvraag niet verwerkt. Neem contact op met Fit Up.'},503)}
};
export const config={path:'/.netlify/functions/buddycheck-requests',rateLimit:{windowLimit:10,windowSize:60,aggregateBy:['ip','domain']}};
