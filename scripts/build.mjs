#!/usr/bin/env node
// Baut die KI-News-Seite aus content.json + template.html.
// Ohne Abhängigkeiten. Schreibt archive/{datum}.html, archive/index.html,
// index.html (= neuester Tag) und pflegt seen.json + archive/manifest.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// Rubriken-Reihenfolge aus sources.yaml (Block "categories:")
function readCategories() {
  const yaml = readFileSync(p("sources.yaml"), "utf8");
  const block = yaml.match(/^categories:\s*\n((?:[ \t]+-.*\n?)+)/m);
  if (!block) return [];
  return block[1].split("\n").map(l => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
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
    html += `<h2>${esc(cat)} <span class="n">${list.length}</span></h2>`;
    for (const e of list) {
      html += `<article class="item"><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p>` +
        `${tippHtml(e)}${metaLine({ ...e, category: "" })}</article>`;
    }
  }
  return html;
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
  const site = content.site || {};
  const title = site.title || "KI-News";
  const lang = site.lang || "de";
  const date = content.date;
  const top = (content.top || []).slice(0, 3);
  const entries = content.entries || [];
  const total = top.length + entries.length;

  const sources = [...new Set([...top, ...entries].map(e => e.source).filter(Boolean))];

  mkdirSync(p("archive"), { recursive: true });
  const manifestPath = p("archive", "manifest.json");
  const manifest = loadJson(manifestPath, { briefs: [] });
  manifest.briefs = manifest.briefs.filter(b => b.date !== date);
  manifest.briefs.push({ date, file: `${date}.html`, headline: top[0]?.title || "", count: total });
  manifest.briefs.sort((a, b) => b.date.localeCompare(a.date));
  manifest.site = { title, description: site.description || "", lang };

  const idx = manifest.briefs.findIndex(b => b.date === date);
  const older = manifest.briefs[idx + 1];

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
      INTRO: content.intro ? `<div class="intro">${esc(content.intro)}</div>` : "",
      TOP: renderTop(top),
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
    INTRO: "",
    TOP: `<ul class="archive">${list}</ul>`,
    SECTIONS: "",
    RUECKBLICK: "",
    SOURCES: "siehe einzelne Ausgaben",
  }).replace("<h2>Top 3 des Tages</h2>", ""));

  saveJson(manifestPath, manifest);

  const seen = loadJson(p("seen.json"), {});
  for (const e of [...top, ...entries]) {
    if (e.url && !seen[e.url]) seen[e.url] = { title: e.title, source: e.source || "", first_seen: date };
  }
  saveJson(p("seen.json"), seen);
  console.log(`seen.json: ${Object.keys(seen).length} Einträge`);
}

build();
