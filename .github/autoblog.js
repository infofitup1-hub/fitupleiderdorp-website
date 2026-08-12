#!/usr/bin/env node
/**
 * AutoBlog — Fit Up Leiderdorp
 * Schrijft automatisch elke week een nieuw SEO-blogartikel via Claude AI.
 * Wordt aangeroepen vanuit autoseo.js na de wekelijkse scan.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GITHUB_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const REPO = process.env.GITHUB_REPOSITORY || "infofitup1-hub/fitupleiderdorp-website";
const [OWNER, REPO_NAME] = REPO.split("/");
const DRY_RUN = process.env.DRY_RUN === "true";

// Blog onderwerpen — roterende wachtrij, elk onderwerp 1x per kwartaal
const BLOG_TOPICS = [
  {
    slug: "afvallen-tijdens-overgang",
    title_focus: "Afvallen tijdens de overgang",
    keyword: "afvallen tijdens overgang",
    volume: 800,
    persona: "vrouwen 45-55",
    dienst: "personal training en voedingscoaching",
    internal_links: ["/afvallen-leiderdorp/", "/online-coaching/", "/trainingsaanbod/personal-training/"]
  },
  {
    slug: "krachttraining-vrouwen-40-plus",
    title_focus: "Krachttraining voor vrouwen boven de 40",
    keyword: "krachttraining vrouwen 40",
    volume: 600,
    persona: "vrouwen 40-55",
    dienst: "Small Group Personal Training en personal training",
    internal_links: ["/vrouwen-fitness-leiderdorp/", "/trainingsaanbod/sgpt-small-group-personal-training/", "/gratis-intake/"]
  },
  {
    slug: "kosten-personal-trainer",
    title_focus: "Wat kost een personal trainer?",
    keyword: "kosten personal trainer",
    volume: 1200,
    persona: "mensen die overwegen te starten",
    dienst: "personal training en Small Group PT",
    internal_links: ["/tarieven/", "/trainingsaanbod/personal-training/", "/gratis-intake/"]
  },
  {
    slug: "hyrox-voorbereiding-schema",
    title_focus: "Hyrox voorbereiding: 12-weken schema",
    keyword: "hyrox training schema",
    volume: 400,
    persona: "sporters die Hyrox willen doen",
    dienst: "Hyrox training en personal coaching",
    internal_links: ["/hyrox-training-leiderdorp/", "/trainingsaanbod/sgpt-small-group-personal-training/", "/gratis-intake/"]
  },
  {
    slug: "spieropbouw-na-40",
    title_focus: "Spieropbouw na je 40e: wat werkt echt?",
    keyword: "spieropbouw na 40",
    volume: 700,
    persona: "mannen en vrouwen 40-55",
    dienst: "personal training en krachttraining",
    internal_links: ["/spiermassa-opbouwen-leiderdorp/", "/trainingsaanbod/personal-training/", "/gratis-intake/"]
  },
  {
    slug: "beginnen-met-sporten-na-40",
    title_focus: "Beginnen met sporten na je 40e: zo doe je het goed",
    keyword: "beginnen met sporten na 40",
    volume: 900,
    persona: "mensen die lang niet gesport hebben",
    dienst: "24/7 fitness en personal training",
    internal_links: ["/fitness-40-plus-leiderdorp/", "/gratis-intake/"]
  },
  {
    slug: "voeding-spiermassa",
    title_focus: "Voeding voor spieropbouw: complete gids",
    keyword: "voeding spieropbouw",
    volume: 2200,
    persona: "sporters die willen groeien",
    dienst: "voedingscoaching en personal training",
    internal_links: ["/online-coaching/", "/trainingsaanbod/personal-training/", "/gratis-intake/"]
  },
  {
    slug: "verschil-personal-trainer-sportschool",
    title_focus: "Personal trainer vs. sportschool: wat past bij jou?",
    keyword: "personal trainer vs sportschool",
    volume: 500,
    persona: "mensen die twijfelen",
    dienst: "personal training en 24/7 fitness",
    internal_links: ["/personal-trainer-leiderdorp/", "/trainingsaanbod/24-7-fitness/", "/gratis-intake/"]
  },
];

// HTTP helpers
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function ghReq(method, path, body = null) {
  return request({
    hostname: "api.github.com", path, method,
    headers: { Authorization: `token ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "AutoBlog/1.0", Accept: "application/vnd.github.v3+json" }
  }, body);
}

async function fileExists(path) {
  const r = await ghReq("GET", `/repos/${OWNER}/${REPO_NAME}/contents/${path}`);
  return r.status === 200;
}

async function putFile(path, content, sha, message) {
  if (DRY_RUN) { console.log(`[DRY RUN] Would create: ${path}`); return true; }
  const body = { message, content: Buffer.from(content).toString("base64") };
  if (sha) body.sha = sha;
  const r = await ghReq("PUT", `/repos/${OWNER}/${REPO_NAME}/contents/${path}`, body);
  return r.status === 200 || r.status === 201;
}

async function getFile(path) {
  const r = await ghReq("GET", `/repos/${OWNER}/${REPO_NAME}/contents/${path}`);
  if (r.status !== 200) return null;
  const content = Buffer.from(r.body.content.replace(/\n/g, ""), "base64").toString("utf-8");
  return { sha: r.body.sha, content };
}

async function claudeWrite(prompt) {
  if (!ANTHROPIC_KEY) throw new Error("Geen ANTHROPIC_API_KEY");
  const r = await request({
    hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
  }, {
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }]
  });
  if (!r.body?.content?.[0]?.text) throw new Error("Geen response van Claude");
  return r.body.content[0].text;
}

// Bepaal welk topic deze week aan de beurt is
function getThisWeeksTopic() {
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return BLOG_TOPICS[weekNumber % BLOG_TOPICS.length];
}

// Bouw de HTML pagina op basis van AI-content
function buildBlogPage(topic, aiContent, nav, footer) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const isoDate = now.toISOString().split("T")[0];

  // Parse AI output
  const lines = aiContent.split("\n");
  let seoTitle = "", metaDesc = "", h1 = "", intro = "", sections = [], faqItems = [];
  let currentSection = null, inFaq = false;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("SEO_TITLE:")) seoTitle = t.replace("SEO_TITLE:", "").trim();
    else if (t.startsWith("META_DESC:")) metaDesc = t.replace("META_DESC:", "").trim();
    else if (t.startsWith("H1:")) h1 = t.replace("H1:", "").trim();
    else if (t.startsWith("INTRO:")) intro = t.replace("INTRO:", "").trim();
    else if (t.startsWith("H2:")) {
      if (currentSection) sections.push(currentSection);
      currentSection = { h2: t.replace("H2:", "").trim(), body: "" };
      inFaq = false;
    } else if (t.startsWith("FAQ_START")) { inFaq = true; if (currentSection) { sections.push(currentSection); currentSection = null; } }
    else if (t.startsWith("Q:") && inFaq) faqItems.push({ q: t.replace("Q:", "").trim(), a: "" });
    else if (t.startsWith("A:") && inFaq && faqItems.length > 0) faqItems[faqItems.length - 1].a = t.replace("A:", "").trim();
    else if (currentSection && t && !t.startsWith("FAQ_END")) currentSection.body += t + " ";
  }
  if (currentSection) sections.push(currentSection);

  // Fallbacks
  if (!seoTitle) seoTitle = `${topic.title_focus} | Fit Up Leiderdorp`;
  if (!metaDesc) metaDesc = `${topic.title_focus} — lees alles in deze complete gids van Fit Up Leiderdorp. Persoonlijk advies? Plan een gratis intake.`;
  if (!h1) h1 = topic.title_focus;
  if (!intro) intro = `Alles wat je moet weten over ${topic.title_focus.toLowerCase()}.`;

  const sectionsHtml = sections.map(s => `
    <section style="margin-bottom:48px;">
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:#fff;margin-bottom:16px;text-transform:uppercase;">${s.h2}</h2>
      <p style="color:rgba(255,255,255,0.7);line-height:1.8;font-size:15px;">${s.body.trim()}</p>
    </section>`).join("\n");

  const faqHtml = faqItems.map(f => `
    <details style="background:#1a1a1a;padding:20px 24px;margin-bottom:2px;">
      <summary style="font-weight:700;font-size:15px;cursor:pointer;color:#fff;list-style:none;">${f.q}</summary>
      <p style="color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.7;font-size:14px;">${f.a}</p>
    </details>`).join("\n");

  const faqSchema = faqItems.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }))
  }, null, 2) : "{}";

  const internalLinksHtml = topic.internal_links.map(l => {
    const label = l.replace(/\//g, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Lees meer";
    return `<a href="${l}" style="background:#1a1a1a;color:#fff;border:1px solid rgba(255,255,255,0.1);padding:10px 18px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">${l.replace(/\//g,"").replace(/-/g," ")} →</a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seoTitle.slice(0,60)}</title>
  <meta name="description" content="${metaDesc.slice(0,160)}">
  <link rel="canonical" href="https://fitupleiderdorp.nl/${topic.slug}/">
  <meta property="og:title" content="${seoTitle.slice(0,60)}">
  <meta property="og:description" content="${metaDesc.slice(0,160)}">
  <meta property="og:url" content="https://fitupleiderdorp.nl/${topic.slug}/">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Fit Up Leiderdorp">
  <meta property="og:locale" content="nl_NL">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${seoTitle.slice(0,60)}">
  <meta name="twitter:description" content="${metaDesc.slice(0,160)}">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${h1}",
    "description": "${metaDesc.slice(0,160)}",
    "datePublished": "${isoDate}",
    "dateModified": "${isoDate}",
    "author": {"@type": "Organization", "name": "Fit Up Leiderdorp"},
    "publisher": {
      "@type": "Organization",
      "name": "Fit Up Leiderdorp",
      "url": "https://fitupleiderdorp.nl/",
      "logo": {"@type": "ImageObject", "url": "https://fitupleiderdorp.nl/assets/images/logo.svg"}
    },
    "url": "https://fitupleiderdorp.nl/${topic.slug}/"
  }
  </script>
  <script type="application/ld+json">
  ${faqSchema}
  </script>
</head>
<body>
${nav}
<main>
  <section style="background:#0c0c0c;padding:100px 0 60px;text-align:center;">
    <div style="max-width:800px;margin:0 auto;padding:0 24px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#d4ff00;margin-bottom:16px;">Fit Up Leiderdorp · ${dateStr}</div>
      <h1 style="font-family:'Barlow Condensed',sans-serif;font-size:clamp(40px,7vw,72px);font-weight:900;color:#fff;line-height:1;margin-bottom:24px;text-transform:uppercase;">${h1}</h1>
      <p style="font-size:18px;color:rgba(255,255,255,0.7);max-width:600px;margin:0 auto;line-height:1.7;">${intro}</p>
    </div>
  </section>

  <div style="background:#d4ff00;padding:12px 0;text-align:center;">
    <a href="https://share.google/LzpqWN4mAFxA6ZDuG" target="_blank" rel="noopener"
       style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:#000;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;text-transform:uppercase;">
      <span>★★★★★</span><span>4,9 · 55 Google Reviews — Fit Up Leiderdorp</span>
    </a>
  </div>

  <article style="max-width:800px;margin:0 auto;padding:64px 24px;">
    ${sectionsHtml}
    ${faqItems.length > 0 ? `
    <section style="margin-top:64px;">
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;color:#fff;margin-bottom:24px;text-transform:uppercase;">Veelgestelde vragen</h2>
      ${faqHtml}
    </section>` : ""}
  </article>

  <section style="background:#d4ff00;padding:80px 0;text-align:center;">
    <div style="max-width:700px;margin:0 auto;padding:0 24px;">
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:44px;font-weight:900;color:#000;margin-bottom:16px;text-transform:uppercase;">Klaar om te starten?</h2>
      <p style="color:rgba(0,0,0,0.7);font-size:16px;margin-bottom:32px;line-height:1.7;">Plan een gratis intake bij Fit Up Leiderdorp. Geen verplichtingen — wel eerlijk advies over wat bij jouw doel past.</p>
      <a href="/gratis-intake/" style="background:#000;color:#d4ff00;padding:18px 40px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:16px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;display:inline-block;">Plan gratis intake →</a>
    </div>
  </section>

  <section style="background:#111;padding:48px 0;text-align:center;">
    <div style="max-width:800px;margin:0 auto;padding:0 24px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#d4ff00;margin-bottom:16px;">Lees ook</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${internalLinksHtml}
      </div>
    </div>
  </section>
</main>
${footer}
</body>
</html>`;
}

// Main blog writer
async function writeBlog() {
  if (!ANTHROPIC_KEY) {
    console.log("⚠️  Geen ANTHROPIC_API_KEY — blog overgeslagen");
    return null;
  }

  const topic = getThisWeeksTopic();
  const targetPath = `${topic.slug}/index.html`;

  console.log(`\n✍️  AutoBlog — onderwerp: "${topic.title_focus}"`);
  console.log(`   Keyword: ${topic.keyword} (${topic.volume} zoekopdrachten/mnd)`);
  console.log(`   Doelgroep: ${topic.persona}`);

  // Check of pagina al bestaat
  const existing = await getFile(targetPath);
  if (existing) {
    console.log(`   Pagina bestaat al — overslaan (wordt volgende kwartaal herschreven)`);
    return null;
  }

  // Haal nav/footer op van bestaande pagina
  const ref = await getFile("sportschool-leiderdorp/index.html");
  if (!ref) { console.log("❌ Kon template niet laden"); return null; }

  const navMatch = ref.content.match(/<nav[\s\S]*?<\/nav>/);
  const footerMatch = ref.content.match(/<footer[\s\S]*?<\/footer>/);
  const nav = navMatch ? navMatch[0] : "";
  const footer = footerMatch ? footerMatch[0] : "";

  // AI schrijft de content
  console.log("   🤖 Claude schrijft artikel...");
  const prompt = `Je bent content schrijver voor Fit Up Leiderdorp (sportschool, personal training, Leiderdorp). 
Schrijf een volledig SEO-blogartikel over: "${topic.title_focus}"
Primair keyword: "${topic.keyword}"
Doelgroep: ${topic.persona}
Relevante dienst: ${topic.dienst}

Tone of voice: persoonlijk, motiverend, geen overdreven claims, kort en krachtig, Nederlands.
Geen em-dashes, geen emoji in tekst.

Geef EXACT dit formaat terug (geen andere tekst):

SEO_TITLE: [max 60 tekens, bevat keyword]
META_DESC: [max 155 tekens, bevat keyword + CTA]
H1: [pakkende h1 met keyword, max 70 tekens]
INTRO: [2-3 zinnen intro, persoonlijk en herkenbaar voor doelgroep]
H2: [sectie 1 titel]
[2-3 zinnen inhoud sectie 1]
H2: [sectie 2 titel]
[2-3 zinnen inhoud sectie 2]
H2: [sectie 3 titel]
[2-3 zinnen inhoud sectie 3]
H2: [sectie 4 titel]
[2-3 zinnen inhoud sectie 4]
FAQ_START
Q: [vraag 1]
A: [antwoord 1, max 2 zinnen]
Q: [vraag 2]
A: [antwoord 2]
Q: [vraag 3]
A: [antwoord 3]
Q: [vraag 4]
A: [antwoord 4]
FAQ_END`;

  const aiContent = await claudeWrite(prompt);
  console.log("   ✅ Artikel geschreven");

  // Bouw HTML pagina
  const html = buildBlogPage(topic, aiContent, nav, footer);

  // Push naar GitHub
  const success = await putFile(targetPath, html, null, `AutoBlog: nieuw artikel "${topic.title_focus}" — ${new Date().toISOString().split("T")[0]}`);

  if (success) {
    console.log(`   ✅ Gepubliceerd: https://fitupleiderdorp.nl/${topic.slug}/`);

    // Update sitemap
    const sitemapData = await getFile("sitemap.xml");
    if (sitemapData && !sitemapData.content.includes(topic.slug)) {
      const newUrl = `\n  <url><loc>https://fitupleiderdorp.nl/${topic.slug}/</loc><lastmod>${new Date().toISOString().split("T")[0]}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`;
      const updatedSitemap = sitemapData.content.replace("</urlset>", newUrl + "\n</urlset>");
      await putFile("sitemap.xml", updatedSitemap, sitemapData.sha, `AutoBlog: ${topic.slug} toegevoegd aan sitemap`);
      console.log("   ✅ Sitemap bijgewerkt");
    }

    return { topic, url: `https://fitupleiderdorp.nl/${topic.slug}/` };
  }

  return null;
}

module.exports = { writeBlog };

if (require.main === module) {
  writeBlog().then(result => {
    if (result) console.log(`\nKlaar! Artikel live: ${result.url}`);
    else console.log("\nGeen nieuw artikel deze run.");
  }).catch(e => { console.error("Fatal:", e); process.exit(1); });
}
