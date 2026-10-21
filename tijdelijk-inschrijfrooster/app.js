'use strict';
const endpoint='/.netlify/functions/buddycheck-requests';
const $=id=>document.getElementById(id),make=(tag,t)=>{const e=document.createElement(tag);if(t!==undefined)e.textContent=t;return e};
let selected=null;
function message(t,err=false){$('message').textContent=t;$('message').className=err?'error':'success'}
async function load(){
 try{
 const r=await fetch(endpoint,{cache:'no-store'});const d=await r.json();if(!r.ok||!d.open)throw Error('Aanvragen zijn nog niet beschikbaar.');
 const c=$('lessons');c.replaceChildren();if(!d.lessons?.length)c.append(make('p','Er zijn nog geen lessen ingevoerd.'));
 for(const l of d.lessons||[]){
 const article=make('article');article.className='card';const date=make('div',new Intl.DateTimeFormat('nl-NL',{dateStyle:'full',timeZone:'Europe/Amsterdam'}).format(new Date(l.date+'T12:00:00Z')));date.className='date';
 article.append(date,make('h2',l.name),make('p',l.start+'–'+l.end+(l.room?' · '+l.room:'')));
 const b=make('button','Aanvraag indienen');b.type='button';b.disabled=l.approved>=l.capacity;b.onclick=()=>{selected=l;$('selected').textContent='Aanvraag: '+l.name+' · '+l.date+' '+l.start;$('request').classList.remove('hidden');$('request').scrollIntoView({behavior:'smooth'})};
 article.append(b);if(b.disabled)article.append(make('p','Les is vol'));c.append(article);
 }
 }catch(e){$('lessons').textContent='Het rooster is momenteel niet beschikbaar. Neem contact op met Fit Up.';message(e.message,true)}
}
$('form').addEventListener('submit',async e=>{
 e.preventDefault();if(!selected)return;const btn=$('submit');btn.disabled=true;
 try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',lessonId:selected.id,name:$('fullName').value,email:$('email').value,website:$('website').value})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||'Aanvraag niet verwerkt.');message(d.message);$('request').classList.add('hidden');$('form').reset();await load();}
 catch(e){message(e.message,true)}finally{btn.disabled=false}
});
load();