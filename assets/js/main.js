/* Fit Up Leiderdorp — shared site script
 *
 * Per-page interactive code lives inline at the bottom of each HTML
 * file (nav scroll state, fade-in observers, etc). This file is
 * loaded site-wide for behaviour that should apply everywhere.
 */

(function () {
  'use strict';

  // Sticky-nav scroll state — adds .scrolled to <nav> after 40px.
  // Safe no-op on pages without a <nav> element.
  var nav = document.querySelector('nav');
  if (nav) {
    var onScroll = function () {
      if (window.scrollY > 40) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mark the current nav link as active based on pathname prefix.
  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.nav-links a[href]').forEach(function (a) {
    var href = a.getAttribute('href').replace(/\/+$/, '') || '/';
    if (href !== '/' && path.indexOf(href) === 0) {
      a.setAttribute('aria-current', 'page');
    } else if (href === '/' && path === '/') {
      a.setAttribute('aria-current', 'page');
    }
  });
})();
