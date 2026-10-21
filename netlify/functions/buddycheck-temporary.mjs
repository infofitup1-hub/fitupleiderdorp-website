// Only server-verified Supabase Auth identities reach service-only booking RPCs.
const env = key => globalThis.Netlify?.env.get(key) || process.env[key] || '';
const enabled = () => ['BUDDYCHECK_BOOKING_ENABLED','BUDDYCHECK_BOOKING_VERIFIED'].every(k => env(k) === 'true');
const closed = {bookingOpen:false,days:[],lessons:[]};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','X-Content-Type-Options':'nosniff'}});
async function api(path, {method='GET',body,token}={}) {
  const base=env('BUDDYCHECK_SUPABASE_URL'), key=env('BUDDYCHECK_SUPABASE_SERVICE_ROLE_KEY');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !key) throw Error('configuration');
  const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6500)});
  if(!r.ok) throw Error('upstream');
  return r.json();
}
const rpc=(name,body)=>api('/rest/v1/rpc/buddycheck_temp_'+name,{method:'POST',body});
export default async function handler(req) {
  if(!['GET','POST'].includes(req.method)) return json({ok:false,message:'Methode niet toegestaan.'},405);
  const url=new URL(req.url);
  if(req.method==='GET' && !req.headers.has('authorization')) {
    if(!enabled()) return json(closed);
    try {return json(await rpc('schedule',{}));} catch {return json(closed);}
  }
  if(req.method==='POST') {
    if(req.headers.get('origin')!==url.origin) return json({ok:false,message:'Ongeldige herkomst.'},403);
    if(!req.headers.get('content-type')?.startsWith('application/json')) return json({ok:false,message:'JSON vereist.'},415);
  }
  let payload={};
  if(req.method==='POST') {
    const raw=await req.text();
    if(raw.length>4096) return json({ok:false,message:'Aanvraag te groot.'},413);
    try {payload=JSON.parse(raw); if(!payload || Array.isArray(payload) || typeof payload!=='object') throw Error();}
    catch {return json({ok:false,message:'Ongeldige aanvraag.'},400);}
  }
  try {
    if(payload.action==='login') {
      if(typeof payload.email!=='string'||payload.email.length>254||typeof payload.password!=='string'||payload.password.length>256) return json({ok:false,message:'Controleer je gegevens.'},400);
      let session;
      try {session=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:payload.email.trim(),password:payload.password}});} catch {return json({ok:false,message:'Inloggen mislukt. Controleer je gegevens of probeer later opnieuw.'},401);}
      const member=await rpc('member',{p_user_id:session.user?.id});
      if(member?.ok!==true) return json({ok:false,message:'Geen gecontroleerd actief lidmaatschap beschikbaar.'},403);
      return json({ok:true,accessToken:session.access_token,expiresIn:session.expires_in});
    }
    const bearer=req.headers.get('authorization');
    if(!/^Bearer [A-Za-z0-9_.-]{20,4096}$/.test(bearer||'')) return json({ok:false,message:'Log opnieuw in.'},401);
    let user;
    try {user=await api('/auth/v1/user',{token:bearer.slice(7)});} catch {return json({ok:false,message:'Log opnieuw in.'},401);}
    if(!user?.id) return json({ok:false,message:'Log opnieuw in.'},401);
    if(req.method==='GET') return json(await rpc('mine',{p_user_id:user.id}));
    if(payload.action==='logout') {await api('/auth/v1/logout',{method:'POST',token:bearer.slice(7)}); return json({ok:true});}
    if(!['book','cancel'].includes(payload.action)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.lessonId||'')) return json({ok:false,message:'Kies een geldige les.'},400);
    if(payload.action==='book'&&!enabled()) return json({ok:false,message:'Inschrijven is gesloten.'},503);
    const result=await rpc(payload.action,{p_user_id:user.id,p_lesson_id:payload.lessonId});
    return json(result,result?.ok===true?200:409);
  } catch {return json({ok:false,message:'De aanvraag kon niet veilig worden verwerkt. Vernieuw je overzicht voordat je opnieuw probeert.'},503);}
}
export const config={path:'/.netlify/functions/buddycheck-temporary',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
