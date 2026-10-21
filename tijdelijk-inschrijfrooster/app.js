'use strict';
const state={lessons:[],days:[],day:'',open:false,token:'',busy:false,timer:null};
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const n=document.createElement(tag); if(text!==undefined)n.textContent=text; return n;};
const endpoint='/.netlify/functions/buddycheck-temporary';
function feedback(message,error=false){$('loginFeedback').textContent=message;$('loginFeedback').className=error?'small error':'small success';}
function clearSession(){state.token='';clearTimeout(state.timer);$('login').classList.remove('hidden');$('logout').classList.add('hidden');$('myPanel').classList.add('hidden');$('mine').replaceChildren();paint();}
async function api(body,auth=false){
 const headers={}; if(body)headers['Content-Type']='application/json'; if(auth&&state.token)headers.Authorization='Bearer '+state.token;
 const r=await fetch(endpoint,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
 let data;try{data=await r.json();}catch{throw Error('Dienst tijdelijk niet bereikbaar. Probeer later opnieuw.');}
 if(r.status===401){clearSession();throw Error(data.message||'Log opnieuw in.');}
 if(!r.ok||data.ok===false)throw Error(data.message||'Aanvraag niet verwerkt.');
 return data;
}
function paint(){
 $('days').replaceChildren();$('lessons').replaceChildren();
 for(const d of state.days){const b=el('button',new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).format(new Date(d+'T12:00:00Z')));b.type='button';b.className=d===state.day?'active':'';b.setAttribute('aria-pressed',String(d===state.day));b.onclick=()=>{state.day=d;paint();};$('days').append(b);}
 const lessons=state.lessons.filter(l=>l.date===state.day);
 if(!lessons.length)$('lessons').append(el('p','Er zijn momenteel geen bevestigde lessen beschikbaar.'));
 for(const l of lessons){
  const article=el('article');article.className='lesson';
  const head=el('header');head.className='lesson-head';head.append(el('time',l.start),el('h3',l.name));
  article.append(head,el('p',l.start+'–'+l.end+(l.room?' · '+l.room:'')),el('p',l.available+' plekken beschikbaar'));
  const b=el('button','Reserveer');b.type='button';b.disabled=state.busy||!state.open||l.available<=0;
  b.onclick=async()=>{
   if(!state.token){feedback('Log eerst in en kies daarna Reserveer.');$('email').focus();return;}
   await change('book',l.id);
  };article.append(b);$('lessons').append(article);
 }
}
async function schedule(){
 state.open=false;state.lessons=[];state.days=[];
 try{const d=await api();state.open=d.bookingOpen===true;state.lessons=Array.isArray(d.lessons)?d.lessons:[];state.days=Array.isArray(d.days)?d.days:[];}
 catch{feedback('Rooster niet bereikbaar. Reserveren blijft gesloten.',true);}
 if(!state.days.includes(state.day))state.day=state.days[0]||'';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const confirmed=$('confirmedSchedule');
 confirmed.querySelectorAll('[data-schedule-date]').forEach(day=>{day.hidden=day.dataset.scheduleDate<today;});
 confirmed.hidden=state.open||!Array.from(confirmed.querySelectorAll('[data-schedule-date]')).some(day=>!day.hidden);
 $('days').closest('section').hidden=!state.open&&!confirmed.hidden;
 $('notice').textContent=state.open?'Het gecontroleerde tijdelijke rooster is geopend. Log in om te reserveren.':'We controleren het rooster en de abonnementsrechten. Nieuwe reserveringen zijn gesloten. Je bestaande reserveringen kun je na inloggen bekijken.';
 paint();
}
async function mine(){
 if(!state.token)return;
 const d=await api(null,true);$('mine').replaceChildren();$('myPanel').classList.remove('hidden');
 if(!d.reservations?.length)$('mine').append(el('p','Je hebt geen reserveringen.'));
 for(const r of d.reservations||[]){
  const row=el('article');row.className='lesson';row.append(el('h3',r.name),el('p',r.date+' · '+r.start+'–'+r.end+(r.active?'':' · Les niet actief; neem contact op met Fit Up.')));
  const b=el('button','Annuleer');b.type='button';b.disabled=state.busy;b.onclick=()=>change('cancel',r.lessonId);row.append(b);$('mine').append(row);
 }
}
async function change(action,lessonId){
 if(state.busy)return;state.busy=true;paint();$('mine').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{const d=await api({action,lessonId},true);feedback(d.message);}
 catch(e){feedback(e.message+' Controleer Mijn reserveringen voordat je opnieuw probeert.',true);}
 finally{state.busy=false;await schedule();try{await mine();}catch(e){feedback(e.message,true);}}
}
$('login').addEventListener('submit',async e=>{
 e.preventDefault();if(state.busy)return;state.busy=true;const b=e.submitter;b.disabled=true;
 try{
  const d=await api({action:'login',email:$('email').value.trim(),password:$('password').value});
  state.token=d.accessToken;state.timer=setTimeout(()=>{clearSession();feedback('Je sessie is verlopen. Log opnieuw in.');},Math.max(1,Math.min(Number(d.expiresIn)||3600,3600))*1000);
  $('login').classList.add('hidden');$('logout').classList.remove('hidden');feedback('Je bent ingelogd. Kies een les om te reserveren.');await mine();
 }catch(e){feedback(e.message,true);}finally{$('password').value='';state.busy=false;b.disabled=false;paint();}
});
$('logout').onclick=async()=>{try{await api({action:'logout'},true);}catch{}finally{clearSession();feedback('Je bent uitgelogd.');}};
schedule();
