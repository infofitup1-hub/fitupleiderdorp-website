(function () {
  var d = document.getElementById('nav-drawer');
  if (!d) return;
  var chev = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var groups = d.querySelectorAll('.drawer-group');
  groups.forEach(function (g, i) {
    var a = g.querySelector(':scope > a'), sub = g.querySelector('.drawer-sub');
    if (!a || !sub) return;
    sub.id = sub.id || 'drawer-sub-' + i;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'drawer-toggle';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', sub.id);
    b.setAttribute('aria-label', 'Toon onderdelen van ' + a.textContent.trim());
    b.innerHTML = chev;
    a.after(b);
    b.addEventListener('click', function () {
      var open = g.classList.toggle('open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  d.classList.add('dd-ready');
  new MutationObserver(function () {
    if (document.body.classList.contains('nav-open')) return;
    groups.forEach(function (g) {
      g.classList.remove('open');
      var b = g.querySelector('.drawer-toggle');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
    d.scrollTop = 0;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();

/* Vaste mobiele knop "Plan gratis intake" (alleen kleine schermen, na wat scrollen) */
(function () {
  var skip = /^\/(gratis-intake|intake|bedankt|contact)(\/|$)|ad-landing/;
  if (skip.test(location.pathname)) return;
  var a = document.createElement('a');
  a.className = 'sticky-cta';
  a.href = '/gratis-intake/';
  a.textContent = 'Plan gratis intake';
  document.body.appendChild(a);
  var onScroll = function () { a.classList.toggle('show', window.scrollY > 600); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  a.addEventListener('click', function () { if (window.gtag) gtag('event', 'sticky_cta_click'); });
})();
