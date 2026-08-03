/* =============================================================
   FIT UP LEIDERDORP — Conversielaag
   Modulaire opbouw:
     FU_CL.state     -> huidige status van de widget
     FU_CL.storage   -> localStorage/sessionStorage helpers
     FU_CL.tracking  -> analytics events (dataLayer + Meta Pixel)
     FU_CL.routing   -> bepaalt vervolgvragen en aanbeveling
     FU_CL.render    -> bouwt en toont de HTML
     FU_CL.form      -> validatie, verzending, foutafhandeling
     FU_CL.triggers  -> tijd / scroll / exit-intent / knop
   Laadt pas na de hoofdcontent (script staat vlak voor </body>).
   ============================================================= */
(function () {
  'use strict';

  var CFG = window.FU_CL_CONFIG;
  if (!CFG) return; // config niet geladen -> widget doet niets, breekt niets

  /* -----------------------------------------------------------
     STATE
     ----------------------------------------------------------- */
  var state = {
    open: false,
    screen: 'main',          // main | follow-1 | follow-2 | result | form | success
    mainChoice: null,
    followUpAnswers: {},
    followUpQueue: [],
    followUpIndex: 0,
    recommendation: null,
    triggerType: null,       // time | scroll | exit_intent | button
    lastFocusedEl: null,
    startedAt: null
  };

  /* -----------------------------------------------------------
     STORAGE
     ----------------------------------------------------------- */
  var storage = {
    setSession: function (key, val) {
      try { sessionStorage.setItem(key, val); } catch (e) {}
    },
    getSession: function (key) {
      try { return sessionStorage.getItem(key); } catch (e) { return null; }
    },
    setLocal: function (key, val) {
      try { localStorage.setItem(key, val); } catch (e) {}
    },
    getLocal: function (key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    removeLocal: function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    },
    hasConverted: function () {
      return storage.getLocal(CFG.storage.convertedKey) === '1';
    },
    markConverted: function () {
      storage.setLocal(CFG.storage.convertedKey, '1');
    },
    shownThisSession: function () {
      return storage.getSession(CFG.storage.sessionShownKey) === '1';
    },
    markShownThisSession: function () {
      storage.setSession(CFG.storage.sessionShownKey, '1');
    },
    inCooldown: function () {
      var raw = storage.getLocal(CFG.storage.dismissedAtKey);
      if (!raw) return false;
      var dismissedAt = parseInt(raw, 10);
      if (!dismissedAt) return false;
      var days = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      return days < CFG.storage.cooldownDays;
    },
    markDismissedNow: function () {
      storage.setLocal(CFG.storage.dismissedAtKey, String(Date.now()));
    },
    savePendingLead: function (payload) {
      var personal = {
        voornaam: payload.voornaam,
        telefoonnummer: payload.telefoonnummer,
        email: payload.email,
        voorkeursmomentContact: payload.voorkeursmomentContact
      };
      var meta = {};
      Object.keys(payload).forEach(function (k) {
        if (!(k in personal)) meta[k] = payload[k];
      });
      // Persoonsgegevens: alleen kort in sessionStorage, met bewaartermijn
      try {
        sessionStorage.setItem(
          CFG.storage.pendingPersonalKey,
          JSON.stringify({ data: personal, savedAt: Date.now() })
        );
      } catch (e) {}
      // Niet-persoonlijke route/campagnedata: mag langer blijven staan (geen PII)
      try {
        localStorage.setItem(CFG.storage.pendingMetaKey, JSON.stringify(meta));
      } catch (e) {}
    },
    prunePendingPersonal: function () {
      try {
        var raw = sessionStorage.getItem(CFG.storage.pendingPersonalKey);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        var ageMinutes = (Date.now() - parsed.savedAt) / 60000;
        if (ageMinutes > CFG.storage.pendingPersonalTtlMinutes) {
          sessionStorage.removeItem(CFG.storage.pendingPersonalKey);
        }
      } catch (e) {}
    },
    getPendingPersonal: function () {
      storage.prunePendingPersonal();
      try {
        var raw = sessionStorage.getItem(CFG.storage.pendingPersonalKey);
        if (!raw) return null;
        return JSON.parse(raw).data;
      } catch (e) { return null; }
    },
    clearPendingLead: function () {
      try { sessionStorage.removeItem(CFG.storage.pendingPersonalKey); } catch (e) {}
      try { localStorage.removeItem(CFG.storage.pendingMetaKey); } catch (e) {}
    }
  };

  /* -----------------------------------------------------------
     TRACKING
     Gebruikt bestaande dataLayer/gtag (GA4) en fbq (Meta Pixel).
     Voegt geen nieuwe trackingbibliotheek toe. Geen persoonsgegevens.
     ----------------------------------------------------------- */
  var tracking = {
    getUtm: function () {
      var params = new URLSearchParams(window.location.search);
      return {
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        utm_term: params.get('utm_term') || '',
        utm_content: params.get('utm_content') || ''
      };
    },
    event: function (name, extra) {
      var utm = tracking.getUtm();
      var payload = Object.assign({
        event: name,
        page_path: window.location.pathname,
        route: state.mainChoice || undefined,
        recommendation: (state.recommendation && state.recommendation.title) || undefined,
        trigger_type: state.triggerType || undefined,
        utm_source: utm.utm_source || undefined,
        utm_campaign: utm.utm_campaign || undefined
      }, extra || {});
      // schoon undefined velden op
      Object.keys(payload).forEach(function (k) { if (payload[k] === undefined) delete payload[k]; });

      if (typeof window.gtag === 'function') {
        window.gtag('event', name, payload);
      } else if (window.dataLayer) {
        window.dataLayer.push(payload);
      }
    },
    lead: function () {
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
    }
  };

  /* -----------------------------------------------------------
     ROUTING
     ----------------------------------------------------------- */
  var routing = {
    getFollowUpQueue: function (mainChoiceId) {
      var route = CFG.routes[mainChoiceId];
      return route ? route.followUps.slice() : [];
    },
    getRecommendation: function () {
      var route = CFG.routes[state.mainChoice];
      if (!route) return null;
      if (route.recommendationByAnswer) {
        var key = state.followUpAnswers.begeleiding;
        return route.recommendationByAnswer[key] || null;
      }
      return route.recommendation || null;
    }
  };

  /* -----------------------------------------------------------
     RENDER
     ----------------------------------------------------------- */
  var els = {};

  function buildSkeleton() {
    var wrap = document.createElement('div');
    wrap.id = 'fu-cl-root';
    wrap.innerHTML =
      '<button type="button" id="fu-cl-fab" class="fu-cl-fab" aria-haspopup="dialog">' +
        '<span class="fu-cl-fab-title">Vind jouw beste start</span>' +
        '<span class="fu-cl-fab-sub">Beantwoord 3 korte vragen</span>' +
      '</button>' +
      '<div id="fu-cl-overlay" class="fu-cl-overlay" hidden>' +
        '<div id="fu-cl-dialog" class="fu-cl-dialog" role="dialog" aria-modal="true" aria-labelledby="fu-cl-title">' +
          '<button type="button" id="fu-cl-close" class="fu-cl-close" aria-label="Sluiten">&times;</button>' +
          '<div class="fu-cl-dialog-scroll">' +
            '<div id="fu-cl-body" class="fu-cl-body"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    els.root = wrap;
    els.fab = wrap.querySelector('#fu-cl-fab');
    els.overlay = wrap.querySelector('#fu-cl-overlay');
    els.dialog = wrap.querySelector('#fu-cl-dialog');
    els.close = wrap.querySelector('#fu-cl-close');
    els.body = wrap.querySelector('#fu-cl-body');

    els.fab.addEventListener('click', function () { open('button'); });
    els.close.addEventListener('click', function () { close(true); });
    els.overlay.addEventListener('click', function (e) {
      if (e.target === els.overlay) close(true);
    });
    document.addEventListener('keydown', function (e) {
      if (!state.open) return;
      if (e.key === 'Escape') close(true);
      if (e.key === 'Tab') trapFocus(e);
    });

    // Voorkom overlap met het mobiele menu (nav-drawer, z-index 190):
    // verberg de vaste knop zolang het menu open staat.
    var updateFabVisibility = function () {
      els.fab.style.display = document.body.classList.contains('nav-open') ? 'none' : '';
    };
    updateFabVisibility();
    if (window.MutationObserver) {
      new MutationObserver(updateFabVisibility).observe(document.body, {
        attributes: true, attributeFilter: ['class']
      });
    }
  }

  function trapFocus(e) {
    var focusable = els.dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function progressDots(current, total) {
    var html = '<div class="fu-cl-progress" aria-hidden="true">';
    for (var i = 0; i < total; i++) {
      html += '<span class="fu-cl-dot' + (i <= current ? ' is-active' : '') + '"></span>';
    }
    html += '</div>';
    return html;
  }

  function renderMain() {
    var html = '<h2 id="fu-cl-title" class="fu-cl-heading">' + CFG.mainQuestion.title + '</h2>';
    html += '<p class="fu-cl-sub">' + CFG.mainQuestion.subtitle + '</p>';
    html += '<div class="fu-cl-options">';
    CFG.mainQuestion.options.forEach(function (opt) {
      html += '<button type="button" class="fu-cl-option" data-choice="' + opt.id + '">' +
        '<span class="fu-cl-option-label">' + opt.label + '</span>' +
        '<span class="fu-cl-option-desc">' + opt.desc + '</span>' +
        '</button>';
    });
    html += '</div>';
    els.body.innerHTML = html;

    els.body.querySelectorAll('.fu-cl-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectMainChoice(btn.getAttribute('data-choice'));
      });
    });
    focusFirst();
  }

  function renderFollowUp() {
    var qKey = state.followUpQueue[state.followUpIndex];
    var q = CFG.followUpQuestions[qKey];
    var totalSteps = 1 + state.followUpQueue.length; // main + follow-ups
    var currentStep = 1 + state.followUpIndex;

    var html = progressDots(currentStep, totalSteps);
    html += '<h2 id="fu-cl-title" class="fu-cl-heading">' + q.question + '</h2>';
    html += '<div class="fu-cl-options">';
    q.options.forEach(function (opt) {
      html += '<button type="button" class="fu-cl-option fu-cl-option--compact" data-answer="' + opt.id + '">' +
        '<span class="fu-cl-option-label">' + opt.label + '</span>' +
        '</button>';
    });
    html += '</div>';
    html += '<button type="button" class="fu-cl-back">&larr; Vorige vraag</button>';
    els.body.innerHTML = html;

    els.body.querySelectorAll('.fu-cl-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        answerFollowUp(qKey, btn.getAttribute('data-answer'));
      });
    });
    els.body.querySelector('.fu-cl-back').addEventListener('click', goBack);
    focusFirst();
  }

  function renderResult() {
    var rec = state.recommendation;
    var linkKey = rec.link;
    var url = CFG.links[linkKey] || CFG.links.trainingsaanbod;

    var html = '<p class="fu-cl-eyebrow">Dit lijkt het beste bij jou te passen</p>';
    html += '<h2 id="fu-cl-title" class="fu-cl-heading">' + rec.title + '</h2>';
    html += '<p class="fu-cl-sub">' + rec.message + '</p>';
    html += '<p class="fu-cl-benefit">' + rec.benefit + '</p>';
    html += '<div class="fu-cl-actions">';
    html += '<button type="button" class="fu-cl-btn-primary" id="fu-cl-to-form">Bespreek mijn mogelijkheden</button>';
    html += '<a class="fu-cl-btn-secondary" href="' + url + '">Bekijk eerst meer informatie</a>';
    html += '</div>';
    html += '<button type="button" class="fu-cl-back">&larr; Vorige vraag</button>';
    els.body.innerHTML = html;

    els.body.querySelector('#fu-cl-to-form').addEventListener('click', function () {
      state.screen = 'form';
      tracking.event('conversion_lead_started');
      renderForm();
    });
    els.body.querySelector('.fu-cl-back').addEventListener('click', goBack);
    focusFirst();

    tracking.event('conversion_recommendation_viewed');
  }

  function renderForm() {
    var ml = CFG.antiSpam.maxLengths;
    var html = '<h2 id="fu-cl-title" class="fu-cl-heading">Bijna klaar</h2>';
    html += '<p class="fu-cl-sub">Laat je gegevens achter, dan neemt Patrick persoonlijk contact met je op.</p>';
    html += '<form id="fu-cl-form" novalidate>';

    // Honeypot: onzichtbaar voor mensen, aantrekkelijk voor bots. Niet display:none
    // (sommige bots negeren dat), wel buiten beeld en uit de tabvolgorde/screenreader.
    html += '<div class="fu-cl-hp" aria-hidden="true">';
    html += '<label for="fu-cl-hp-field">Laat dit veld leeg</label>';
    html += '<input type="text" id="fu-cl-hp-field" name="' + CFG.antiSpam.honeypotFieldName + '" tabindex="-1" autocomplete="off">';
    html += '</div>';

    html += '<div class="fu-cl-field">';
    html += '<label for="fu-cl-naam">Voornaam</label>';
    html += '<input type="text" id="fu-cl-naam" name="naam" autocomplete="given-name" maxlength="' + ml.naam + '" required>';
    html += '<span class="fu-cl-error" id="fu-cl-err-naam" role="alert"></span>';
    html += '</div>';

    html += '<div class="fu-cl-field">';
    html += '<label for="fu-cl-tel">Mobiel telefoonnummer</label>';
    html += '<input type="tel" id="fu-cl-tel" name="tel" autocomplete="tel" maxlength="' + ml.tel + '" required>';
    html += '<span class="fu-cl-error" id="fu-cl-err-tel" role="alert"></span>';
    html += '</div>';

    html += '<div class="fu-cl-field">';
    html += '<label for="fu-cl-email">E-mailadres <span class="fu-cl-optional">(optioneel)</span></label>';
    html += '<input type="email" id="fu-cl-email" name="email" autocomplete="email" maxlength="' + ml.email + '">';
    html += '<span class="fu-cl-error" id="fu-cl-err-email" role="alert"></span>';
    html += '</div>';

    html += '<div class="fu-cl-field">';
    html += '<label for="fu-cl-moment">Voorkeursmoment voor contact <span class="fu-cl-optional">(optioneel)</span></label>';
    html += '<select id="fu-cl-moment" name="moment">';
    html += '<option value="">Maakt niet uit</option>';
    html += '<option value="ochtend">Ochtend</option>';
    html += '<option value="middag">Middag</option>';
    html += '<option value="avond">Avond</option>';
    html += '</select>';
    html += '</div>';

    html += '<div class="fu-cl-checkbox">';
    html += '<input type="checkbox" id="fu-cl-consent" name="consent" required>';
    html += '<label for="fu-cl-consent">Ik ga akkoord dat Fit Up Leiderdorp contact met mij opneemt over mijn aanvraag.</label>';
    html += '</div>';
    html += '<span class="fu-cl-error" id="fu-cl-err-consent" role="alert"></span>';

    html += '<div class="fu-cl-checkbox">';
    html += '<input type="checkbox" id="fu-cl-marketing" name="marketing">';
    html += '<label for="fu-cl-marketing">Ik wil ook toekomstige tips en aanbiedingen van Fit Up Leiderdorp ontvangen.</label>';
    html += '</div>';

    html += '<button type="submit" class="fu-cl-btn-primary fu-cl-submit">' + CFG.contactForm.submitLabel + '</button>';
    html += '<p class="fu-cl-form-note">' + CFG.contactForm.submitNote + '</p>';
    html += '<p class="fu-cl-privacy"><a href="' + CFG.privacyUrl + '">Privacybeleid</a></p>';
    html += '<div class="fu-cl-submit-error" id="fu-cl-submit-error" role="alert" hidden></div>';
    html += '</form>';
    html += '<button type="button" class="fu-cl-back">&larr; Vorige vraag</button>';

    els.body.innerHTML = html;

    // Herstel eerder ingevulde gegevens als die nog vers zijn (max. 30 min, deze sessie)
    var restored = storage.getPendingPersonal();
    if (restored) {
      if (restored.voornaam) document.getElementById('fu-cl-naam').value = restored.voornaam;
      if (restored.telefoonnummer) document.getElementById('fu-cl-tel').value = restored.telefoonnummer;
      if (restored.email) document.getElementById('fu-cl-email').value = restored.email;
      if (restored.voorkeursmomentContact) document.getElementById('fu-cl-moment').value = restored.voorkeursmomentContact;
    }

    // Tijdstip waarop het formulier zichtbaar werd, voor de minimale-invultijd-check
    state.formRenderedAt = Date.now();

    els.body.querySelector('#fu-cl-form').addEventListener('submit', form.handleSubmit);
    els.body.querySelector('.fu-cl-back').addEventListener('click', function () {
      state.screen = 'result';
      renderResult();
    });
    focusFirst();
  }

  function renderSuccess(naam) {
    var html = '<h2 id="fu-cl-title" class="fu-cl-heading">Bedankt' + (naam ? ', ' + escapeHtml(naam) : '') + '</h2>';
    html += '<p class="fu-cl-sub">Je aanvraag is ontvangen. Patrick neemt persoonlijk contact met je op.</p>';
    html += '<div class="fu-cl-actions">';
    html += '<a class="fu-cl-btn-primary" href="' + CFG.links.trainingsaanbod + '">Bekijk onze trainingsmogelijkheden</a>';
    html += '<a class="fu-cl-btn-secondary" href="https://wa.me/' + CFG.whatsappNumber + '" target="_blank" rel="noopener">Stuur direct een WhatsApp</a>';
    html += '</div>';
    els.body.innerHTML = html;
    focusFirst();
  }

  function focusFirst() {
    var focusable = els.dialog.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) focusable.focus();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* -----------------------------------------------------------
     FLOW BESTURING
     ----------------------------------------------------------- */
  function selectMainChoice(choiceId) {
    state.mainChoice = choiceId;
    state.followUpQueue = routing.getFollowUpQueue(choiceId);
    state.followUpIndex = 0;
    state.followUpAnswers = {};

    tracking.event('conversion_route_selected');
    tracking.event('conversion_step_completed', { step: 'main' });

    if (state.followUpQueue.length > 0) {
      state.screen = 'follow';
      renderFollowUp();
    } else {
      goToResult();
    }
  }

  function answerFollowUp(qKey, answerId) {
    state.followUpAnswers[qKey] = answerId;
    tracking.event('conversion_step_completed', { step: qKey });

    if (state.followUpIndex < state.followUpQueue.length - 1) {
      state.followUpIndex++;
      renderFollowUp();
    } else {
      goToResult();
    }
  }

  function goToResult() {
    state.recommendation = routing.getRecommendation();
    if (!state.recommendation) {
      // val veilig terug op de kennismaken-aanbeveling als er geen match is
      state.recommendation = CFG.routes.kennismaken.recommendation;
    }
    state.screen = 'result';
    renderResult();
  }

  function goBack() {
    if (state.screen === 'follow') {
      if (state.followUpIndex > 0) {
        state.followUpIndex--;
        renderFollowUp();
      } else {
        state.screen = 'main';
        renderMain();
      }
    } else if (state.screen === 'result') {
      if (state.followUpQueue.length > 0) {
        state.followUpIndex = state.followUpQueue.length - 1;
        state.screen = 'follow';
        renderFollowUp();
      } else {
        state.screen = 'main';
        renderMain();
      }
    } else if (state.screen === 'form') {
      state.screen = 'result';
      renderResult();
    }
  }

  /* -----------------------------------------------------------
     FORM HANDLING
     ----------------------------------------------------------- */
  var form = {
    handleSubmit: function (e) {
      e.preventDefault();
      var naamEl = document.getElementById('fu-cl-naam');
      var telEl = document.getElementById('fu-cl-tel');
      var emailEl = document.getElementById('fu-cl-email');
      var momentEl = document.getElementById('fu-cl-moment');
      var consentEl = document.getElementById('fu-cl-consent');
      var marketingEl = document.getElementById('fu-cl-marketing');
      var hpEl = document.getElementById('fu-cl-hp-field');

      // ---- Spamsignalen verzamelen ----
      // Belangrijk: alleen de honeypot is een betrouwbaar signaal (een mens kan dat
      // veld praktisch niet per ongeluk invullen) en mag daarom direct blokkeren.
      // Een snelle invultijd kan legitiem zijn (browser-autofill) en mag NOOIT alleen
      // op basis daarvan client-side blokkeren -> altijd naar de webhook sturen en
      // de server laten meewegen/beslissen.
      var honeypotFilled = !!(hpEl && hpEl.value.trim() !== '');
      var formFillDurationMs = Date.now() - (state.formRenderedAt || Date.now());
      var spamSignals = [];
      if (formFillDurationMs < CFG.antiSpam.minFillSeconds * 1000) {
        spamSignals.push('fast_submission');
      }

      if (honeypotFilled) {
        tracking.event('conversion_lead_spam_blocked', { reason: 'honeypot' });
        // Geen webhook-call, geen success- en geen foutscherm: dit is geen
        // echte inzending, dus er verandert niets zichtbaars voor de indiener.
        return;
      }

      var valid = true;
      clearErrors();
      var p = CFG.antiSpam.patterns;
      var ml = CFG.antiSpam.maxLengths;

      var naam = naamEl.value.trim().slice(0, ml.naam);
      if (!naam) {
        showError('naam', 'Vul je voornaam in.'); valid = false;
      } else if (!new RegExp(p.naam, 'u').test(naam)) {
        showError('naam', 'Gebruik alleen letters, spaties of een koppelteken.'); valid = false;
      }

      var tel = telEl.value.trim().slice(0, ml.tel);
      if (!tel) {
        showError('tel', 'Vul je telefoonnummer in.'); valid = false;
      } else if (!new RegExp(p.tel).test(tel)) {
        showError('tel', 'Controleer je telefoonnummer.'); valid = false;
      }

      var email = emailEl.value.trim().slice(0, ml.email);
      if (email && !new RegExp(p.email).test(email)) {
        showError('email', 'Controleer je e-mailadres.'); valid = false;
      }

      var allowedMoments = ['', 'ochtend', 'middag', 'avond'];
      var moment = allowedMoments.indexOf(momentEl.value) === -1 ? '' : momentEl.value;

      if (!consentEl.checked) {
        showError('consent', 'Bevestig dat we contact met je mogen opnemen.'); valid = false;
      }

      if (!valid) return;

      var payload = form.buildPayload({
        naam: naam, tel: tel, email: email,
        moment: moment, marketing: marketingEl.checked,
        formFillDurationMs: formFillDurationMs,
        honeypotFilled: honeypotFilled,
        spamSignals: spamSignals
      });

      tracking.event('conversion_lead_submitted');
      if (spamSignals.length) {
        tracking.event('conversion_lead_flagged', { signals: spamSignals.join(',') });
      }

      var submitBtn = els.body.querySelector('.fu-cl-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Bezig met versturen...';

      form.send(payload).then(function () {
        // Alleen hier belanden we als de webhook expliciet success:true teruggaf.
        storage.markConverted();
        storage.clearPendingLead(); // verwijdert alle tijdelijke persoonsgegevens
        tracking.event('conversion_lead_success');
        tracking.lead();
        state.screen = 'success';
        renderSuccess(naam);
      }).catch(function (err) {
        // Netwerkfout, HTTP-fout, ontbrekende/onjuiste JSON, of expliciete
        // afwijzing (success: false) -> nooit een vals bedankscherm tonen.
        tracking.event('conversion_lead_error', { reason: (err && err.reason) || 'unknown' });
        storage.savePendingLead(payload);
        submitBtn.disabled = false;
        submitBtn.textContent = CFG.contactForm.submitLabel;
        var errEl = document.getElementById('fu-cl-submit-error');
        errEl.hidden = false;
        errEl.textContent = 'Verzenden lukt op dit moment niet. Controleer je gegevens en probeer het opnieuw, of neem rechtstreeks contact met ons op.';
      });
    },

    buildPayload: function (fields) {
      var utm = tracking.getUtm();
      return {
        voornaam: fields.naam,
        telefoonnummer: fields.tel,
        email: fields.email || '',
        hoofddoel: state.mainChoice,
        vervolgantwoorden: state.followUpAnswers,
        aanbevolenDienst: state.recommendation ? state.recommendation.title : '',
        gewensteStarttermijn: state.followUpAnswers.start || '',
        voorkeursmomentContact: fields.moment || '',
        startPagina: window.location.pathname,
        referrer: document.referrer || '',
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
        utmTerm: utm.utm_term,
        utmContent: utm.utm_content,
        datumTijd: new Date().toISOString(),
        apparaatCategorie: /Mobi|Android/i.test(navigator.userAgent) ? 'mobiel' : 'desktop',
        toestemmingContact: true,
        toestemmingMarketing: !!fields.marketing,
        leadbron: 'website_conversion_layer',
        formFillDurationMs: fields.formFillDurationMs,
        honeypotFilled: !!fields.honeypotFilled,
        spamSignals: fields.spamSignals || []
      };
    },

    send: function (payload) {
      if (!CFG.webhookUrl) {
        // Nog geen webhook geconfigureerd -> nette foutafhandeling, data blijft
        // bewaard (zie savePendingLead in de catch van handleSubmit). Er wordt
        // hier bewust NOOIT een successcherm getoond zonder bevestiging.
        var noUrlErr = new Error('no webhook configured');
        noUrlErr.reason = 'not_configured';
        return Promise.reject(noUrlErr);
      }
      return fetch(CFG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) {
          var httpErr = new Error('webhook http error ' + res.status);
          httpErr.reason = 'network';
          throw httpErr;
        }
        return res.json().catch(function () {
          var parseErr = new Error('webhook response was not valid JSON');
          parseErr.reason = 'invalid_response';
          throw parseErr;
        });
      }).then(function (body) {
        // Het bedankscherm mag uitsluitend verschijnen wanneer de server
        // expliciet bevestigt dat de lead is geaccepteerd.
        if (!body || body.success !== true) {
          var rejectedErr = new Error('webhook did not confirm success');
          rejectedErr.reason = 'rejected';
          throw rejectedErr;
        }
        return body;
      });
    }
  };

  function showError(field, message) {
    var el = document.getElementById('fu-cl-err-' + field);
    if (el) el.textContent = message;
    var input = document.getElementById('fu-cl-' + field);
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearErrors() {
    els.body.querySelectorAll('.fu-cl-error').forEach(function (el) { el.textContent = ''; });
    els.body.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    var errEl = document.getElementById('fu-cl-submit-error');
    if (errEl) errEl.hidden = true;
  }

  /* -----------------------------------------------------------
     OPEN / CLOSE
     ----------------------------------------------------------- */
  function open(triggerType) {
    if (state.open) return;
    state.open = true;
    state.triggerType = triggerType;
    state.lastFocusedEl = document.activeElement;
    state.screen = 'main';
    state.mainChoice = null;
    state.followUpAnswers = {};
    state.followUpQueue = [];
    state.followUpIndex = 0;

    els.overlay.hidden = false;
    document.body.classList.add('fu-cl-lock');
    // Pauzeer de hero-video: backdrop-filter blur boven een lopende video
    // veroorzaakt op sommige Android/Chrome-toestellen een volledig zwart,
    // onklikbaar vlak i.p.v. een correcte blur. Pauzeren voorkomt dit.
    try {
      var heroVid = document.querySelector('.hero-video-bg video');
      if (heroVid && !heroVid.paused) { heroVid.dataset.fuClWasPlaying = '1'; heroVid.pause(); }
    } catch (e) {}
    renderMain();
    storage.markShownThisSession();

    tracking.event('conversion_layer_triggered', { trigger_type: triggerType });
    tracking.event('conversion_layer_opened');
  }

  function close(userDismissed) {
    if (!state.open) return;
    state.open = false;
    els.overlay.hidden = true;
    document.body.classList.remove('fu-cl-lock');
    try {
      var heroVid2 = document.querySelector('.hero-video-bg video');
      if (heroVid2 && heroVid2.dataset.fuClWasPlaying === '1') {
        delete heroVid2.dataset.fuClWasPlaying;
        heroVid2.play().catch(function () {});
      }
    } catch (e) {}
    if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === 'function') {
      state.lastFocusedEl.focus();
    }
    if (userDismissed && state.screen !== 'success') {
      storage.markDismissedNow();
      tracking.event('conversion_layer_dismissed', { step: state.screen });
    }
  }

  /* -----------------------------------------------------------
     AUTOMATISCHE TRIGGERS
     ----------------------------------------------------------- */
  function canAutoOpen() {
    return !state.open &&
      !storage.shownThisSession() &&
      !storage.inCooldown() &&
      !storage.hasConverted();
  }

  function initAutoTriggers() {
    if (!canAutoOpen()) return;

    // Tijd op pagina
    var timer = setTimeout(function () {
      if (canAutoOpen()) open('time');
    }, CFG.triggers.timeSeconds * 1000);

    // Scrolldiepte
    var scrollHandler = function () {
      if (!canAutoOpen()) { window.removeEventListener('scroll', scrollHandler); return; }
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      var pct = (window.scrollY / scrollable) * 100;
      if (pct >= CFG.triggers.scrollPercent) {
        window.removeEventListener('scroll', scrollHandler);
        open('scroll');
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Exit-intent (alleen desktop: fijne pointer + brede viewport)
    var isDesktopPointer = false;
    try {
      isDesktopPointer = !!(window.matchMedia && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches);
    } catch (e) {}
    if (CFG.triggers.exitIntentDesktop && isDesktopPointer) {
      var exitHandler = function (e) {
        if (!canAutoOpen()) { document.removeEventListener('mouseout', exitHandler); return; }
        if (e.clientY <= 0) {
          document.removeEventListener('mouseout', exitHandler);
          open('exit_intent');
        }
      };
      document.addEventListener('mouseout', exitHandler);
    }

    // Opruimen als de widget al geopend is via een andere trigger
    var stopIfOpened = setInterval(function () {
      if (state.open || !canAutoOpen()) {
        clearTimeout(timer);
        clearInterval(stopIfOpened);
      }
    }, 1000);
  }

  /* -----------------------------------------------------------
     INIT
     ----------------------------------------------------------- */
  function init() {
    if (CFG.enabled === false) return; // volledig uitgeschakeld, niets wordt gerenderd of getrackt
    storage.prunePendingPersonal();     // ruim verlopen persoonsgegevens (>30 min) direct op
    buildSkeleton();
    initAutoTriggers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
