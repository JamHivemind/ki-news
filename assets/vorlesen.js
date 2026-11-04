// Vorlesen-Knopf: liest Intro, Top 3 und alle Meldungen mit der Stimme des Browsers vor.
// Kein Server, keine Kosten. Satzweise Häppchen, weil Chrome lange Texte sonst abbricht.
(function () {
  const synth = window.speechSynthesis;
  const box = document.getElementById("vorlesen");
  if (!synth || !box) return;

  const articles = [...document.querySelectorAll(".top-card, .item")];
  if (!articles.length) return;
  box.hidden = false;

  const btnPlay = box.querySelector("[data-play]");
  const btnStop = box.querySelector("[data-stop]");
  const label = box.querySelector("[data-label]");

  // Beste deutsche Stimme: Edge "Natural"/"Online" > Google > Apple-Premium > irgendeine deutsche
  function pickVoice() {
    const de = synth.getVoices().filter(v => /^de(-|_|$)/i.test(v.lang));
    const rank = v => /natural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1
      : /premium|enhanced|anna|petra|markus/i.test(v.name) ? 2 : 3;
    return de.sort((a, b) => rank(a) - rank(b))[0] || null;
  }
  let voice = pickVoice();
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => { voice = pickVoice(); };

  const text = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const sentences = s => (s.match(/[^.!?…]+[.!?…]*\s*/g) || [s]).map(x => x.trim()).filter(Boolean);

  // Ablauf aufbauen: [{el, parts:[…]}]
  function buildQueue() {
    const q = [];
    const head = [text(document.querySelector("header .kicker")) + ", " + text(document.querySelector("h1")) + "."];
    const intro = text(document.querySelector(".intro"));
    q.push({ el: null, parts: head.concat(intro ? sentences(intro) : []) });
    let lastSection = null;
    articles.forEach((a, i) => {
      const parts = [];
      if (a.classList.contains("top-card")) {
        if (i === 0) parts.push("Die Top 3 des Tages.");
        parts.push("Nummer " + text(a.querySelector(".num")) + ": " + text(a.querySelector("h3")) + ".");
      } else {
        let h = a.previousElementSibling;
        while (h && h.tagName !== "H2") h = h.previousElementSibling;
        if (h && h !== lastSection) {
          lastSection = h;
          parts.push("Rubrik " + text(h).replace(/\s*\d+$/, "") + ".");
        }
        parts.push(text(a.querySelector("h3")) + ".");
      }
      parts.push(...sentences(text(a.querySelector("p"))));
      const tipp = a.querySelector(".tipp");
      if (tipp) parts.push(...sentences(text(tipp)));
      q.push({ el: a, parts });
    });
    q.push({ el: null, parts: ["Das waren die KI-News für heute."] });
    return q;
  }

  let queue = [], qi = 0, pi = 0, state = "idle"; // idle | playing | paused

  function mark(el) {
    document.querySelectorAll(".reading").forEach(x => x.classList.remove("reading"));
    if (el) {
      el.classList.add("reading");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function speakNext() {
    if (state !== "playing") return;
    while (qi < queue.length && pi >= queue[qi].parts.length) { qi++; pi = 0; }
    if (qi >= queue.length) return stop();
    if (pi === 0) mark(queue[qi].el);
    const u = new SpeechSynthesisUtterance(queue[qi].parts[pi]);
    u.lang = "de-DE";
    if (voice) u.voice = voice;
    u.rate = 1.05;
    u.onend = () => { pi++; speakNext(); };
    u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") { pi++; speakNext(); } };
    synth.speak(u);
  }

  function render() {
    btnPlay.textContent = state === "playing" ? "⏸ Pause" : state === "paused" ? "▶ Weiter" : "🔊 Vorlesen";
    btnPlay.setAttribute("aria-pressed", state === "playing" ? "true" : "false");
    btnStop.hidden = state === "idle";
    label.textContent = state === "idle" ? "" : (voice ? voice.name.replace(/^Microsoft\s+/, "").replace(/\s*\(.*$/, "") : "Browser-Stimme");
  }

  function stop() {
    state = "idle";
    synth.cancel();
    mark(null);
    render();
  }

  btnPlay.addEventListener("click", () => {
    if (state === "idle") {
      queue = buildQueue(); qi = 0; pi = 0; state = "playing";
      synth.cancel(); speakNext();
    } else if (state === "playing") {
      // pause() ist in manchen Browsern unzuverlässig: abbrechen und beim selben Satz weitermachen
      state = "paused"; synth.cancel();
    } else {
      state = "playing"; speakNext();
    }
    render();
  });
  btnStop.addEventListener("click", stop);
  window.addEventListener("pagehide", () => synth.cancel());
  render();
})();
