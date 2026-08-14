// Temporary build engine for SEO landing pages — safe to delete after generation.

const chk='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const pin='<svg class="local-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const pinFoot='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const arrow='<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrowDark='<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const probIcon='<span class="ps-prob-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></span>';
const solIcon='<span class="ps-sol-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';

const NAV=`<nav id="nav" role="navigation" aria-label="Hoofdnavigatie">
  <a href="../index.html" class="logo" aria-label="Fit Up Leiderdorp homepage">FIT<span>UP</span></a>
  <ul class="nav-links">
    <li class="has-sub">
      <a href="../trainingsaanbod/index.html" aria-haspopup="true">Trainingsaanbod</a>
      <ul class="nav-submenu" role="menu">
        <li><a href="../trainingsaanbod/sgpt-small-group-personal-training/index.html">Small Group PT<small>Max. 4 personen · coach · resultaat</small></a></li>
        <li><a href="../trainingsaanbod/personal-training/index.html">Personal Training<small>1-op-1 met je eigen coach</small></a></li>
        <li><a href="../trainingsaanbod/24-7-fitness/index.html">24/7 Fitness<small>Zelfstandig trainen · altijd open</small></a></li>
        <li><a href="../trainingsaanbod/groepslessen/index.html">Groepslessen<small>Bodypump · boksfit · HIIT</small></a></li>
      </ul>
    </li>
    <li><a href="../online-coaching/index.html">Online Coaching</a></li>
    <li><a href="../tarieven/index.html">Tarieven</a></li>
    <li><a href="../contact/index.html">Contact</a></li>
    <li><a href="../gratis-intake/index.html" class="nav-btn">Gratis intake</a></li>
  </ul>
  <button class="nav-toggle" id="nav-toggle" type="button" aria-label="Menu openen" aria-expanded="false" aria-controls="nav-drawer">
    <svg class="icon-open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    <svg class="icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
  </button>
</nav>
<div class="nav-drawer" id="nav-drawer" aria-hidden="true">
  <div class="drawer-group">
    <a href="../trainingsaanbod/index.html">Trainingsaanbod</a>
    <ul class="drawer-sub">
      <li><a href="../trainingsaanbod/sgpt-small-group-personal-training/index.html">Small Group PT</a></li>
      <li><a href="../trainingsaanbod/personal-training/index.html">Personal Training</a></li>
      <li><a href="../trainingsaanbod/24-7-fitness/index.html">24/7 Fitness</a></li>
      <li><a href="../trainingsaanbod/groepslessen/index.html">Groepslessen</a></li>
    </ul>
  </div>
  <a href="../online-coaching/index.html">Online Coaching</a>
  <a href="../tarieven/index.html">Tarieven</a>
  <a href="../contact/index.html">Contact</a>
  <a href="../gratis-intake/index.html" class="drawer-cta">Gratis intake</a>
</div>`;

