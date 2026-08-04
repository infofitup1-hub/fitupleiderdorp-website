/* =============================================================
   FIT UP LEIDERDORP — Conversielaag configuratie
   Alle teksten, routes, links en instellingen staan hier.
   Wijzig hier — niet in conversion-layer.js — om vragen,
   aanbevelingen of gedrag aan te passen.
   ============================================================= */
window.FU_CL_CONFIG = {

  /* Zet op false om de volledige conversielaag uit te schakelen
     zonder de script-tags uit index.html te verwijderen.
     Er wordt dan niets gerenderd, niets getriggerd en niets getrackt. */
  enabled: false, // UITGESCHAKELD op verzoek Patrick - popup bleef leeg hangen 2026-08-03

  /* Webhook waar leads naartoe gestuurd worden.
     Nog niet ingesteld -> laat leeg. Zodra er een Make-scenario
     klaarstaat, plaats de webhook-URL hier. Zolang dit leeg is,
     wordt de lead lokaal bewaard (localStorage) en krijgt de
     bezoeker een nette foutmelding i.p.v. een stille mislukking. */
  webhookUrl: 'https://hook.eu1.make.com/qw741ixpqwexef7vdaqrglxodnspbrzu',

  /* Bestaand officieel Fit Up WhatsApp-nummer (uit de site zelf) */
  whatsappNumber: '31648776322',

  privacyUrl: '/privacybeleid/',

  links: {
    trainingsaanbod: 'trainingsaanbod/index.html',
    fitness247: 'trainingsaanbod/24-7-fitness/index.html',
    personalTraining: 'trainingsaanbod/personal-training/index.html',
    sgpt: 'trainingsaanbod/sgpt-small-group-personal-training/index.html',
    onlineCoaching: 'online-coaching/index.html',
    gratisIntake: 'gratis-intake/index.html'
  },

  /* Wanneer de automatische uitnodiging mag verschijnen */
  triggers: {
    timeSeconds: 0,
    scrollPercent: 45,
    exitIntentDesktop: true
  },

  /* Gedragsregels opslag */
  storage: {
    sessionShownKey: 'fu_cl_shown_session',   // max 1x per sessie (sessionStorage)
    dismissedAtKey: 'fu_cl_dismissed_at',     // 7-dagen cooldown (localStorage)
    convertedKey: 'fu_cl_converted',          // nooit meer automatisch na succes (localStorage)
    pendingPersonalKey: 'fu_cl_pending_personal', // tijdelijk, sessionStorage, PII, TTL 30 min
    pendingMetaKey: 'fu_cl_pending_meta',         // niet-persoonlijk, mag langer bewaard blijven (localStorage)
    cooldownDays: 7,
    pendingPersonalTtlMinutes: 30
  },

  /* Spambeveiliging. Dezelfde regels moeten server-side (Make) worden
     herhaald zodra de webhook actief is — vertrouw de browser nooit blind. */
  antiSpam: {
    honeypotFieldName: 'website',   // verborgen veld; ingevuld = betrouwbaar spamsignaal, wordt direct geblokkeerd
    minFillSeconds: 3,              // sneller dan dit = signaal "fast_submission" (GEEN harde blokkade; kan door autofill komen, dus altijd naar de webhook sturen en de server laten beslissen)
    maxLengths: { naam: 60, tel: 20, email: 100 },
    patterns: {
      naam: '^[\\p{L}\\s\'-]{2,60}$',
      tel: '^(?=(?:.*[0-9]){9,})[0-9+\\-\\s()]{6,20}$',
      email: '^[^\\s@]{1,64}@[^\\s@]{1,190}\\.[^\\s@]{2,24}$'
    }
  },

  /* STAP 1 — hoofdvraag */
  mainQuestion: {
    title: 'Waar kunnen we jou het beste bij helpen?',
    subtitle: 'Beantwoord een paar korte vragen en ontdek welke manier van trainen het beste bij jouw doel past.',
    options: [
      {
        id: 'zelfstandig',
        label: 'Zelfstandig 24/7 fitnessen',
        desc: 'Trainen wanneer het jou uitkomt'
      },
      {
        id: 'afvallen',
        label: 'Afvallen en fitter worden',
        desc: 'Een duidelijk plan en begeleiding'
      },
      {
        id: 'persoonlijk',
        label: 'Persoonlijke begeleiding',
        desc: 'Eén-op-één met een vaste coach'
      },
      {
        id: 'kleinegroep',
        label: 'Trainen in een kleine groep',
        desc: 'Samen trainen, max. 4 personen'
      },
      {
        id: 'kennismaken',
        label: 'Eerst vrijblijvend kennismaken',
        desc: 'Rondleiding en een goed gesprek'
      }
    ]
  },

  /* Vervolgvragen — per route maximaal 2, sommige routes minder */
  followUpQuestions: {
    begeleiding: {
      question: 'Hoeveel begeleiding zoek je?',
      options: [
        { id: 'zelfstandig', label: 'Ik train graag zelfstandig' },
        { id: 'af-en-toe', label: 'Af en toe ondersteuning' },
        { id: 'veel', label: 'Veel persoonlijke begeleiding' }
      ]
    },
    start: {
      question: 'Wanneer zou je willen starten?',
      options: [
        { id: 'zsm', label: 'Zo snel mogelijk' },
        { id: '2weken', label: 'Binnen twee weken' },
        { id: '1-2maanden', label: 'Binnen één tot twee maanden' },
        { id: 'orienteren', label: 'Ik oriënteer mij eerst' }
      ]
    }
  },

  /* Routinglogica: welke vervolgvragen per hoofdkeuze, en de aanbeveling */
  routes: {
    zelfstandig: {
      followUps: ['start'],
      recommendation: {
        title: '24/7 Fitness',
        message: 'Train zelfstandig wanneer het jou uitkomt, in een kleinschalige sportschool met persoonlijke aandacht wanneer je die nodig hebt.',
        benefit: 'Altijd toegang, geen wachtrijen, geen contractverplichting.',
        link: 'fitness247'
      }
    },
    afvallen: {
      followUps: ['begeleiding', 'start'],
      /* Aanbeveling hangt af van het antwoord op "begeleiding".
         Personal Training wordt via deze route nooit meer geadviseerd:
         PT is voorbehouden aan de route "persoonlijk" (expliciete 1-op-1 keuze). */
      recommendationByAnswer: {
        zelfstandig: {
          title: '24/7 Fitness + Voedingscoaching',
          message: 'Je traint zelfstandig wanneer het jou uitkomt, met een duidelijk voedingsplan erbij zodat resultaat niet afhangt van toeval.',
          benefit: 'Altijd toegang tot de club, gecombineerd met persoonlijke voedingsbegeleiding via de app.',
          link: 'fitness247'
        },
        'af-en-toe': {
          title: 'Small Group Personal Training',
          message: 'Je krijgt een duidelijke aanpak, persoonlijke bijsturing en een plan dat past bij jouw niveau en dagelijkse leven.',
          benefit: 'Persoonlijke begeleiding in een kleine groep, voeding inbegrepen.',
          link: 'sgpt'
        },
        veel: {
          title: 'Small Group Personal Training + Coaching',
          message: 'Je krijgt intensieve begeleiding: training in een kleine groep, aangevuld met persoonlijke voedings- en leefstijlcoaching.',
          benefit: 'Maximale begeleiding zonder de prijs van volledige 1-op-1 personal training.',
          link: 'sgpt'
        }
      }
    },
    persoonlijk: {
      followUps: ['start'],
      recommendation: {
        title: 'Personal Training',
        message: 'Werk één-op-één met een coach aan een persoonlijk trainingsplan, techniek en meetbare vooruitgang.',
        benefit: 'Volledig op maat, inclusief voedingsbegeleiding.',
        link: 'personalTraining'
      }
    },
    kleinegroep: {
      followUps: ['start'],
      recommendation: {
        title: 'Small Group Personal Training',
        message: 'Train met maximaal enkele deelnemers en ontvang veel persoonlijke begeleiding voor een lager tarief dan volledige personal training.',
        benefit: 'Max. 4 personen per groep, vaste coach, voeding inbegrepen.',
        link: 'sgpt'
      }
    },
    kennismaken: {
      followUps: [],
      recommendation: {
        title: 'Vrijblijvende kennismaking',
        message: 'Bekijk de club, bespreek jouw doel en bepaal daarna rustig welke optie het beste bij je past.',
        benefit: 'Geen verplichtingen, gewoon een goed gesprek en een rondleiding.',
        link: 'gratisIntake'
      }
    }
  },

  contactForm: {
    submitLabel: 'Laat Patrick contact opnemen',
    submitNote: 'Vrijblijvend. We nemen persoonlijk contact met je op om te bespreken wat het beste bij jou past.'
  }
};
