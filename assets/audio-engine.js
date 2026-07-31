/* ============================================================
   BeatGenome — audio-engine.js  (V15 / Stage 6: 16-bar arrangement — intro/build/drop/break + fills)
   Procedural, in-browser genre audio on Tone.js.
   window.BeatGenomeAudio. App works fully if Tone.js is missing.
   ============================================================ */
(function (root) {
  "use strict";
  var T = root.Tone;
  var RS = { kick: 0, snare: 0, hat: 0, bass: 0, chord: 0, master: 0, playing: false, bpm: 124, genreId: null, progRomans: [], chordStep: 0, step16: 0 };
  var state = { supported: !!T, initialized: false, enabled: false, playing: false,
    volume: 0.7, lowPerf: false, active: null, pending: null, step: 0, listeners: [] };
  try { state.lowPerf = ("ontouchstart" in root) || (navigator.maxTouchPoints > 0) || ((navigator.hardwareConcurrency || 8) <= 4); } catch (e) {}

  var nodes = {};
  function emit(t) { state.listeners.forEach(function (fn) { try { fn(t, snap()); } catch (e) {} }); }
  function snap() { return { enabled: state.enabled, playing: state.playing, volume: state.volume, genre: state.active ? state.active.name : null, supported: state.supported }; }

  var NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  function rootIdx(r) { var i = NOTES.indexOf(r); return i < 0 ? 9 : i; }
  function steps(sc) { return sc === "major" ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10]; }
  function noteFor(p, deg, oct) {
    var st = (p.scaleSteps && p.scaleSteps.length === 7) ? p.scaleSteps : steps(p.scale);
    var i = ((deg % 7) + 7) % 7, midi = 12 * (oct + 1) + rootIdx(p.key) + st[i];
    try { return T.Frequency(midi, "midi").toNote(); } catch (e) { return "A" + oct; }
  }

  function build() {
    if (nodes.master) return;
    var dest = T.getDestination ? T.getDestination() : T.Destination;
    nodes.limiter = new T.Limiter(-1).connect(dest);
    nodes.masterComp = new T.Compressor({ threshold: -14, ratio: 2.5, attack: 0.006, release: 0.16 }).connect(nodes.limiter);
    nodes.master = new T.Gain(0.0001).connect(nodes.masterComp);        // volume node

    // FX bus (reverb + delay) -> master
    nodes.reverb = new T.Reverb({ decay: state.lowPerf ? 1.0 : 2.4, wet: 0.3 }).connect(nodes.master);
    nodes.delay = new T.FeedbackDelay("8n.", 0.22); nodes.delay.wet.value = 0.15; nodes.delay.connect(nodes.master);

    // sidechain node: bass + chords + lead route through here, ducked by the kick
    nodes.musicDuck = new T.Gain(1).connect(nodes.master);

    // ---- drum bus (not ducked): EQ -> saturation -> comp -> master ----
    nodes.drumComp = new T.Compressor({ threshold: -18, ratio: 3, attack: 0.003, release: 0.12 }).connect(nodes.master);
    nodes.drumSat = new T.Distortion(0.05).connect(nodes.drumComp);
    nodes.drumEQ = new T.EQ3(1, -1, 1.5).connect(nodes.drumSat);
    nodes.drumBus = new T.Gain(0.95).connect(nodes.drumEQ);
    nodes.kick = new T.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0 } }).connect(nodes.drumBus);
    nodes.snare = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } });
    nodes.snareFilt = new T.Filter(1800, "bandpass").connect(nodes.drumBus); nodes.snare.connect(nodes.snareFilt);
    nodes.hat = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 } });
    nodes.hatFilt = new T.Filter(8000, "highpass").connect(nodes.drumBus); nodes.hatGain = new T.Gain(0.32); nodes.hat.connect(nodes.hatGain); nodes.hatGain.connect(nodes.hatFilt);
    nodes.perc = new T.MetalSynth({ frequency: 250, envelope: { attack: 0.001, decay: 0.12, release: 0.01 }, harmonicity: 5.1, resonance: 4000, octaves: 1.4 });
    nodes.percGain = new T.Gain(0.1).connect(nodes.drumBus); nodes.perc.connect(nodes.percGain);
    // kick click/punch transient — definition on top of the MembraneSynth sub tail
    nodes.kickClick = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.012, sustain: 0 } });
    nodes.kickClickFilt = new T.Filter(2600, "highpass").connect(nodes.drumBus);
    nodes.kickClickGain = new T.Gain(0.14); nodes.kickClick.connect(nodes.kickClickGain); nodes.kickClickGain.connect(nodes.kickClickFilt);
    // dedicated open hat — longer sizzle than the tight closed hat
    nodes.openHat = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.28, sustain: 0 } });
    nodes.openHatGain = new T.Gain(0.22); nodes.openHat.connect(nodes.openHatGain); nodes.openHatGain.connect(nodes.hatFilt);

    // ---- bass bus: CHARACTER layer (ducked, saturated, stereo-widened) ----
    nodes.bassWiden = new T.StereoWidener(0.5).connect(nodes.musicDuck);
    nodes.bassSat = new T.Distortion(0).connect(nodes.bassWiden);
    nodes.bassEQ = new T.EQ3(0, -1, -2).connect(nodes.bassSat);
    nodes.bassFilt = new T.Filter(600, "lowpass").connect(nodes.bassEQ);
    nodes.bass = new T.MonoSynth({ oscillator: { type: "sawtooth" }, filter: { Q: 2 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 }, filterEnvelope: { attack: 0.01, decay: 0.2, baseFrequency: 120, octaves: 2.5 } });
    nodes.bassGain = new T.Gain(0.5); nodes.bass.connect(nodes.bassGain); nodes.bassGain.connect(nodes.bassFilt);
    nodes.wobble = new T.LFO("8n", 300, 300).connect(nodes.bassFilt.frequency); nodes.wobble.start();  // static unless wobble genre
    // ---- SUB layer (ducked, clean sine, mono/centered — owns the fundamental) ----
    nodes.subFilt = new T.Filter(110, "lowpass").connect(nodes.musicDuck);
    nodes.subBass = new T.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.006, decay: 0.24, sustain: 0.7, release: 0.18 } });
    nodes.subGain = new T.Gain(0); nodes.subBass.connect(nodes.subGain); nodes.subGain.connect(nodes.subFilt);

    // ---- chords + lead (ducked, dry) with parallel FX sends ----
    nodes.musicBus = new T.Gain(1).connect(nodes.musicDuck);
    nodes.chordFilt = new T.Filter(1200, "lowpass");
    nodes.chordFilt.connect(nodes.musicBus); nodes.chordFilt.connect(nodes.reverb); nodes.chordFilt.connect(nodes.delay);
    nodes.chorus = new T.Chorus({ frequency: 1.4, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0 }); try { nodes.chorus.start(); } catch (e) {} nodes.chorus.connect(nodes.chordFilt);
    nodes.chords = new T.PolySynth(T.Synth); nodes.chords.maxPolyphony = state.lowPerf ? 4 : 8;
    nodes.chords.set({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 1.4 } });
    nodes.chordGain = new T.Gain(0.32); nodes.chords.connect(nodes.chordGain); nodes.chordGain.connect(nodes.chorus);
    nodes.lead = new T.FMSynth({ harmonicity: 2, modulationIndex: 6, envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.4 } });
    nodes.leadGain = new T.Gain(0.1); nodes.lead.connect(nodes.leadGain); nodes.leadGain.connect(nodes.musicBus); nodes.leadGain.connect(nodes.delay);

    // ---- FX layer (Stage 5): risers, crash, low impact — routed post-duck (not pumped) ----
    nodes.fxBus = new T.Gain(0.6).connect(nodes.master); nodes.fxBus.connect(nodes.reverb);
    nodes.riser = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 1.2, decay: 0.02, sustain: 1, release: 0.15 } });
    nodes.riserFilt = new T.Filter(500, "highpass").connect(nodes.fxBus);
    nodes.riserGain = new T.Gain(0.2); nodes.riser.connect(nodes.riserGain); nodes.riserGain.connect(nodes.riserFilt);
    nodes.crash = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 } });
    nodes.crashFilt = new T.Filter(5000, "highpass").connect(nodes.fxBus);
    nodes.crashGain = new T.Gain(0.18); nodes.crash.connect(nodes.crashGain); nodes.crashGain.connect(nodes.crashFilt);
    nodes.impact = new T.MembraneSynth({ pitchDecay: 0.08, octaves: 8, envelope: { attack: 0.001, decay: 0.6, sustain: 0 } });
    nodes.impactGain = new T.Gain(0.4).connect(nodes.master); nodes.impact.connect(nodes.impactGain);

    T.Transport.scheduleRepeat(onStep, "16n");
  }

  // ---- sidechain pump (kick ducks bass/chords/lead) ----
  function sidechainParams(p) {
    var fam = (p.family || p.id || "").toLowerCase(), rel = 0.22, duck = 0.40;
    if (/techno|industrial/.test(fam)) { rel = 0.12; duck = 0.44; }
    else if (/hard|gabber|hardcore/.test(fam)) { rel = 0.10; duck = 0.42; }
    else if (/trance|psy/.test(fam)) { rel = 0.17; duck = 0.34; }
    else if (/future|melodic|chill|ambient|downtempo|lofi|deep/.test(fam)) { rel = 0.34; duck = 0.26; }
    else if (/dubstep|dnb|drum|riddim|bass/.test(fam)) { rel = 0.20; duck = 0.36; }
    duck -= ((p.energy || 0.5) - 0.5) * 0.06;
    duck = Math.max(0.2, Math.min(0.6, duck));
    return { rel: rel, duck: duck };
  }
  function triggerSidechain(time, p) {
    if (!nodes.musicDuck) return;
    var sc = sidechainParams(p), g = nodes.musicDuck.gain;
    try {
      g.cancelScheduledValues(time);
      g.setValueAtTime(1, time);
      g.linearRampToValueAtTime(sc.duck, time + 0.008);
      g.exponentialRampToValueAtTime(1, time + sc.rel);
    } catch (e) {}
  }

  var CHORD_PROG = [0, 5, 3, 6];
  var ROMAN_MIN = ["i", "ii", "III", "iv", "v", "VI", "VII"];
  var ROMAN_MAJ = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
  function romansFor(p) {
    var prog = (p.chordProg && p.chordProg.length) ? p.chordProg : CHORD_PROG;
    var m = (p.scale === "major") ? ROMAN_MAJ : ROMAN_MIN;
    return prog.map(function (d) { return m[(((d % 7) + 7) % 7)]; });
  }
  // ---- Stage 6: 16-bar arrangement — which elements are live in each bar ----
  function arrSection(ab) {
    return {
      kick: ab !== 14,                // kick drops out for the mini-break (bar 15)
      clap: ab >= 2 && ab !== 14,     // claps enter with the bass, out in the break
      bass: ab >= 2 && ab !== 14,     // bass from bar 3, out in the break
      chords: ab >= 4,                // chords / hook from bar 5
      lead: ab >= 8                   // lead only in the drop + variation
    };
  }
  function onStep(time) {
    var p = state.active; if (!p) return;
    if (state.pending && state.step % 16 === 0) { state.active = p = state.pending; state.pending = null; }
    var s = state.step % 16, bar = Math.floor(state.step / 16) % 4, arrBar = Math.floor(state.step / 16) % 16;
    RS.step16 = s;
    var sec = arrSection(arrBar);
    var when = time + ((s % 2 === 1) ? (p.swing || 0) * 0.05 : 0);
    try {
      // filter opens through the build, full in the drop, closes in the break
      if (s === 0) {
        var sf = (arrBar < 2) ? 0.55 : (arrBar === 6 || arrBar === 7) ? 0.85 : (arrBar >= 8 && arrBar <= 13) ? 1.08 : (arrBar === 14) ? 0.45 : 1.0;
        try { nodes.chordFilt.frequency.rampTo(p.filterCutoff * sf, 0.35); } catch (e) {}
      }
      if (sec.kick && p.kickPattern[s]) { nodes.kick.triggerAttackRelease("C1", "8n", when, 0.9 + (p.energy - 0.5) * 0.2); nodes.kickClick.triggerAttackRelease("64n", when, 0.9); triggerSidechain(when, p); RS.kick = 1; RS.master = 0.9; }
      if (sec.clap && p.clapPattern[s]) { nodes.snare.triggerAttackRelease("16n", when, 0.55); nodes.snare.triggerAttackRelease("16n", when + 0.008, 0.72); nodes.snare.triggerAttackRelease("16n", when + 0.018, 0.5); RS.snare = 1; }
      if (p.closedHatPattern[s]) { nodes.hat.triggerAttackRelease("32n", when, 0.35 + Math.random() * 0.2); RS.hat = 1; }
      if (p.openHatPattern[s]) { nodes.openHat.triggerAttackRelease("8n", when, 0.5); RS.hat = 1; }
      if (!state.lowPerf && p.percPattern[s]) { nodes.perc.triggerAttackRelease("C4", "32n", when, 0.22); }
      if (sec.bass && p.bassPattern[s]) {
        var bn = noteFor(p, (s % 8 === 4 ? 4 : 0), 1);
        var dur = (p.bass === "roll") ? "16n" : "8n";
        nodes.bass.triggerAttackRelease(bn, dur, when, 0.85);
        nodes.subBass.triggerAttackRelease(bn, dur, when, 0.9);
        RS.bass = 1;
      }
      // chords: arp (trance/melodic) vs block (house/techno)
      if (sec.chords && p.chords !== "none" && p.chordDensity > 0.12) {
        var prog = (p.chordProg && p.chordProg.length) ? p.chordProg : CHORD_PROG;
        var deg = prog[bar % prog.length];
        RS.chordStep = bar % prog.length;
        var triad = [noteFor(p, deg, 3), noteFor(p, deg + 2, 3), noteFor(p, deg + 4, 4)];
        if (p.chords === "arp") {
          if (s % 2 === 0) { nodes.chords.triggerAttackRelease(triad[(s / 2) % 3], "16n", when, 0.5); RS.chord = Math.max(RS.chord, 0.7); }
        } else if (s === 0) {
          nodes.chords.triggerAttackRelease(triad, p.chords === "stab" ? "8n" : "2n", when, 0.62); RS.chord = 1;
        }
      }
      if (sec.lead && !state.lowPerf && p.melody > 0.6 && (s === 2 || s === 7 || s === 12) && Math.random() < 0.55) {
        nodes.lead.triggerAttackRelease(noteFor(p, (bar * 2 + s) % 7, 4), "8n", when, 0.4);
      }
      // build snare-roll on the build bar (7) & the reset fill (15): 8ths -> 16ths, rising
      if (arrBar === 7 || arrBar === 15) {
        if ((s % 2 === 0) || (s >= 8)) { nodes.snare.triggerAttackRelease("16n", when, 0.25 + (s / 15) * 0.55); RS.snare = 1; }
      }
      // ---- FX (Stage 5) re-aligned to the 16-bar scene ----
      if (!state.lowPerf && p.energy > 0.5) {
        if ((arrBar === 7 || arrBar === 15) && s === 0) {   // riser swells over the build bar into the drop / loop reset
          var barDur = (60 / (p.bpm || 124)) * 4;
          nodes.riser.envelope.attack = barDur * 0.92; nodes.riser.triggerAttackRelease(barDur, when, 0.5);
          nodes.riserFilt.frequency.setValueAtTime(400, when); nodes.riserFilt.frequency.linearRampToValueAtTime(9000, when + barDur);
        }
        if (arrBar === 8 && s === 0) {                       // THE DROP — crash + impact
          nodes.crash.triggerAttackRelease("2n", when, 0.7);
          if (p.energy > 0.6) nodes.impact.triggerAttackRelease("C0", "4n", when, 0.9);
        }
      }
    } catch (e) {}
    state.step++;
  }

  function applyProfile(p, ramp) {
    if (!p) return;
    try {
      // kick tone: harder & tighter for dark/high-energy genres
      nodes.kick.set({ octaves: 4 + p.darkness * 5, pitchDecay: 0.02 + (1 - p.energy) * 0.06 });
      // bass voice by style
      var b = p.bass;
      var bt = (b === "sub" || b === "logdrum") ? "sine" : (b === "wobble" || b === "reese") ? "fatsawtooth" : (b === "acid") ? "square" : "sawtooth";
      var benv = (b === "offbeat" || b === "funk") ? { attack: 0.004, decay: 0.13, sustain: 0.12, release: 0.1 }
               : (b === "roll") ? { attack: 0.006, decay: 0.2, sustain: 0.55, release: 0.16 }
               : (b === "wobble" || b === "reese") ? { attack: 0.006, decay: 0.26, sustain: 0.7, release: 0.2 }
               : (b === "acid") ? { attack: 0.005, decay: 0.18, sustain: 0.2, release: 0.12 }
               : { attack: 0.008, decay: 0.3, sustain: 0.5, release: 0.2 };
      var bOsc = (bt === "fatsawtooth") ? { type: "fatsawtooth", count: 3, spread: 40 } : { type: bt };
      nodes.bass.set({ oscillator: bOsc, envelope: benv, filter: { Q: b === "acid" ? 6 : 2 },
        filterEnvelope: { octaves: b === "acid" ? 4 : (b === "offbeat" || b === "funk") ? 3 : 2.5, baseFrequency: b === "sub" ? 55 : (b === "offbeat" || b === "funk") ? 90 : 120 } });
      var subMix = (b === "wobble" || b === "reese") ? 0.55 : (b === "sub" || b === "logdrum") ? 0.14 : (b === "acid") ? 0.22 : 0.32;
      var bwiden = (b === "wobble" || b === "reese") ? 0.64 : 0.52;
      try { nodes.subGain.gain.rampTo(subMix, 0.2); nodes.bassWiden.width.rampTo(bwiden, 0.2); } catch (e) {}
      var chOsc = p.chordVoice === "keys" ? "triangle" : p.chordVoice === "square" ? "square" : p.chordVoice === "supersaw" ? "fatsawtooth" : (p.chords === "stab") ? "square" : "fatsawtooth";
      var chAtk = (p.chords === "pad") ? 0.6 : 0.02, chRel = p.chordVoice === "keys" ? 0.7 : (p.chords === "pad") ? 2.4 : (p.chords === "stab") ? 0.25 : 1.3;
      var chOscOpt = (chOsc === "fatsawtooth") ? { type: "fatsawtooth", count: 7, spread: 36 } : { type: chOsc };
      nodes.chords.set({ oscillator: chOscOpt, envelope: { attack: chAtk, decay: 0.3, sustain: p.chords === "stab" ? 0.2 : 0.6, release: chRel } });
      var chWet = (p.chords === "pad" || p.chordVoice === "supersaw") ? 0.4 : (p.chordVoice === "keys") ? 0.15 : (p.chords === "stab") ? 0.06 : 0.25;
      try { nodes.chorus.wet.rampTo(chWet, 0.3); } catch (e) {}
      // wobble movement (dubstep) vs static cutoff
      var cut = p.filterCutoff * 0.5;
      if (p.bass === "wobble") { nodes.wobble.min = 110; nodes.wobble.max = 1300; try { nodes.wobble.frequency.value = "8n"; } catch (e) {} }
      else { nodes.wobble.min = cut; nodes.wobble.max = cut; }
      nodes.chordFilt.frequency.rampTo(p.filterCutoff, 0.3);
      nodes.reverb.wet.rampTo(p.reverbWet, 0.4);
      nodes.delay.wet.value = p.delayWet;
      try { nodes.bassSat.distortion = Math.min(0.4, p.distortion * 0.5); nodes.drumSat.distortion = Math.min(0.14, 0.04 + p.distortion * 0.12); } catch (e) {}
      var jump = state.active && Math.abs(state.active.bpm - p.bpm) > 24;
      if (jump || !ramp) T.Transport.bpm.value = p.bpm; else T.Transport.bpm.rampTo(p.bpm, 0.5);
      RS.bpm = p.bpm;
    } catch (e) {}
  }

  var API = {
    get supported() { return state.supported; }, get enabled() { return state.enabled; }, get playing() { return state.playing; },
    initialize: function () {
      if (!state.supported) return Promise.resolve(false);
      if (state.initialized) return Promise.resolve(true);
      return T.start().then(function () { build(); state.initialized = true; state.enabled = true; emit("enabled"); return true; }).catch(function () { return false; });
    },
    playGenre: function (p) {
      if (!state.initialized || !p) return;
      state.pending = p; if (!state.active) { state.active = p; state.step = 0; }
      applyProfile(p, true); RS.genreId = p.id; RS.progRomans = romansFor(p);
      if (!state.playing) { try { T.Transport.start(); } catch (e) {} state.playing = true; RS.playing = true; try { nodes.master.gain.rampTo(state.volume * 0.85, 0.4); } catch (e) {} }
      emit("play");
    },
    pause: function () { if (!state.playing) return; try { nodes.master.gain.rampTo(0.0001, 0.2); T.Transport.pause(); } catch (e) {} state.playing = false; RS.playing = false; emit("pause"); },
    resume: function () { if (state.initialized && state.active && !state.playing) API.playGenre(state.active); },
    stop: function () { try { nodes.master.gain.rampTo(0.0001, 0.25); } catch (e) {} setTimeout(function () { try { T.Transport.stop(); T.Transport.position = 0; } catch (e) {} }, 260); state.playing = false; RS.playing = false; state.step = 0; emit("stop"); },
    setVolume: function (v) { state.volume = Math.max(0, Math.min(1, +v || 0)); try { if (state.playing) nodes.master.gain.rampTo(state.volume * 0.85, 0.1); } catch (e) {} emit("volume"); },
    getVolume: function () { return state.volume; },
    getReactiveState: function () { return RS; },
    strumChord: function (i) {
      var p = state.active; if (!p || !state.initialized) return;
      try {
        var prog = (p.chordProg && p.chordProg.length) ? p.chordProg : CHORD_PROG;
        var deg = prog[(((i % prog.length) + prog.length) % prog.length)];
        var triad = [noteFor(p, deg, 3), noteFor(p, deg + 2, 3), noteFor(p, deg + 4, 4)];
        nodes.chords.triggerAttackRelease(triad, "4n", (T.now ? T.now() : undefined), 0.7); RS.chord = 1;
      } catch (e) {}
    },
    onChange: function (fn) { if (typeof fn === "function") state.listeners.push(fn); },
    destroy: function () { try { T.Transport.stop(); T.Transport.cancel(); } catch (e) {} Object.keys(nodes).forEach(function (k) { try { nodes[k].dispose(); } catch (e) {} }); nodes = {}; state.initialized = false; state.playing = false; RS.playing = false; }
  };

  try {
    var wasP = false;
    document.addEventListener("visibilitychange", function () {
      if (!state.initialized) return;
      if (document.hidden) { wasP = state.playing; if (state.playing) API.pause(); }
      else if (wasP && state.active) { API.playGenre(state.active); }
    });
  } catch (e) {}

  root.BeatGenomeAudio = API;
})(typeof window !== "undefined" ? window : this);