const FOOTER=`<footer>
  <div class="container">
    <div class="footer-grid">
      <div class="f-brand">
        <div class="f-logo">FIT<span>UP</span></div>
        <p>Kleinschalige premium fitnessclub aan de Weversbaan 9 in Leiderdorp. 24/7 fitness, Small Group Personal Training, groepslessen en personal training.</p>
      </div>
      <div class="f-col"><h4>Trainingsaanbod</h4><ul>
        <li><a href="../trainingsaanbod/sgpt-small-group-personal-training/index.html">Small Group PT</a></li>
        <li><a href="../trainingsaanbod/personal-training/index.html">Personal Training</a></li>
        <li><a href="../trainingsaanbod/24-7-fitness/index.html">24/7 Fitness</a></li>
        <li><a href="../trainingsaanbod/groepslessen/index.html">Groepslessen</a></li>
        <li><a href="../online-coaching/index.html">Online Coaching</a></li>
      </ul></div>
      <div class="f-col"><h4>Lokaal</h4><ul>
        <li><a href="../sportschool-leiderdorp/index.html">Sportschool Leiderdorp</a></li>
        <li><a href="../fitnessclub-leiderdorp/index.html">Fitnessclub Leiderdorp</a></li>
        <li><a href="../personal-training-leiderdorp/index.html">Personal Training Leiderdorp</a></li>
        <li><a href="../afvallen-leiderdorp/index.html">Afvallen Leiderdorp</a></li>
        <li><a href="../hyrox-training-leiderdorp/index.html">Hyrox training Leiderdorp</a></li>
        <li><a href="../fitness-voor-beginners-leiderdorp/index.html">Fitness voor beginners</a></li>
        <li><a href="../fitness-40-plus-leiderdorp/index.html">Fitness 40+</a></li>
        <li><a href="../vrouwen-fitness-leiderdorp/index.html">Vrouwen fitness</a></li>
        <li><a href="../spiermassa-opbouwen-leiderdorp/index.html">Spiermassa opbouwen</a></li>
      </ul></div>
      <div class="f-col"><h4>Contact</h4><ul>
        <li><a href="https://maps.google.com/?q=Weversbaan+9+Leiderdorp" target="_blank" rel="noopener">Weversbaan 9, Leiderdorp</a></li>
        <li><a href="tel:0648776322">06 48776322</a></li>
        <li><a href="mailto:info.fitup1@gmail.com">info.fitup1@gmail.com</a></li>
        <li><a href="https://wa.me/31648776322" target="_blank" rel="noopener">WhatsApp direct</a></li>
      </ul></div>
    </div>
    <div class="f-bottom">
      <p>© 2020–2026 Fit Up Leiderdorp · KvK 60617268 · BTW NL178744876B01</p>
      <p>Sportschool Leiderdorp · 24/7 Fitness Leiderdorp · Personal Trainer Leiderdorp</p>
    </div>
  </div>
</footer>`;

const SCRIPTS=`<script>
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50), {passive:true});
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); observer.unobserve(e.target); } });
  }, {threshold:0.1, rootMargin:'0px 0px -32px 0px'});
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-q').addEventListener('click', () => item.classList.toggle('open'));
  });
  (function(){
    var t = document.getElementById('nav-toggle'), d = document.getElementById('nav-drawer');
    if(!t||!d) return;
    function set(o){ document.body.classList.toggle('nav-open', o); t.setAttribute('aria-expanded', o?'true':'false'); t.setAttribute('aria-label', o?'Menu sluiten':'Menu openen'); d.setAttribute('aria-hidden', o?'false':'true'); }
    t.addEventListener('click', function(){ set(!document.body.classList.contains('nav-open')); });
    d.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ set(false); }); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') set(false); });
  })();
</script>`;

const CITIES=[
  ['Leiderdorp','Vlak bij Winkelhof — 5 min fietsen.'],
  ['Leiden','10 min rijden vanuit Leiden centrum en Noord.'],
  ['Oegstgeest','12 min via N446 — direct bij de gym parkeren.'],
  ['Voorschoten','15 min via A4 — gratis parkeren bij de deur.'],
];

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');}

