#!/usr/bin/env node
/**
 * AutoSEO Agent v3 — Fit Up Leiderdorp
 * Volledig autonome SEO agent: scant, analyseert, fixt, rapporteert en mailt.
 * Draait elke maandag 08:00 via GitHub Actions.
 */

const https = require("https");

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || "infofitup1-hub/fitupleiderdorp-website";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const BREVO_KEY = process.env.BREVO_API_KEY || "";
const REPORT_EMAIL = process.env.REPORT_EMAIL || "info.fitup1@gmail.com";
const [OWNER, REPO_NAME] = REPO.split("/");
const ISSUE_NUMBER = parseInt(process.env.SEO_ISSUE_NUMBER || "1");
const DRY_RUN = process.env.DRY_RUN === "true";

const ALL_PAGES = [
  "index.html","afvallen-leiderdorp/index.html","calorie-calculator/index.html",
  "contact/index.html","fitness-40-plus-leiderdorp/index.html",
  "fitness-voor-beginners-leiderdorp/index.html","fitnessclub-leiderdorp/index.html",
  "gratis-intake/index.html","hyrox-training-leiderdorp/index.html",
  "krachttraining-leiderdorp/index.html","online-coaching/index.html",
  "personal-trainer-leiden/index.html",
  "personal-trainer-oegstgeest/index.html","personal-trainer-voorschoten/index.html",
  "personal-training-leiderdorp/index.html","small-group-personal-training-leiderdorp/index.html",
  "spiermassa-opbouwen-leiderdorp/index.html","sportschool-leiderdorp/index.html",
  "tarieven/index.html","trainingsaanbod/24-7-fitness/index.html",
  "trainingsaanbod/groepslessen/index.html","trainingsaanbod/index.html",
  "trainingsaanbod/personal-training/index.html",
  "trainingsaanbod/sgpt-small-group-personal-training/index.html",
  "voedingscoach-leiderdorp/index.html","vrouwen-fitness-leiderdorp/index.html",
];

const COMPETITORS = [
  { name: "Fit For Free Leiden", url: "fitforfree.nl", dist: "4km" },
  { name: "Basic-Fit Leiden", url: "basic-fit.com", dist: "5km" },
  { name: "Vytal Health", url: "vytalhealth.nl", dist: "3km" },
  { name: "CrossFit Leiden", url: "crossfitleiden.nl", dist: "6km" },
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
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
    headers: { Authorization: `token ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "AutoSEO/3.0", Accept: "application/vnd.github.v3+json" }
  }, body);
}

async function getFile(path) {
  const r = await ghReq("GET", `/repos/${OWNER}/${REPO_NAME}/contents/${path}`);
  if (r.status !== 200) throw new Error(`GET ${path}: ${r.status}`);
  const content = Buffer.from(r.body.content.replace(/\n/g, ""), "base64").toString("utf-8");
  return { sha: r.body.sha, content };
}

async function putFile(path, content, sha, message) {
  if (DRY_RUN) { console.log(`[DRY RUN] ${path}`); return; }
  const r = await ghReq("PUT", `/repos/${OWNER}/${REPO_NAME}/contents/${path}`, {
    message, content: Buffer.from(content).toString("base64"), sha
  });
  if (r.status !== 200 && r.status !== 201) throw new Error(`PUT ${path}: ${r.status}`);
}

async function postComment(body) {
  const r = await ghReq("POST", `/repos/${OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, { body });
  if (r.status === 201) console.log(`✅ Rapport gepost: ${r.body.html_url}`);
  else console.log(`❌ Posten mislukt: ${r.status}`);
  return r;
}

async function fetchUrl(hostname, path) {
  return new Promise((resolve) => {
    const req = https.request({ hostname, path, method: "GET", headers: { "User-Agent": "AutoSEO/3.0" }, timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: "" }); });
    req.end();
  });
}

async function claudeChat(prompt) {
  if (!ANTHROPIC_KEY) return null;
  const r = await request({
    hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
  }, { model: "claude-sonnet-4-20250514", max_tokens: 600, messages: [{ role: "user", content: prompt }] });
  return r.body?.content?.[0]?.text || null;
}

