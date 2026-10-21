// Synthetic fixtures run only in an ephemeral PostgreSQL WASM database.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import handler from '../netlify/functions/buddycheck-temporary.mjs';
const db=new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);");
const schema=(await readFile(new URL('./schema.sql',import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
await db.exec(schema);
// Verify the migration remains repeatable, including closure and privileges.
await db.exec(schema);
const u='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const lesson='33333333-3333-4333-8333-333333333333';
const token='test-only-authenticated-token';
const rpc=async(name,args={})=>{
 const keys=Object.keys(args);
 const result=await db.query('select public.buddycheck_temp_'+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+') as data',Object.values(args));
 return result.rows[0].data;
};
await db.exec(`insert into auth.users values ('${u}'),('${other}');
 insert into public.buddycheck_temp_members(id,email,auth_user_id,active,verified_until) values
 ('${u}','fixture@example.invalid','${u}',true,now()+interval '1 hour'),
 ('${other}','other@example.invalid','${other}',true,now()+interval '1 hour');
 insert into public.buddycheck_temp_lessons(id,name,kind,date,start_time,end_time,capacity,active,verified_until)
 values('${lesson}','SYNTHETIC TEST ONLY','GROUP',(now() at time zone 'Europe/Amsterdam')::date+1,'12:00','13:00',1,true,now()+interval '1 hour');`);
const open=()=>db.exec("update public.buddycheck_temp_control set booking_enabled=true,verified_until=now()+interval '1 hour',source_reference='synthetic-test',reviewed_by='automated-test'");
const right=(id=u,kind='GROUP')=>db.query("insert into public.buddycheck_temp_entitlements(member_id,product_reference,kind,valid_from,valid_until,verified_until,active) values($1,'synthetic-product',$2,now()-interval '1 day',now()+interval '7 days',now()+interval '1 hour',true)",[id,kind]);
test('database defaults closed even with an active future lesson',async()=>{
 assert.equal((await rpc('schedule')).bookingOpen,false);
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false);
});
test('rights, expiry, idempotency, capacity, ownership and closure',async()=>{
 await open();assert.equal((await rpc('schedule')).bookingOpen,true);
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false);
 await right(u,'FITNESS');assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false);
 await right();
 await db.exec("update public.buddycheck_temp_entitlements set valid_until=now()+interval '1 hour'");
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false,'expires before the lesson');
 await db.exec("update public.buddycheck_temp_entitlements set valid_until=now()+interval '7 days',verified_until=now()-interval '1 second'");
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false,'stale rights');
 await db.exec("update public.buddycheck_temp_entitlements set verified_until=now()+interval '1 hour'");
 await db.exec("update public.buddycheck_temp_members set active=false");
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false);
 await db.exec("update public.buddycheck_temp_members set active=true");
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,true);
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,true,'retry is idempotent');
 await right(other);
 assert.equal((await rpc('book',{p_user_id:other,p_lesson_id:lesson})).ok,false,'full lesson');
 assert.equal((await rpc('mine',{p_user_id:other})).reservations.length,0);
 await rpc('cancel',{p_user_id:other,p_lesson_id:lesson});
 assert.equal((await rpc('mine',{p_user_id:u})).reservations.length,1,'cannot cancel another member');
 await db.exec("update public.buddycheck_temp_control set verified_until=now()-interval '1 second'");
 assert.equal((await rpc('schedule')).bookingOpen,false);
 assert.equal((await rpc('cancel',{p_user_id:u,p_lesson_id:lesson})).ok,true,'cancel allowed after gate expires');
 assert.equal((await rpc('mine',{p_user_id:u})).reservations.length,0);
 await open();
 await db.exec("update public.buddycheck_temp_lessons set date=(now() at time zone 'Europe/Amsterdam')::date-1");
 assert.equal((await rpc('book',{p_user_id:u,p_lesson_id:lesson})).ok,false,'past lesson');
 await db.exec("update public.buddycheck_temp_lessons set date=(now() at time zone 'Europe/Amsterdam')::date+1");
});
test('RLS and function privileges deny direct public access',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from public.buddycheck_temp_members'));
  await assert.rejects(rpc('book',{p_user_id:u,p_lesson_id:lesson}));
  await db.exec('reset role');
 }
});
test('HTTP handler → verified identity → actual SQL → reservation and cancellation',async()=>{
 const original=globalThis.fetch;
 process.env.BUDDYCHECK_SUPABASE_URL='https://synthetic-test.supabase.co';
 process.env.BUDDYCHECK_SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
 process.env.BUDDYCHECK_BOOKING_ENABLED='true';process.env.BUDDYCHECK_BOOKING_VERIFIED='true';
 globalThis.fetch=async(url,options)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/token'){
   const body=JSON.parse(options.body);
   return Response.json(body.password==='synthetic-password'?{user:{id:u},access_token:token,expires_in:3600}:{error:'invalid'},{status:body.password==='synthetic-password'?200:400});
  }
  if(path==='/auth/v1/user')return Response.json(options.headers.Authorization==='Bearer '+token?{id:u}:{error:'bad token'},{status:options.headers.Authorization==='Bearer '+token?200:401});
  if(path.startsWith('/rest/v1/rpc/buddycheck_temp_'))return Response.json(await rpc(path.split('buddycheck_temp_')[1],JSON.parse(options.body)));
  throw Error('unexpected endpoint');
 };
 const request=(body,bearer,origin='https://example.invalid')=>handler(new Request('https://example.invalid/.netlify/functions/buddycheck-temporary',{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined}));
 try{
  assert.equal((await (await request()).json()).bookingOpen,true);
  assert.equal((await request({action:'book',lessonId:lesson})).status,401);
  assert.equal((await request({action:'book',lessonId:lesson},'forged-token-that-is-long')).status,401);
  assert.equal((await request({action:'login',email:'fixture@example.invalid',password:'bad'})).status,401);
  const session=await (await request({action:'login',email:'fixture@example.invalid',password:'synthetic-password'})).json();assert.equal(session.ok,true);
  assert.equal((await request({action:'book',lessonId:lesson},token,'https://attacker.invalid')).status,403);
  // A supplied member id is ignored; only the identity returned by Auth is used.
  assert.equal((await (await request({action:'book',lessonId:lesson,p_user_id:other},token)).json()).ok,true);
  assert.equal((await (await request(null,token)).json()).reservations.length,1);
  process.env.BUDDYCHECK_BOOKING_ENABLED='false';
  assert.equal((await request({action:'book',lessonId:lesson},token)).status,503);
  assert.equal((await (await request({action:'cancel',lessonId:lesson},token)).json()).ok,true);
  assert.equal((await (await request()).json()).bookingOpen,false);
  assert.equal((await request(null,'forged-token-that-is-long')).status,401);
  globalThis.fetch=async()=>{throw Error('outage');};
  process.env.BUDDYCHECK_BOOKING_ENABLED='true';
  assert.equal((await (await request()).json()).bookingOpen,false);
  assert.equal((await request({action:'book',lessonId:lesson},token)).status,401);
 }finally{globalThis.fetch=original;}
});
after(()=>db.close());