const L={
  pt:{h:'../trainingsaanbod/personal-training/index.html',t:'Personal Training',s:'1-op-1 met je eigen coach'},
  sgpt:{h:'../trainingsaanbod/sgpt-small-group-personal-training/index.html',t:'Small Group PT',s:'Max. 4 personen · resultaat'},
  f247:{h:'../trainingsaanbod/24-7-fitness/index.html',t:'24/7 Fitness',s:'Altijd open · zelfstandig trainen'},
  groep:{h:'../trainingsaanbod/groepslessen/index.html',t:'Groepslessen',s:'Bodypump · boksfit · HIIT'},
  tar:{h:'../tarieven/index.html',t:'Tarieven',s:'SGPT · PT · 24/7 · groepslessen'},
  con:{h:'../contact/index.html',t:'Contact',s:'Weversbaan 9 · bel of app ons'},
  afv:{h:'../afvallen-leiderdorp/index.html',t:'Afvallen Leiderdorp',s:'Blijvend resultaat zonder crashdieet'},
  kracht:{h:'../krachttraining-leiderdorp/index.html',t:'Krachttraining Leiderdorp',s:'Sterker worden, methodisch'},
  voed:{h:'../voedingscoach-leiderdorp/index.html',t:'Voedingscoach Leiderdorp',s:'Eetplan en macro-coaching'},
  sport:{h:'../sportschool-leiderdorp/index.html',t:'Sportschool Leiderdorp',s:'Kleinschalig · 24/7 · persoonlijk'},
  club:{h:'../fitnessclub-leiderdorp/index.html',t:'Fitnessclub Leiderdorp',s:'Premium club · alles onder één dak'},
  ptr:{h:'../personal-training-leiderdorp/index.html',t:'Personal Trainer Leiderdorp',s:'Je eigen coach, vaste begeleiding'},
  begin:{h:'../fitness-voor-beginners-leiderdorp/index.html',t:'Fitness voor beginners',s:'Rustig en begeleid starten'},
  veertig:{h:'../fitness-40-plus-leiderdorp/index.html',t:'Fitness 40+ Leiderdorp',s:'Sterk en fit blijven na je 40e'},
  vrouw:{h:'../vrouwen-fitness-leiderdorp/index.html',t:'Vrouwen fitness Leiderdorp',s:'Krachttraining in vertrouwde sfeer'},
  spier:{h:'../spiermassa-opbouwen-leiderdorp/index.html',t:'Spiermassa opbouwen',s:'Methodisch zwaarder, zichtbaar groeien'},
  hyrox:{h:'../hyrox-training-leiderdorp/index.html',t:'Hyrox training Leiderdorp',s:'Kracht + conditie voor de race'},
  ptLeiden:{h:'../personal-trainer-leiden/index.html',t:'Personal trainer Leiden',s:'10 min vanaf Leiden centrum'},
};

