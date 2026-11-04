// Kleine SVG-Diagramme ohne Bibliothek. Farben kommen als CSS-Variablen (--s1 … --s8, --ink …),
// damit Hell- und Dunkelmodus in style.css umschalten. Jede Markierung trägt data-tip für den Tooltip.

const esc = (s = "") => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n, d = 0) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const dayLabel = iso => { const [, m, d] = iso.split("-"); return `${Number(d)}.${Number(m)}.`; };

// Runde Achsenschritte (1, 2, 5 × 10^n)
function niceMax(v, ticks = 4) {
  if (v <= 0) return { max: 1, step: 1 };
  const raw = v / ticks, pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(f => f * pow).find(s => s >= raw);
  return { max: Math.ceil(v / step) * step, step };
}

// Balken mit oben gerundeten Ecken (4px), unten bündig an der Grundlinie
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Waagerechte Balken, eine Reihe. items: [{label, value, tip?}]
export function hBars(items, { color = "var(--s1)", unit = "", max: forceMax } = {}) {
  if (!items.length) return `<div class="chart-empty">Noch keine Daten</div>`;
  const rowH = 30, labelW = 168, valueW = 44, W = 520, plotW = W - labelW - valueW;
  const max = forceMax || Math.max(...items.map(i => i.value)) || 1;
  const H = items.length * rowH;
  let g = "";
  items.forEach((it, i) => {
    const y = i * rowH + 7, w = Math.max(2, (it.value / max) * plotW), h = rowH - 14;
    const tip = it.tip || `${it.label}: ${fmt(it.value)}${unit}`;
    g += `<text x="${labelW - 10}" y="${y + h / 2}" class="lab" text-anchor="end" dominant-baseline="central">${esc(it.label)}</text>`;
    g += `<rect x="${labelW}" y="${i * rowH}" width="${plotW + valueW}" height="${rowH}" class="hit" data-tip="${esc(tip)}"/>`;
    // rechts gerundet: als gedrehter Balken zeichnen
    const r = Math.min(4, h / 2, w);
    g += `<path d="M${labelW},${y}H${labelW + w - r}Q${labelW + w},${y} ${labelW + w},${y + r}V${y + h - r}Q${labelW + w},${y + h} ${labelW + w - r},${y + h}H${labelW}Z" style="fill:${color}" pointer-events="none"/>`;
    g += `<text x="${labelW + w + 6}" y="${y + h / 2}" class="val" dominant-baseline="central">${fmt(it.value)}${unit}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Balkendiagramm">${g}</svg>`;
}

// Senkrechte Säulen über Tage, eine Reihe. points: [{date, value, tip?}]
export function columns(points, { color = "var(--s1)", unit = "" } = {}) {
  if (!points.length) return `<div class="chart-empty">Noch keine Daten</div>`;
  const W = 520, H = 170, padL = 36, padB = 22, padT = 8, plotW = W - padL - 4, plotH = H - padB - padT;
  const { max, step } = niceMax(Math.max(...points.map(p => p.value)));
  const n = Math.max(points.length, 7), slot = plotW / n, bw = Math.min(28, slot - 4);
  let g = "";
  for (let v = 0; v <= max; v += step) {
    const y = padT + plotH - (v / max) * plotH;
    g += `<line x1="${padL}" x2="${W - 4}" y1="${y}" y2="${y}" class="${v === 0 ? "base" : "grid"}"/>`;
    g += `<text x="${padL - 6}" y="${y}" class="ax" text-anchor="end" dominant-baseline="central">${fmt(v)}</text>`;
  }
  const every = Math.ceil(points.length / 7);
  points.forEach((p, i) => {
    const x = padL + i * slot + (slot - bw) / 2, h = (p.value / max) * plotH, y = padT + plotH - h;
    g += `<rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" class="hit" data-tip="${esc(p.tip || `${dayLabel(p.date)}: ${fmt(p.value)}${unit}`)}"/>`;
    g += `<path d="${barPath(x, y, bw, h)}" style="fill:${color}" pointer-events="none"/>`;
    if (i % every === 0 || i === points.length - 1)
      g += `<text x="${x + bw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${dayLabel(p.date)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Säulendiagramm">${g}</svg>`;
}

// Linien, mehrere Reihen auf einer gemeinsamen Achse. series: [{name, color, points:[[date, y]]}]
export function lines(series, { base = null, unit = "" } = {}) {
  const dates = [...new Set(series.flatMap(s => s.points.map(p => p[0])))].sort();
  if (dates.length < 2) return `<div class="chart-empty">Noch zu wenig Daten</div>`;
  const W = 520, H = 200, padL = 36, padR = 86, padB = 22, padT = 10, plotW = W - padL - padR, plotH = H - padB - padT;
  const ys = series.flatMap(s => s.points.map(p => p[1]));
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1; lo -= span * 0.08; hi += span * 0.08;
  const step = niceMax(hi - lo, 4).step;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const X = d => padL + (dates.indexOf(d) / (dates.length - 1)) * plotW;
  const Y = v => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  let g = "";
  for (let v = lo; v <= hi + 1e-9; v += step) {
    g += `<line x1="${padL}" x2="${padL + plotW}" y1="${Y(v)}" y2="${Y(v)}" class="${base !== null && Math.abs(v - base) < 1e-9 ? "base" : "grid"}"/>`;
    g += `<text x="${padL - 6}" y="${Y(v)}" class="ax" text-anchor="end" dominant-baseline="central">${fmt(v)}</text>`;
  }
  const every = Math.ceil(dates.length / 5);
  dates.forEach((d, i) => {
    if (i % every === 0) g += `<text x="${X(d)}" y="${H - 6}" class="ax" text-anchor="middle">${dayLabel(d)}</text>`;
  });
  // Endbeschriftungen ohne Überlappung
  const ends = series.map(s => ({ s, y: Y(s.points.at(-1)[1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  series.forEach(s => {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    g += `<path d="${d}" class="line" style="stroke:${s.color}"/>`;
    const last = s.points.at(-1);
    g += `<circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" class="dot" style="fill:${s.color}"/>`;
  });
  ends.forEach(({ s, y }) => {
    g += `<text x="${padL + plotW + 8}" y="${y}" class="lab" dominant-baseline="central">${esc(s.name)} ${fmt(s.points.at(-1)[1])}</text>`;
  });
  // Spalten für den Fadenkreuz-Tooltip
  const colW = plotW / (dates.length - 1);
  dates.forEach(d => {
    const vals = series.map(s => { const p = s.points.find(q => q[0] === d); return p ? `${s.name} ${fmt(p[1])}${unit}` : null; })
      .filter(Boolean).join(" · ");
    g += `<rect x="${X(d) - colW / 2}" y="${padT}" width="${colW}" height="${plotH}" class="hit" data-x="${X(d)}" data-tip="${esc(`${dayLabel(d)}: ${vals}`)}"/>`;
  });
  g += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" visibility="hidden"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Liniendiagramm">${g}</svg>`;
}

export function legend(series) {
  return `<div class="legend">${series.map(s =>
    `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
}