// ── Brevo email ───────────────────────────────────────────────────────────────
function markdownToHtml(md) {
  // Lightweight markdown → HTML voor email
  let html = md;
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-family:Arial,sans-serif;color:#111;border-bottom:2px solid #d4ff00;padding-bottom:8px;">$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-family:Arial,sans-serif;color:#111;margin-top:24px;">$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:13px;">$1</code>');
  // Tabels
  const lines = html.split("\n");
  let out = []; let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("|")) {
      if (!inTable) { out.push('<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;margin:12px 0;">'); inTable = true; }
      if (/^\|[\s-:|]+\|$/.test(line.trim())) continue; // skip separator row
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      const isHeader = i > 0 && /^\|[\s-:|]+\|$/.test((lines[i+1]||"").trim());
      const tag = isHeader ? "th" : "td";
      const style = isHeader ? "background:#111;color:#d4ff00;padding:8px 10px;text-align:left;" : "padding:8px 10px;border-bottom:1px solid #eee;";
      out.push("<tr>" + cells.map(c => `<${tag} style="${style}">${c}</${tag}>`).join("") + "</tr>");
    } else {
      if (inTable) { out.push("</table>"); inTable = false; }
      out.push(line);
    }
  }
  if (inTable) out.push("</table>");
  html = out.join("\n");
  // Lijsten
  html = html.replace(/^- (.+)$/gm, '<li style="margin-bottom:4px;">$1</li>');
  html = html.replace(/(<li.*<\/li>\n?)+/g, m => `<ul style="font-family:Arial,sans-serif;font-size:14px;color:#333;">${m}</ul>`);
  // Paragrafen
  html = html.split("\n\n").map(p => {
    if (p.startsWith("<")) return p;
    if (p.trim() === "" || p.trim() === "---") return "";
    return `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">${p}</p>`;
  }).join("\n");
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">');
  return html;
}

async function sendEmailReport(subject, markdownBody) {
  if (!BREVO_KEY) { console.log("⚠️  Geen BREVO_API_KEY — email overgeslagen"); return; }
  const htmlBody = `
    <div style="max-width:680px;margin:0 auto;font-family:Arial,sans-serif;">
      <div style="background:#0c0c0c;padding:24px;text-align:center;">
        <span style="font-family:Arial,sans-serif;font-size:24px;font-weight:900;letter-spacing:4px;color:#fff;">FIT<span style="color:#d4ff00;">UP</span></span>
        <div style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">AutoSEO Weekrapport</div>
      </div>
      <div style="padding:24px;background:#fff;">
        ${markdownToHtml(markdownBody)}
      </div>
      <div style="background:#f5f5f5;padding:16px;text-align:center;font-family:Arial,sans-serif;font-size:11px;color:#999;">
        🤖 Automatisch gegenereerd door AutoSEO Agent · Fit Up Leiderdorp<br>
        <a href="https://github.com/${OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}" style="color:#999;">Bekijk volledig rapport op GitHub</a>
      </div>
    </div>`;

  const payload = {
    sender: { name: "AutoSEO — Fit Up Leiderdorp", email: "info.fitup1@gmail.com" },
    to: [{ email: REPORT_EMAIL }],
    subject,
    htmlContent: htmlBody
  };

  if (DRY_RUN) { console.log("[DRY RUN] Zou e-mail versturen naar", REPORT_EMAIL); return; }

  const r = await request({
    hostname: "api.brevo.com", path: "/v3/smtp/email", method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", "Accept": "application/json" }
  }, payload);

  if (r.status === 201) console.log(`✅ E-mail verstuurd naar ${REPORT_EMAIL}`);
  else console.log(`❌ E-mail mislukt (${r.status}):`, JSON.stringify(r.body).slice(0, 200));
}

