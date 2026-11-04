#!/usr/bin/env node
// Baut die KI-News-Seite aus content.json + template.html (+ data/metrics.json für die Kennzahlen).
// Ohne Abhängigkeiten. Schreibt archive/{datum}.html, archive/index.html,
// index.html (= neuester Tag) und pflegt seen.json + archive/manifest.json.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hBars, columns, lines, legend } from "./charts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts) => join(ROOT, ...parts);

const loadJson = (file, fallback) => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
};
const saveJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

const esc = (s = "") => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Nur http(s)-Links durchlassen, alles andere wird zu "#".
const safeUrl = (u = "") => /^https?:\/\//i.test(u) ? esc(u) : "#";
const fmt = (n, d = 0) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

// Rubriken-Reihenfolge aus sources.yaml (Block "categories:")
function readCategories() {
  const yaml = readFileSync(p("sources.yaml"), "utf8");
  const block = yaml.match(/^categories:\s*\n((?:[ \t]+-.*\n?)+)/m);
  if (!block) return [];
  return block[1].split("\n").map(l => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}

// Firmen in den Schlagzeilen: feste Liste, erkannt an Namen und Produkten
const FIRMS = [
  ["Anthropic", /\b(Anthropic|Claude)\b/i],
  ["OpenAI", /\b(OpenAI|ChatGPT|GPT-\d|Codex|Sora)\b/i],
  ["Google", /\b(Google|Gemini|DeepMind|Alphabet)\b/i],
  ["Meta", /\b(Meta|Llama|Zuckerberg)\b/],
  ["Microsoft", /\b(Microsoft|Copilot)\b/i],
  ["Nvidia", /\bNvidia\b/i],
  ["Apple", /\bApple\b/],
  ["Amazon", /\b(Amazon|AWS)\b/],
  ["DeepSeek", /\bDeepSeek\b/i],
  ["Mistral", /\bMistral\b/i],
  ["xAI", /\b(xAI|Grok)\b/],
  ["Alibaba/Qwen", /\b(Alibaba|Qwen)\b/i],
];
function firmsOf(e) {
  const t = `${e.title} ${e.text || ""} ${e.summary || ""}`;
  return FIRMS.filter(([, re]) => re.test(t)).map(([n]) => n);
}

const longDate = (iso) => new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(`${iso}T12:00:00Z`));

const shortDate = (iso) => new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
}).format(new Date(`${iso}T12:00:00Z`));

function metaLine(e) {
  const bits = [];
  if (e.category) bits.push(`<span class="tag">${esc(e.category)}</span>`);
  if (e.source) bits.push(`<span>${esc(e.source)}</span>`);
  bits.push(`<a href="${safeUrl(e.url)}" target="_blank" rel="noopener">Zur Quelle →</a>`);
  return `<div class="meta">${bits.join("")}</div>`;
}

const tippHtml = (e) => e.tipp ? `<div class="tipp"><b>Praxis-Tipp:</b> ${esc(e.tipp)}</div>` : "";

function renderTop(top) {
  if (!top.length) return `<div class="empty">Heute keine großen Meldungen.</div>`;
  return top.map((t, i) => (
    `<article class="top-card"><div class="num">${i + 1}</div>` +
    `<h3>${esc(t.title)}</h3><p>${esc(t.text || t.summary)}</p>` +
    `${tippHtml(t)}${metaLine(t)}</article>`
  )).join("");
}

function renderSections(entries, order) {
  const groups = new Map(order.map(c => [c, []]));
  for (const e of entries) {
    const c = e.category || "Sonstiges";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(e);
  }
  let html = "";
  for (const [cat, list] of groups) {
    if (!list.length) continue;
    html += `<section class="rubrik"><h2>${esc(cat)} <span class="n">${list.length}</span></h2>`;
    for (const e of list) {
      html += `<article class="item"><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p>` +
        `${tippHtml(e)}${metaLine({ ...e, category: "" })}</article>`;
    }
    html += `</section>`;
  }
  return html ? `<h2 class="alle">Alle Meldungen</h2><div class="rubriken">${html}</div>` : "";
}

const panel = (title, sub, body, foot = "") =>
  `<section class="panel"><h3>${title}</h3><div class="panel-sub">${sub}</div>${body}${foot ? `<div class="panel-foot">${foot}</div>` : ""}</section>`;

const tile = (label, value, note = "") =>
  `<div class="tile"><div class="tile-l">${label}</div><div class="tile-v">${value}</div>${note ? `<div class="tile-n">${note}</div>` : ""}</div>`;