function render(p){
  const url='https://fitupleiderdorp.nl/'+p.slug+'/';
  const faqLD={"@context":"https://schema.org","@type":"FAQPage","mainEntity":p.faq.map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":(f.a).replace(/<[^>]+>/g,'')}}))};
  const bizLD={"@context":"https://schema.org","@type":"SportsActivityLocation","name":"Fit Up Leiderdorp","image":"https://fitupleiderdorp.nl/assets/images/logo-mark-on-dark.png","@id":"https://fitupleiderdorp.nl/","url":"https://fitupleiderdorp.nl/","telephone":"+31648776322","email":"info.fitup1@gmail.com","priceRange":"€€","address":{"@type":"PostalAddress","streetAddress":"Weversbaan 9","addressLocality":"Leiderdorp","postalCode":"2352BZ","addressCountry":"NL"},"geo":{"@type":"GeoCoordinates","latitude":52.1564,"longitude":4.5252},"openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],"opens":"00:00","closes":"23:59"}],"sameAs":["https://www.instagram.com/fitupleiderdorp/"]};
  const crumbLD={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://fitupleiderdorp.nl/"},{"@type":"ListItem","position":2,"name":p.crumb,"item":url}]};
  const pills=p.pills.map(t=>'<span class="trust-pill">'+chk+t+'</span>').join('');
  const stats=p.card.stats.map(s=>'<div><div class="hsc-stat-num">'+s[0]+'</div><div class="hsc-stat-label">'+s[1]+'</div></div>').join('\n        ');
  const forCards=p.forwho.cards.map((c,i)=>'      <div class="for-card reveal'+(i>0?' d'+Math.min(i,3):'')+'">\n        <div class="for-num">'+String(i+1).padStart(2,'0')+'</div>\n        <div class="for-title">'+c.t+'</div>\n        <div class="for-desc">'+c.d+'</div>\n      </div>').join('\n');
  const psCards=p.ps.map((c,i)=>'      <div class="ps-card reveal'+(i>0?' d'+i:'')+'">\n        <div class="ps-prob">\n          '+probIcon+'\n          <div><div class="ps-prob-title">'+c.pt+'</div><div class="ps-prob-text">'+c.px+'</div></div>\n        </div>\n        <div class="ps-sol">\n          '+solIcon+'\n          <div><div class="ps-sol-title">Bij Fit Up</div><div class="ps-sol-text">'+c.s+'</div></div>\n        </div>\n      </div>').join('\n');
  const werk=p.werk.map((w,i)=>'      <div class="werk-card reveal'+(i>0?' d'+i:'')+'"><div class="werk-num">0'+(i+1)+'</div><div class="werk-step">Stap 0'+(i+1)+'</div><div class="werk-title">'+w.t+'</div><div class="werk-desc">'+w.d+'</div></div>').join('\n');
  const cities=CITIES.map(c=>'        <div class="local-item">\n          '+pin+'\n          <div><div class="local-item-title">'+c[0]+'</div><div class="local-item-desc">'+c[1]+'</div></div>\n        </div>').join('\n');
  const faqHtml=p.faq.map((f,i)=>'      <div class="faq-item reveal'+(i>0?' d'+Math.min(i,4):'')+'">\n        <button class="faq-q" type="button" aria-expanded="false">'+f.q+'</button>\n        <div class="faq-a"><div class="faq-a-inner">'+f.a+'</div></div>\n      </div>').join('\n');
  const links=p.links.map(l=>'      <a href="'+l.h+'"><span class="linklist-title">'+l.t+'</span><span class="linklist-sub">'+l.s+'</span></a>').join('\n');

  return '<!DOCTYPE html>\n<html lang="nl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>'+p.title+'</title>\n<meta name="description" content="'+esc(p.desc)+'">\n<meta name="keywords" content="'+esc(p.kw)+'">\n<link rel="canonical" href="'+url+'">\n<link rel="icon" type="image/png" href="/favicon.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<meta property="og:title" content="'+esc(p.title)+'">\n<meta property="og:description" content="'+esc(p.desc)+'">\n<meta property="og:url" content="'+url+'">\n<meta property="og:type" content="website">\n<meta property="og:image" content="https://fitupleiderdorp.nl/assets/images/logo-mark-on-dark.png">\n<meta property="og:locale" content="nl_NL">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="'+esc(p.title)+'">\n<meta name="twitter:description" content="'+esc(p.desc)+'">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="../assets/css/seo.css">\n<link rel="stylesheet" href="../assets/css/style.css">\n\n<script type="application/ld+json">'+JSON.stringify(bizLD)+'</'+'script>\n<script type="application/ld+json">'+JSON.stringify(crumbLD)+'</'+'script>\n<script type="application/ld+json">'+JSON.stringify(faqLD)+'</'+'script>\n</head>\n<body>\n\n'+NAV+'\n\n<section class="crumb">\n  <div class="container">\n    <nav class="crumb-inner" aria-label="Kruimelpad">\n      <a href="../index.html">Home</a>\n      <span class="crumb-sep">/</span>\n      <span class="crumb-cur">'+p.crumb+'</span>\n    </nav>\n  </div>\n</section>\n\n<header class="seo-hero">\n  <div class="container">\n    <div class="seo-hero-grid">\n      <div>\n        <div class="hero-eyebrow"><span class="eyebrow-dot"></span>'+p.eyebrow+'</div>\n        <h1><span class="h1-kicker">'+p.kw1+'</span>'+p.h1a+'<br><em>'+p.h1b+'</em></h1>\n        <p class="seo-hero-sub">'+p.sub+'</p>\n        <div class="trust-row">'+pills+'</div>\n        <div class="seo-hero-ctas">\n          <a href="'+PAYN+'" target="_blank" rel="noopener" class="btn-accent">Plan gratis intake '+arrow+'</a>\n          <a href="https://wa.me/31648776322?text=Hi%20Fit%20Up%2C%20ik%20heb%20een%20vraag%20over%20'+encodeURIComponent(p.crumb)+'" target="_blank" rel="noopener" class="btn-outline">WhatsApp direct</a>\n        </div>\n      </div>\n      <aside class="hero-stats-card">\n        <div class="hsc-label">'+p.card.label+'</div>\n        <div class="hsc-title">'+p.card.title+'</div>\n        <div class="hsc-stats">\n        '+stats+'</div>\n        <div class="hsc-foot">\n          '+pinFoot+'\n          <span>Weversbaan 9, Leiderdorp · gratis parkeren voor de deur</span>\n        </div>\n      </aside>\n    </div>\n  </div>\n</header>\n\n<section aria-labelledby="forwho">\n  <div class="container">\n    <div class="sec-head">\n      <div class="sec-label reveal"><span class="sec-label-line"></span>Voor wie</div>\n      <h2 id="forwho" class="reveal d1">'+p.forwho.h2+'</h2>\n      <p class="reveal d2">'+p.forwho.sub+'</p>\n    </div>\n    <div class="for-grid">\n'+forCards+'</div>\n  </div>\n</section>\n\n<section aria-labelledby="ps">\n  <div class="container">\n    <div class="sec-head">\n      <div class="sec-label reveal"><span class="sec-label-line"></span>Probleem → oplossing</div>\n      <h2 id="ps" class="reveal d1">Herkenbaar?<br><em>Zo lossen we het op.</em></h2>\n      <p class="reveal d2">'+p.psSub+'</p>\n    </div>\n    <div class="ps-grid">\n'+psCards+'</div>\n  </div>\n</section>\n\n<section aria-labelledby="werk">\n  <div class="container">\n    <div class="sec-head">\n      <div class="sec-label reveal"><span class="sec-label-line"></span>Werkwijze</div>\n      <h2 id="werk" class="reveal d1">Van eerste gesprek<br><em>tot meetbaar resultaat</em></h2>\n      <p class="reveal d2">Vier stappen, geen verkooppraatje. We meten, sturen bij en kijken eerlijk of dit traject bij jou past.</p>\n    </div>\n    <div class="werk-grid">\n'+werk+'\n    </div>\n  </div>\n</section>\n\n<section class="local-band" aria-labelledby="local">\n  <div class="container">\n    <div class="local-grid">\n      <div>\n        <div class="sec-label reveal"><span class="sec-label-line"></span>Lokaal in Leiderdorp</div>\n        <h2 id="local" class="reveal d1">'+p.localH2+'</h2>\n        <p class="reveal d2" style="font-size:15px;color:var(--ink-soft);line-height:1.75;margin-top:18px;max-width:480px;font-weight:300">'+p.localP+'</p>\n        <div class="local-list">\n'+cities+'</div>\n      </div>\n      <div class="local-photo reveal d2">\n        <img src="../assets/images/'+p.photo+'" alt="'+esc(p.crumb)+' bij Fit Up Leiderdorp" loading="lazy">\n      </div>\n    </div>\n  </div>\n</section>\n\n<section class="cta-block">\n  <div class="container">\n    <h2 class="reveal">'+p.ctaH2+'</h2>\n    <p class="reveal d1">Plan een gratis intake — vrijblijvend, eerlijk advies. Of stuur direct een appje, dan praten we even kort door.</p>\n    <div class="cta-actions reveal d2">\n      <a href="'+PAYN+'" target="_blank" rel="noopener" class="btn-dark">Plan gratis intake '+arrowDark+'</a>\n      <a href="https://wa.me/31648776322?text=Hi%20Fit%20Up%2C%20ik%20wil%20graag%20meer%20weten%20over%20'+encodeURIComponent(p.crumb)+'" target="_blank" rel="noopener" class="btn-outline-dark">WhatsApp sturen</a>\n    </div>\n  </div>\n</section>\n\n<section aria-labelledby="faq">\n  <div class="container">\n    <div class="sec-head">\n      <div class="sec-label reveal"><span class="sec-label-line"></span>Veelgestelde vragen</div>\n      <h2 id="faq" class="reveal d1">Vragen die we<br><em>vaak krijgen</em></h2>\n    </div>\n    <div class="faq-grid">\n'+faqHtml+'</div>\n  </div>\n</section>\n\n<section aria-labelledby="meer">\n  <div class="container">\n    <div class="sec-head">\n      <div class="sec-label reveal"><span class="sec-label-line"></span>Meer ontdekken</div>\n      <h2 id="meer" class="reveal d1">Lees ook</h2>\n    </div>\n    <div class="linklist">\n'+links+'\n    </div>\n  </div>\n</section>\n\n'+FOOTER+'\n'+SCRIPTS+'\n</body>\n</html>';
}

globalThis.__seo = { render, L };