// ── SEO analyse ───────────────────────────────────────────────────────────────
function ext(html, re) { const m = html.match(re); return m ? m[1].trim() : ""; }
function noTags(s) { return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

function analyzeHTML(path, html) {
  const title = ext(html, /<title>([^<]+)<\/title>/);
  const desc = ext(html, /name="description"\s+content="([^"]+)"/);
  const canonical = ext(html, /rel="canonical"\s+href="([^"]+)"/);
  const h1raw = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1 = h1raw ? noTags(h1raw[1]) : "";
  const schemaCount = (html.match(/application\/ld\+json/g) || []).length;
  const ogTitle = ext(html, /property="og:title"\s+content="([^"]+)"/);
  const imgsMissingAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;

  const issues = [];
  if (!title) issues.push({ type: "NO_TITLE", sev: "critical", label: "Geen title tag", autofix: false });
  else if (title.length > 60) issues.push({ type: "TITLE_LONG", sev: "warning", label: `Title te lang (${title.length} tekens)`, autofix: true });
  else if (title.length < 30) issues.push({ type: "TITLE_SHORT", sev: "info", label: `Title te kort (${title.length} tekens)`, autofix: false });
  if (!desc) issues.push({ type: "NO_DESC", sev: "critical", label: "Geen meta description", autofix: false });
  else if (desc.length > 160) issues.push({ type: "DESC_LONG", sev: "warning", label: `Description te lang (${desc.length} tekens)`, autofix: false });
  else if (desc.length < 100) issues.push({ type: "DESC_SHORT", sev: "info", label: `Description kort (${desc.length} tekens)`, autofix: false });
  if (!canonical) issues.push({ type: "NO_CANONICAL", sev: "critical", label: "Geen canonical tag", autofix: false });
  if (!h1) issues.push({ type: "NO_H1", sev: "critical", label: "Geen H1 tag", autofix: false });
  if (schemaCount === 0) issues.push({ type: "NO_SCHEMA", sev: "critical", label: "Geen schema.org", autofix: false });
  else if (schemaCount === 1) issues.push({ type: "SCHEMA_MIN", sev: "info", label: "Slechts 1 schema block", autofix: false });
  if (!ogTitle) issues.push({ type: "NO_OG", sev: "warning", label: "Geen og:title", autofix: false });
  if (imgsMissingAlt > 0) issues.push({ type: "IMG_ALT", sev: "warning", label: `${imgsMissingAlt}× afbeelding zonder alt`, autofix: false });

  const score = Math.max(0, 100 - issues.reduce((s, i) => s + (i.sev === "critical" ? 20 : i.sev === "warning" ? 8 : 2), 0));
  return { path, title, desc, canonical, h1, schemaCount, ogTitle, issues, score };
}

function fixTitleLength(html, title) {
  const parts = title.split("|");
  let nt = title;
  if (parts.length >= 2) {
    const l = parts[0].trim(); let r = parts.slice(1).join("|").trim();
    while ((l + " | " + r).length > 60 && r.includes(" ")) r = r.split(" ").slice(0, -1).join(" ");
    nt = `${l} | ${r}`; if (nt.length > 60) nt = l.slice(0, 57) + "...";
  } else nt = title.slice(0, 57) + "...";
  let u = html.replace(/<title>[^<]+<\/title>/, `<title>${nt}</title>`);
  u = u.replace(/property="og:title"\s+content="[^"]+"/, `property="og:title" content="${nt}"`);
  u = u.replace(/name="twitter:title"\s+content="[^"]+"/, `name="twitter:title" content="${nt}"`);
  return { html: u, newTitle: nt };
}

// ── Concurrent check ──────────────────────────────────────────────────────────
async function checkCompetitor(comp) {
  console.log(`  Checking ${comp.url}...`);
  const res = await fetchUrl(comp.url, "/");
  if (res.status === 0) return { ...comp, online: false };
  const html = res.body;
  const title = ext(html, /<title>([^<]+)<\/title>/);
  const hasSchema = html.includes("application/ld+json");
  return { ...comp, online: true, title: title.slice(0, 60), hasSchema };
}

// ── Content gaps detecteren ─────────────────────────────────────────────────
function detectContentGaps(results) {
  const existingPages = results.map(r => r.path.replace("/index.html", "").replace("index.html", "homepage"));
  const gaps = [];
  const wanted = [
    { slug: "sportschool-zoeterwoude", label: "Sportschool Zoeterwoude" },
    { slug: "personal-trainer-alphen-aan-den-rijn", label: "Personal Trainer Alphen a/d Rijn" },
    { slug: "afvallen-na-40", label: "Afvallen na je 40e (blog)" },
    { slug: "afvallen-tijdens-overgang", label: "Afvallen tijdens overgang (blog)" },
    { slug: "krachttraining-vrouwen-40-plus", label: "Krachttraining vrouwen 40+ (blog)" },
    { slug: "sportschool-alphen-aan-den-rijn", label: "Sportschool Alphen a/d Rijn" },
    { slug: "voedingscoach-leiden", label: "Voedingscoach Leiden" },
    { slug: "hyrox-training-schema", label: "Hyrox training schema 12 weken (blog)" },
    { slug: "kosten-personal-trainer", label: "Wat kost een personal trainer? (blog)" },
  ];
  for (const w of wanted) {
    if (!existingPages.some(p => p.includes(w.slug))) gaps.push(w);
  }
  return gaps;
}


