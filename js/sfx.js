"use strict";
/* Válka popela — zvukové efekty.
   Vše syntetizované přes WebAudio (žádné soubory): krátké tóny, šum a obálky.
   AudioContext se vytváří líně při prvním zvuku (prohlížeče vyžadují gesto). */

const sfx = (() => {
  let ac = null;
  let enabled = localStorage.getItem("vp-sound") !== "0";
  let lastPlay = {}; // throttle: stejný zvuk max jednou za chvíli

  function ctx() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  // jeden tón s obálkou; slide = cílová frekvence (glissando)
  function tone(freq, dur, { type = "sine", gain = 0.15, when = 0, slide = null } = {}) {
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime + when;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // krátký šum (bubny, náraz, vichr); filter = frekvence dolní propusti
  function noise(dur, { gain = 0.12, when = 0, filter = 800, q = 0.8 } = {}) {
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime + when;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = filter; f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t0);
  }

  const SOUNDS = {
    click:      () => tone(660, 0.05, { type: "square", gain: 0.035 }),
    march:      () => { noise(0.09, { gain: 0.1, filter: 500 }); noise(0.09, { when: 0.16, gain: 0.08, filter: 450 }); },
    battleWin:  () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.12, when: i * 0.09 })); },
    battleLose: () => { [330, 262, 208].forEach((f, i) => tone(f, 0.3, { type: "triangle", gain: 0.12, when: i * 0.14 })); },
    defended:   () => { [523, 659].forEach((f, i) => tone(f, 0.18, { type: "triangle", gain: 0.1, when: i * 0.1 })); },
    levelup:    () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: "sine", gain: 0.1, when: i * 0.07 })); },
    build:      () => { noise(0.06, { gain: 0.14, filter: 900 }); tone(196, 0.1, { type: "square", gain: 0.06, when: 0.02 }); noise(0.05, { when: 0.13, gain: 0.1, filter: 1100 }); },
    loot:       () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, { type: "sine", gain: 0.07, when: i * 0.05 })); },
    mapEvent:   () => { tone(587, 0.25, { type: "sine", gain: 0.08 }); tone(880, 0.3, { type: "sine", gain: 0.05, when: 0.12 }); },
    storm:      () => { noise(1.4, { gain: 0.14, filter: 250, q: 1.2 }); tone(65, 1.2, { type: "sawtooth", gain: 0.05, slide: 45 }); },
    throne:     () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.5, { type: "triangle", gain: 0.09, when: i * 0.05 })); },
    pact:       () => { tone(392, 0.3, { type: "triangle", gain: 0.09 }); tone(494, 0.35, { type: "triangle", gain: 0.09, when: 0.14 }); },
    offer:      () => { tone(494, 0.16, { type: "sine", gain: 0.08 }); tone(587, 0.2, { type: "sine", gain: 0.08, when: 0.1 }); },
    goal:       () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.16, { type: "triangle", gain: 0.1, when: i * 0.08 })); },
    starve:     () => { tone(220, 0.35, { type: "sawtooth", gain: 0.05, slide: 150 }); },
    report:     () => { noise(0.1, { gain: 0.05, filter: 2400 }); },
    error:      () => tone(180, 0.12, { type: "square", gain: 0.05 }),
  };

  function play(name) {
    if (!enabled || !SOUNDS[name]) return;
    const now = performance.now();
    if (lastPlay[name] && now - lastPlay[name] < 180) return; // netlouct dokola
    lastPlay[name] = now;
    try { SOUNDS[name](); } catch (e) {}
  }

  function toggle() {
    enabled = !enabled;
    localStorage.setItem("vp-sound", enabled ? "1" : "0");
    if (enabled) play("click");
    return enabled;
  }

  return { play, toggle, get enabled() { return enabled; } };
})();
