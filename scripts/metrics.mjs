#!/usr/bin/env node
// Holt täglich Kennzahlen aus offenen Quellen und hängt sie an data/metrics.json an.
// Ohne Abhängigkeiten und ohne Schlüssel. Fällt eine Quelle aus, bleibt der alte Wert stehen:
// das Skript bricht den Bau nie ab.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data", "metrics.json");
const UA = { "user-agent": "Mozilla/5.0 (KI-News; +https://jamhivemind.github.io/ki-news/)" };

const load = () => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; } };
const berlinDate = (d = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

async function get(url, type = "json") {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return type === "json" ? res.json() : res.text();
}

async function attempt(name, fn) {
  try { return await fn(); } catch (e) { console.log(`Kennzahl ${name} übersprungen: ${e.message}`); return undefined; }
}

// Neue Einreichungen auf arXiv in den drei KI-Kategorien, laut Tagesliste
async function arxiv() {
  const out = {};
  let day = null;
  for (const cat of ["cs.AI", "cs.LG", "cs.CL"]) {
    const html = await get(`https://arxiv.org/list/${cat}/new`, "text");
    const n = html.match(/New submissions \(showing \d+ of (\d+) entries\)/);
    const d = html.match(/new listings for \w+, (\d{1,2} \w+ \d{4})/);
    if (!n || !d) throw new Error(`Format ${cat} unbekannt`);
    out[cat] = Number(n[1]);
    day = new Date(`${d[1]} 12:00 UTC`).toISOString().slice(0, 10);
  }
  return { day, ...out };
}

// Schlusskurse der letzten 3 Monate
const STOCKS = { NVDA: "NVIDIA", MSFT: "Microsoft", GOOGL: "Alphabet", META: "Meta" };
async function stocks() {
  const out = {};
  for (const sym of Object.keys(STOCKS)) {
    const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=3mo&interval=1d`);
    const r = j.chart.result[0];
    const close = r.indicators.quote[0].close;
    out[sym] = r.timestamp
      .map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i]])
      .filter(([, c]) => typeof c === "number")
      .map(([d, c]) => [d, Math.round(c * 100) / 100]);
  }
  return out;
}

// Meistbeachtete Modelle auf Hugging Face gerade
async function hf() {
  const j = await get("https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=6");
  return j.map(m => ({ id: m.id, likes: m.likes, downloads: m.downloads, task: m.pipeline_tag || "" }));
}

const m = load();
m.arxiv ??= {};
const ax = await attempt("arXiv", arxiv);
if (ax) m.arxiv[ax.day] = { "cs.AI": ax["cs.AI"], "cs.LG": ax["cs.LG"], "cs.CL": ax["cs.CL"] };
const st = await attempt("Aktien", stocks);
if (st) { m.stocks = st; m.stockNames = STOCKS; }
const h = await attempt("Hugging Face", hf);
if (h) m.hf = h;
m.updated = new Date().toISOString();
m.updatedDay = berlinDate();

mkdirSync(dirname(FILE), { recursive: true });
writeFileSync(FILE, JSON.stringify(m, null, 1) + "\n");
console.log(`data/metrics.json: arXiv-Tage ${Object.keys(m.arxiv).length}, Aktien ${st ? "ok" : "alt"}, HF ${h ? "ok" : "alt"}`);