// ── 6. AUTOBLOG — schrijf automatisch een nieuw artikel ─────────────────────
async function runAutoBlog() {
  try {
    console.log("\n✍️  Stap 6: AutoBlog...");
    // Dynamisch inladen om fouten te isoleren
    const { writeBlog } = require(require("path").join(__dirname, "autoblog.js"));
    const result = await writeBlog();
    if (result) {
      return `\n### ✍️ Nieuw blogartikel gepubliceerd\n\n📄 **[${result.topic.title_focus}](${result.url})**\nKeyword: \`${result.topic.keyword}\` · ${result.topic.volume} zoekopdrachten/mnd\n`;
    }
    return "\n### ✍️ AutoBlog\n\nGeen nieuw artikel deze week (onderwerp bestaat al of volgende week).\n";
  } catch(e) {
    console.log("  ⚠️  AutoBlog overgeslagen:", e.message);
    return "";
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  const now = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  console.log(`\n🤖 AutoSEO Agent v3 — ${now}`);
  console.log(`📦 ${REPO} | ${ALL_PAGES.length} pagina's\n`);

  // ── 1. SEO SCAN ─────────────────────────────────────────────────────────────
  console.log("📄 Stap 1: SEO scan alle pagina's...");
  const results = [];
  const fixes = [];
  let fixCount = 0;

  for (const page of ALL_PAGES) {
    process.stdout.write(`  ${page}... `);
    try {
      const { sha, content } = await getFile(page);
      const analysis = analyzeHTML(page, content);
      results.push({ ...analysis, sha, raw: content });

      let html = content;
      let changed = false;
      for (const issue of analysis.issues) {
        if (!issue.autofix) continue;
        if (issue.type === "TITLE_LONG") {
          const { html: fixed, newTitle } = fixTitleLength(html, analysis.title);
          html = fixed; changed = true;
          fixes.push(`- **${page}**: title ${analysis.title.length}→${newTitle.length} tekens`);
        }
      }
      if (changed && !DRY_RUN) {
        await putFile(page, html, sha, `AutoSEO: title fix ${page}`);
        fixCount++;
      }
      const icon = analysis.score >= 80 ? "🟢" : analysis.score >= 60 ? "🟡" : "🔴";
      console.log(`${icon} ${analysis.score}`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      results.push({ path: page, score: 0, issues: [{ sev: "critical", label: e.message }] });
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const critical = results.reduce((s, r) => s + r.issues.filter(i => i.sev === "critical").length, 0);
  const warnings = results.reduce((s, r) => s + r.issues.filter(i => i.sev === "warning").length, 0);

  // ── 2. CONCURRENT CHECK ─────────────────────────────────────────────────────
  console.log("\n🏆 Stap 2: Concurrent check...");
  const competitorData = [];
  for (const comp of COMPETITORS) {
    const data = await checkCompetitor(comp);
    competitorData.push(data);
    await new Promise(r => setTimeout(r, 500));
  }

  // ── 3. CONTENT GAPS ─────────────────────────────────────────────────────────
  console.log("\n📝 Stap 3: Content gaps detecteren...");
  const gaps = detectContentGaps(results);
  console.log(`  ${gaps.length} ontbrekende pagina's gevonden`);

  // ── 4. AI ANALYSE ────────────────────────────────────────────────────────────
  let aiInsights = null;
  if (ANTHROPIC_KEY) {
    console.log("\n🤖 Stap 4: AI analyse...");
    const worstPages = results.sort((a, b) => a.score - b.score).slice(0, 3).map(r => r.path).join(", ");
    const prompt = `Je bent SEO Director voor Fit Up Leiderdorp (sportschool, personal training, Leiderdorp).

Actuele data van deze week:
- Gemiddelde SEO score: ${avgScore}/100 (over ${results.length} pagina's)
- Kritieke issues: ${critical}
- Auto-fixes uitgevoerd: ${fixCount}
- Slechtste pagina's: ${worstPages}
- Ontbrekende content: ${gaps.slice(0,3).map(g=>g.label).join(", ")}

Geef in max 120 woorden:
1. Grootste SEO winst deze week (1 zin)
2. Top 3 concrete acties voor komende 7 dagen
3. Verwachte impact op Google rankings

Direct en actionabel. Geen inleiding.`;
    aiInsights = await claudeChat(prompt);
    if (aiInsights) console.log("  ✅ AI analyse klaar");
  }

  // ── 5b. AUTOBLOG ─────────────────────────────────────────────────────────────
  const blogSection = await runAutoBlog();

  // ── 5. RAPPORT SAMENSTELLEN ─────────────────────────────────────────────────
  console.log("\n📊 Stap 5: Rapport samenstellen...");

  const scoreEmoji = avgScore >= 90 ? "🟢" : avgScore >= 75 ? "🟡" : "🔴";
  const trend = avgScore >= 95 ? "↑ Uitstekend" : avgScore >= 80 ? "↑ Goed" : "→ Aandacht nodig";

  const pageRows = [...results]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map(r => {
      const icon = r.score >= 80 ? "🟢" : r.score >= 60 ? "🟡" : "🔴";
      const name = r.path === "index.html" ? "Homepage" : "/" + r.path.replace("/index.html", "/");
      const topIssue = r.issues[0]?.label || "—";
      return `| ${icon} **${r.score}** | ${name} | ${topIssue} |`;
    }).join("\n");

  const compRows = competitorData.map(c => {
    const status = c.online ? "🟢 Online" : "🔴 Offline";
    const schema = c.hasSchema ? "✅" : "❌";
    return `| ${c.name} | ${c.dist} | ${status} | ${schema} | ${c.title?.slice(0,40) || "—"} |`;
  }).join("\n");

  const gapList = gaps.slice(0, 5).map(g => `- **${g.label}** → /${g.slug}/`).join("\n");

  const fixSection = fixes.length > 0
    ? `\n### ⚡ Auto-fixes uitgevoerd (${fixCount})\n\n${fixes.join("\n")}\n`
    : "\n### ✅ Geen auto-fixes nodig — alles op orde\n";

  const aiSection = aiInsights
    ? `\n### 🤖 AI Aanbevelingen\n\n${aiInsights}\n`
    : "";

  const duration = Math.round((Date.now() - startTime) / 1000);

  const report = `## ${scoreEmoji} AutoSEO Weekrapport — ${now}

> 🤖 Volledig automatisch gegenereerd in ${duration}s · Geen handmatige acties nodig

---

### 📊 Samenvatting

| Metric | Waarde | Trend |
|--------|--------|-------|
| Gemiddelde SEO score | **${avgScore}/100** | ${trend} |
| Pagina's gescand | **${results.length}** | — |
| Kritieke issues | **${critical}** | ${critical === 0 ? "✅ Geen" : "⚠️ Actie nodig"} |
| Waarschuwingen | **${warnings}** | — |
| Auto-fixes | **${fixCount}** | ⚡ Automatisch gefixed |

---

### 📄 Pagina scores (laagste eerst — top 10)

| Score | Pagina | Voornaamste issue |
|-------|--------|-------------------|
${pageRows}

${fixSection}

---

### 🏆 Concurrent Monitor

| Concurrent | Afstand | Status | Schema | Title |
|------------|---------|--------|--------|-------|
${compRows}

---

### 📝 Ontbrekende content kansen (${gaps.length} gevonden)

${gapList || "— Geen gaps gevonden"}

${gaps.length > 5 ? `\n_+ ${gaps.length - 5} meer content kansen beschikbaar_\n` : ""}

---

### 🎯 Priority Keywords — Fit Up Leiderdorp

Top zoekwoorden om te domineren:
\`sportschool leiderdorp\` · \`fitness leiderdorp\` · \`personal trainer leiderdorp\` · \`personal training leiderdorp\` · \`hyrox leiderdorp\` · \`afvallen leiderdorp\`
${aiSection}
---

${blogSection}
---

*🤖 Volledig automatisch · Elke maandag 08:00 · [Bekijk Actions](https://github.com/${REPO}/actions) · Volgende scan: volgende maandag*`;

  // Post naar GitHub Issue
  await postComment(report);

  // Stuur e-mail via Brevo
  console.log("\n📧 Stap 6: E-mail versturen...");
  const emailSubject = `${scoreEmoji} AutoSEO Weekrapport — Score ${avgScore}/100 (${now})`;
  await sendEmailReport(emailSubject, report);

  console.log(`\n✅ AutoSEO Agent klaar in ${duration}s`);
  console.log(`📊 Score: ${avgScore}/100 | Kritiek: ${critical} | Fixes: ${fixCount} | Gaps: ${gaps.length}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
