// Tooltips für die Diagramme: jede Fläche mit data-tip zeigt beim Zeigen oder Tippen ihren Wert.
// Bei Liniendiagrammen läuft zusätzlich eine senkrechte Hilfslinie mit (data-x).
(function () {
  const tip = document.getElementById("tooltip");
  if (!tip) return;
  let pinned = null;

  function show(el, x, y) {
    tip.textContent = el.getAttribute("data-tip");
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    const svg = el.ownerSVGElement, cross = svg && svg.querySelector(".cross");
    if (cross && el.dataset.x) {
      cross.setAttribute("x1", el.dataset.x); cross.setAttribute("x2", el.dataset.x);
      cross.setAttribute("visibility", "visible");
    }
  }
  function hide() {
    tip.hidden = true;
    document.querySelectorAll(".cross").forEach(c => c.setAttribute("visibility", "hidden"));
  }

  document.addEventListener("pointermove", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) show(el, e.clientX, e.clientY);
    else if (!pinned) hide();
  });
  document.addEventListener("pointerdown", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    pinned = el || null;
    if (el) show(el, e.clientX, e.clientY); else hide();
  });
  window.addEventListener("scroll", () => { if (!pinned) hide(); }, { passive: true });
})();