// Kennzahlen-Bereich: eigene Zahlen aus dem Archiv + offene Daten aus data/metrics.json
function renderDashboard(manifest, date, order, metrics) {
  const briefs = manifest.briefs.filter(b => b.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const today = briefs.at(-1);
  const last7 = briefs.slice(-7);
  const prev = briefs.slice(-8, -1);
  const avgPrev = prev.length ? prev.reduce((s, b) => s + b.count, 0) / prev.length : null;

  const sum = key => last7.reduce((acc, b) => {
    for (const [k, v] of Object.entries(b[key] || {})) acc[k] = (acc[k] || 0) + v;
    return acc;
  }, {});
  const cats = sum("cats"), firms = sum("firms");
  const span = last7.length === 1 ? "heute" : `letzte ${last7.length} Ausgaben`;

  // arXiv: Summe der drei KI-Kategorien je Tag
  const arxivDays = Object.entries(metrics.arxiv || {}).sort(([a], [b]) => a.localeCompare(b)).slice(-30)
    .map(([d, v]) => ({ date: d, value: Object.values(v).reduce((s, n) => s + n, 0), v }));
  const arxivToday = arxivDays.at(-1);

  // Aktien: letzte 30 Handelstage, indexiert auf 100 am ersten Tag
  const names = metrics.stockNames || {};
  const stockSeries = Object.entries(metrics.stocks || {}).map(([sym, pts], i) => {
    const s = pts.slice(-30), b = s[0]?.[1];
    return { name: names[sym] || sym, color: `var(--s${i + 1})`, points: s.map(([d, c]) => [d, Math.round((c / b) * 1000) / 10]) };
  }).filter(s => s.points.length > 1);
  const nv = stockSeries.find(s => s.name === "NVIDIA");

  let kpis = tile("Meldungen heute", fmt(today?.count || 0),
    avgPrev !== null ? `Ø vorher ${fmt(avgPrev, 1)}` : "erste Ausgabe");
  kpis += tile("Quellen heute", fmt(today?.sources || 0));
  if (arxivToday) kpis += tile("Neue KI-Paper", fmt(arxivToday.value), `arXiv, ${arxivToday.date.split("-").reverse().slice(0, 2).join(".")}.`);
  if (nv) {
    const ch = nv.points.at(-1)[1] - 100;
    kpis += tile("NVIDIA, 30 Tage", `${ch >= 0 ? "+" : "−"}${fmt(Math.abs(ch), 1)} %`, "Kurs im Vergleich zu vor 30 Handelstagen");
  }

  const catItems = order.map(c => ({ label: c, value: cats[c] || 0 })).filter(i => i.value);
  const firmItems = Object.entries(firms).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));

  let panels = "";
  panels += panel("Worüber heute geredet wird", `Meldungen je Rubrik, ${span}`, hBars(catItems));
  panels += panel("Firmen in den Schlagzeilen", `Erwähnungen in Meldungen, ${span}`,
    hBars(firmItems, { color: "var(--s2)" }), "Gezählt wird, ob eine Firma oder ihr Produkt in einer Meldung vorkommt.");
  if (briefs.length > 1)
    panels += panel("Meldungen pro Tag", "Anzahl ausgewählter Meldungen je Ausgabe",
      columns(briefs.slice(-14).map(b => ({ date: b.date, value: b.count }))));
  if (arxivDays.length)
    panels += panel("Wie viel zu KI geforscht wird", "Neue Fachartikel pro Tag auf arXiv (KI, maschinelles Lernen, Sprache)",
      columns(arxivDays.map(d => ({ date: d.date, value: d.value, tip: `${d.date.split("-").reverse().slice(0, 2).join(".")}.: ${fmt(d.value)} (KI ${d.v["cs.AI"]}, ML ${d.v["cs.LG"]}, Sprache ${d.v["cs.CL"]})` }))),
      arxivDays.length < 3 ? "Die Reihe wächst ab heute jeden Tag um einen Wert." : "");
  if (stockSeries.length)
    panels += panel("KI-Firmen an der Börse", "Aktienkurs, letzte 30 Handelstage, Start = 100",
      legend(stockSeries) + lines(stockSeries, { base: 100 }),
      "Quelle: Yahoo Finance. Nur zur Einordnung, keine Anlageberatung.");
  if (metrics.hf?.length) {
    const rows = metrics.hf.slice(0, 6).map(m =>
      `<li><a href="https://huggingface.co/${esc(m.id)}" target="_blank" rel="noopener">${esc(m.id.split("/")[1] || m.id)}</a>` +
      `<span>${esc(m.id.split("/")[0])}</span><b>${fmt(m.likes)} ♥</b></li>`).join("");
    panels += panel("Gefragte offene Modelle", "Gerade am meisten beachtet auf Hugging Face", `<ol class="ranklist">${rows}</ol>`,
      "Offene Modelle kann jeder herunterladen und selbst betreiben.");
  }
  return { kpis: `<div class="tiles">${kpis}</div>`, dashboard: `<div class="dash">${panels}</div>` };
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function build() {
  const content = loadJson(p("content.json"), null);
  if (!content || !content.date) {
    console.log("Kein gültiges content.json, nichts zu bauen.");
    return;
  }

  const template = readFileSync(p("template.html"), "utf8");
  const order = readCategories();
  const metrics = loadJson(p("data", "metrics.json"), {});
  const site = content.site || {};
  const title = site.title || "KI-News";
  const lang = site.lang || "de";
  const date = content.date;
  const top = (content.top || []).slice(0, 3);
  const entries = content.entries || [];
  const all = [...top, ...entries];
  const total = all.length;

  const sources = [...new Set(all.map(e => e.source).filter(Boolean))];
  const cats = {}, firms = {};
  for (const e of all) {
    if (e.category) cats[e.category] = (cats[e.category] || 0) + 1;
    for (const f of firmsOf(e)) firms[f] = (firms[f] || 0) + 1;
  }

  mkdirSync(p("archive"), { recursive: true });
  const manifestPath = p("archive", "manifest.json");
  const manifest = loadJson(manifestPath, { briefs: [] });
  manifest.briefs = manifest.briefs.filter(b => b.date !== date);
  manifest.briefs.push({ date, file: `${date}.html`, headline: top[0]?.title || "", count: total, sources: sources.length, cats, firms });
  manifest.briefs.sort((a, b) => b.date.localeCompare(a.date));
  manifest.site = { title, description: site.description || "", lang };

  const idx = manifest.briefs.findIndex(b => b.date === date);
  const older = manifest.briefs[idx + 1];
  const { kpis, dashboard } = renderDashboard(manifest, date, order, metrics);

  const page = (root, isIndex) => {
    const nav = [];
    if (!isIndex) nav.push(`<a href="${root}">Heute</a>`);
    if (older) nav.push(`<a href="${root}archive/${older.file}">← Vortag</a>`);
    nav.push(`<a href="${root}archive/">Archiv</a>`);
    return fill(template, {
      LANG: esc(lang),
      PAGE_TITLE: `${esc(title)} · ${esc(shortDate(date))}`,
      DESCRIPTION: esc(site.description || ""),
      SITE_TITLE: esc(title),
      DATE_LONG: esc(longDate(date)),
      STATS: total ? `${total} Meldungen aus ${sources.length} Quellen` : "Heute keine neuen Meldungen",
      NAV: nav.join(""),
      ROOT: root,
      KPIS: kpis,
      INTRO: content.intro ? `<div class="intro">${esc(content.intro)}</div>` : "",
      TOP_TITLE: "Top 3 des Tages",
      TOP: `<div class="top">${renderTop(top)}</div>`,
      DASHBOARD: dashboard,
      SECTIONS: renderSections(entries, order),
      RUECKBLICK: content.rueckblick
        ? `<h2>Wochenrückblick</h2><div class="rueckblick">${esc(content.rueckblick)}</div>` : "",
      SOURCES: sources.map(esc).join(", ") || "–",
    });
  };

  writeFileSync(p("archive", `${date}.html`), page("../", false));
  console.log(`archive/${date}.html geschrieben`);

  // index.html zeigt immer den neuesten Tag
  if (manifest.briefs[0].date === date) {
    writeFileSync(p("index.html"), page("", true));
    console.log("index.html aktualisiert");
  }

  const list = manifest.briefs.map(b =>
    `<li><a href="${esc(b.file)}"><span class="d">${esc(longDate(b.date))}</span>` +
    `<span class="h">${esc(b.headline || `${b.count} Meldungen`)}</span></a></li>`
  ).join("");
  writeFileSync(p("archive", "index.html"), fill(template, {
    LANG: esc(lang),
    PAGE_TITLE: `${esc(title)} · Archiv`,
    DESCRIPTION: esc(site.description || ""),
    SITE_TITLE: esc(title),
    DATE_LONG: "Archiv",
    STATS: `${manifest.briefs.length} Ausgaben`,
    NAV: `<a href="../">Heute</a>`,
    ROOT: "../",
    TOP_TITLE: "Alle Ausgaben",
    TOP: `<ul class="archive">${list}</ul>`,
    SOURCES: "siehe einzelne Ausgaben",
  }));

  saveJson(manifestPath, manifest);

  const seen = loadJson(p("seen.json"), {});
  for (const e of all) {
    if (e.url && !seen[e.url]) seen[e.url] = { title: e.title, source: e.source || "", first_seen: date };
  }
  saveJson(p("seen.json"), seen);
  console.log(`seen.json: ${Object.keys(seen).length} Einträge`);
}

build();
