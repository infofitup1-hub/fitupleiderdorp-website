// Tijdelijk inschrijfrooster; fail-closed als database, ledenrechten of expliciete activatie ontbreken.
// Nooit Virtuagym-credentials of Supabase service-role keys naar de browser sturen.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex,nofollow","X-Content-Type-Options":"nosniff"}});
const env=(k)=>Netlify.env.get(k)||"";
const enabled=()=>env("BUDDYCHECK_BOOKING_ENABLED")==="true" && env("BUDDYCHECK_BOOKING_VERIFIED")==="true";
async function db(path,{method="GET",body}={}) {
 const base=env("BUDDYCHECK_SUPABASE_URL"),key=env("BUDDYCHECK_SUPABASE_SERVICE_ROLE_KEY");
 if(!/^https:\/\/[^/]+$/.test(base)||!key)throw new Error("unconfigured");
 const response=await fetch(base+"/rest/v1/"+path,{method,headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6500)});
 if(!response.ok)throw new Error("database_error");
 return response.json();
}
const validEmail=(x)=>typeof x==="string" && x.length<=160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
export default async(req)=>{
 if(req.method==="GET"){
  if(!enabled())return json({bookingOpen:false,days:[],lessons:[]});
  try {
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Amsterdam",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const rows=await db("buddycheck_temp_lessons?select=id,name,date,start_time,end_time,room,capacity,kind&active=eq.true&date=gte."+today+"&order=date.asc,start_time.asc&limit=100");
   const lessons=rows.map(x=>({id:x.id,name:x.name,date:x.date,start:String(x.start_time).slice(0,5),end:String(x.end_time).slice(0,5),room:x.room||""}));
   const days=[...new Set(lessons.map(x=>x.date))];
   return json({bookingOpen:true,days,lessons});
  }catch{return json({bookingOpen:false,days:[],lessons:[]})}
 }
 if(req.method!=="POST")return json({message:"Method not allowed"},405);
 if(!enabled())return json({ok:false,message:"Inschrijven is nog niet geopend."},503);
 let payload;try{payload=await req.json()}catch{return json({ok:false,message:"Ongeldige aanvraag."},400)}
 const email=String(payload.email||"").trim().toLowerCase(),code=payload.code,lessonId=payload.lessonId;
 if(!validEmail(email)||typeof code!=="string"||code.length<8||code.length>128||typeof lessonId!=="string"||!/^[0-9a-f-]{36}$/i.test(lessonId))return json({ok:false,message:"Controleer je gegevens."},400);
 try{
  const {createHash}=await import("node:crypto");
  const codeHash=createHash("sha256").update(code).digest("hex");
  const data=await db("rpc/buddycheck_temp_book",{method:"POST",body:{p_email:email,p_code_hash:codeHash,p_lesson_id:lessonId}});
  const status=data&&data.ok===true;
  return json({ok:status,message:status?"Je reservering is bevestigd.":String(data?.message||"Reservering niet mogelijk.").slice(0,160)},status?200:400);
 }catch{return json({ok:false,message:"Reservering kon niet veilig worden verwerkt. Probeer later opnieuw."},503)}
};
export const config={path:"/.netlify/functions/buddycheck-temporary"};
