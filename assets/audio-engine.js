/* ============================================================
   BeatGenome — audio-engine.js  (V19 / genre engines: 7 dedicated bass engines (house/acid/reese/wobble/psy/logdrum/sub808) + per-family drum presets)
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
    nodes.masterEQ = new T.EQ3(0, 0, 0).connect(nodes.limiter);         // per-genre master tone
    nodes.masterComp = new T.Compressor({ threshold: -14, ratio: 2.5, attack: 0.006, release: 0.16 }).connect(nodes.masterEQ);
    nodes.master = new T.Gain(0.0001).connect(nodes.masterComp);        // volume node

    // FX bus (reverb + delay) — 100% WET effects fed by dedicated parallel send gains (no dry doubling)
    nodes.reverb = new T.Reverb({ decay: state.lowPerf ? 1.0 : 2.4, wet: 1 }).connect(nodes.master);
    nodes.delay = new T.FeedbackDelay("8n.", 0.22); nodes.delay.wet.value = 1; nodes.delay.connect(nodes.master);
    nodes.reverbSend = new T.Gain(0.3).connect(nodes.reverb);   // send amount = old reverbWet
    nodes.delaySend = new T.Gain(0.15).connect(nodes.delay);    // send amount = old delayWet

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
    if (!state.lowPerf) {   // techno rumble: kick tail fed into a short reverb + lowpass = rolling sub-rumble
      nodes.rumbleFilt = new T.Filter(150, "lowpass").connect(nodes.drumBus);
      nodes.rumbleVerb = new T.Reverb({ decay: 1.4, wet: 1 }).connect(nodes.rumbleFilt);
      nodes.rumbleGain = new T.Gain(0); nodes.rumbleGain.connect(nodes.rumbleVerb); nodes.kick.connect(nodes.rumbleGain);
    }

    // ---- bass bus: CHARACTER layer (ducked, saturated, stereo-widened) ----
    // HP crossover at 120Hz: nothing below the crossover reaches the stereo widener → sub stays mono/centered.
    nodes.bassWiden = new T.StereoWidener(0.5).connect(nodes.musicDuck);
    nodes.bassSat = new T.Distortion(0).connect(nodes.bassWiden);
    nodes.bassEQ = new T.EQ3(0, -1, -2).connect(nodes.bassSat);
    nodes.bassHP = new T.Filter(120, "highpass").connect(nodes.bassEQ);   // keep sub band mono (below crossover) out of the widened layer
    nodes.bassFilt = new T.Filter(600, "lowpass").connect(nodes.bassHP);
    nodes.bass = new T.MonoSynth({ oscillator: { type: "sawtooth" }, filter: { Q: 2 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 }, filterEnvelope: { attack: 0.01, decay: 0.2, baseFrequency: 120, octaves: 2.5 } });
    nodes.bassGain = new T.Gain(0.5); nodes.bass.connect(nodes.bassGain); nodes.bassGain.connect(nodes.bassFilt);
    nodes.wobble = new T.LFO("8n", 300, 300).connect(nodes.bassFilt.frequency); nodes.wobble.start();  // static unless wobble genre
    // ---- SUB layer (ducked, clean sine, mono/centered — owns the fundamental) ----
    nodes.subFilt = new T.Filter(110, "lowpass").connect(nodes.musicDuck);
    nodes.subBass = new T.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.006, decay: 0.24, sustain: 0.7, release: 0.18 } });
    nodes.subGain = new T.Gain(0); nodes.subBass.connect(nodes.subGain); nodes.subGain.connect(nodes.subFilt);
    // ---- log-drum engine layers: percussive MembraneSynth body (mono, ducked) + tonal sine tail (into sub bus) ----
    nodes.logBody = new T.MembraneSynth({ pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } });
    nodes.logGain = new T.Gain(0).connect(nodes.musicDuck); nodes.logBody.connect(nodes.logGain);
    nodes.logTail = new T.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.003, decay: 0.3, sustain: 0.15, release: 0.28 } });
    nodes.logTailGain = new T.Gain(0).connect(nodes.subFilt); nodes.logTail.connect(nodes.logTailGain);

    // ---- chords + lead (ducked, dry) with parallel FX sends ----
    nodes.musicBus = new T.Gain(1).connect(nodes.musicDuck);
    nodes.chordFilt = new T.Filter(1200, "lowpass");
    nodes.chordFilt.connect(nodes.musicBus); nodes.chordFilt.connect(nodes.reverbSend); nodes.chordFilt.connect(nodes.delaySend);
    nodes.chorus = new T.Chorus({ frequency: 1.4, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0 }); try { nodes.chorus.start(); } catch (e) {} nodes.chorus.connect(nodes.chordFilt);
    nodes.chords = new T.PolySynth(T.Synth); nodes.chords.maxPolyphony = state.lowPerf ? 4 : 8;
    nodes.chords.set({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 1.4 } });
    nodes.chordGain = new T.Gain(0.32); nodes.chords.connect(nodes.chordGain); nodes.chordGain.connect(nodes.chorus);
    nodes.lead = new T.FMSynth({ harmonicity: 2, modulationIndex: 6, envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.4 } });
    nodes.leadGain = new T.Gain(0.1); nodes.lead.connect(nodes.leadGain); nodes.leadGain.connect(nodes.musicBus); nodes.leadGain.connect(nodes.delaySend);

    // ---- FX layer (Stage 5): risers, crash, low impact — routed post-duck (not pumped) ----
    nodes.fxBus = new T.Gain(0.6).connect(nodes.master); nodes.fxBus.connect(nodes.reverbSend);
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
    if (state.pending && state.step % 16 === 0) {   // apply the queued genre ON the bar boundary (sound design + BPM, not just patterns)
      applyProfile(state.pending, true);            // reads OLD state.active for the BPM-jump test, then we swap
      state.active = p = state.pending; state.pending = null;
      RS.genreId = p.id; RS.progRomans = romansFor(p);
    }
    var s = state.step % 16, bar = Math.floor(state.step / 16) % 4, arrBar = Math.floor(state.step / 16) % 16;
    RS.step16 = s;
    var sec = arrSection(arrBar);
    var when = time + ((s % 2 === 1) ? (p.swing || 0) * 0.05 : 0);
    try {
      // filter opens through the build, full in the drop, closes in the break
      if (s === 0) {
        var sf = (arrBar < 2) ? 0.55 : (arrBar === 6 || arrBar === 7) ? 0.85 : (arrBar >= 8 && arrBar <= 13) ? 1.08 : (arrBar === 14) ? 0.45 : 1.0;
        try { nodes.chordFilt.frequency.rampTo(p.filterCutoff * sf, 0.35); } catch (e) {}
        updateBassMotion(p, arrBar);   // reese/wobble LFO phrase automation
      }
      if (sec.kick && p.kickPattern[s]) { nodes.kick.triggerAttackRelease("C1", "8n", when, 0.9 + (p.energy - 0.5) * 0.2); nodes.kickClick.triggerAttackRelease("64n", when, 0.9); triggerSidechain(when, p); RS.kick = 1; RS.master = 0.9; }
      if (sec.clap && p.clapPattern[s]) { nodes.snare.triggerAttackRelease("16n", when, 0.55); nodes.snare.triggerAttackRelease("16n", when + 0.008, 0.72); nodes.snare.triggerAttackRelease("16n", when + 0.018, 0.5); RS.snare = 1; }
      if (p.closedHatPattern[s]) { nodes.hat.triggerAttackRelease("32n", when, 0.35 + Math.random() * 0.2); RS.hat = 1; }
      if (p.openHatPattern[s]) { nodes.openHat.triggerAttackRelease("8n", when, 0.5); RS.hat = 1; }
      if (!state.lowPerf && p.percPattern[s]) { nodes.perc.triggerAttackRelease("C4", "32n", when, 0.22); }
      if (sec.bass && p.bassPattern[s]) {
        triggerBass(p, s, arrBar, when);
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

  // ============================================================
  //  V19 — dedicated bass engines + per-family drum presets
  // ============================================================
  function selectBassEngine(p) {
    var b = p.bass, fam = p.family, id = p.id || "";
    if (b === "acid") return "acid";
    if (b === "reese") return "reese";
    if (b === "wobble") return "wobble";
    if (b === "logdrum") return "logdrum";
    if (b === "sub") return "sub808";
    if (b === "roll") {   // psytrance rolls are their own KBBB engine; techno/hardcore rolls use the house pluck
      if (fam === "trance" && (/psy|goa|forest|fullon|full ?on|dark/.test(id) || p.energy > 0.85)) return "psy";
      return "housePluck";
    }
    return "housePluck";   // offbeat, funk, default
  }

  function configureBassEngine(eng, p) {
    var cut = p.filterCutoff * 0.5, osc, env, fenv, Q = 2, subMix = 0.3, width = 0.5;
    // log layers only audible for the logdrum engine
    try { nodes.logGain.gain.rampTo(eng === "logdrum" ? 0.5 : 0, 0.2); nodes.logTailGain.gain.rampTo(eng === "logdrum" ? 0.3 : 0, 0.2); } catch (e) {}
    // static character-filter unless a movement engine drives the LFO
    if (eng !== "wobble" && eng !== "reese") { nodes.wobble.min = cut; nodes.wobble.max = cut; }
    if (eng === "acid") {
      osc = { type: "square" }; env = { attack: 0.004, decay: 0.18, sustain: 0.2, release: 0.1 };
      fenv = { attack: 0.002, decay: 0.16, sustain: 0.05, release: 0.08, baseFrequency: 90, octaves: 4 };
      Q = 7; subMix = 0.2; width = 0.35;
    } else if (eng === "psy") {
      osc = { type: "sawtooth" }; env = { attack: 0.001, decay: 0.075, sustain: 0.02, release: 0.035 };
      fenv = { attack: 0.001, decay: 0.07, sustain: 0, release: 0.025, baseFrequency: 80, octaves: 2.8 };
      Q = 1.5; subMix = 0.28; width = 0.12;
      p.bassPattern = [0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1];   // KBBB — bass fills the three 16ths after each kick
    } else if (eng === "reese") {
      osc = { type: "fatsawtooth", count: 3, spread: 40 }; env = { attack: 0.006, decay: 0.26, sustain: 0.7, release: 0.2 };
      fenv = { attack: 0.02, decay: 0.2, sustain: 0.4, baseFrequency: 160, octaves: 2.5 };
      Q = 2.5; subMix = 0.55; width = 0.66;
    } else if (eng === "wobble") {
      osc = { type: "fatsawtooth", count: 3, spread: 40 }; env = { attack: 0.006, decay: 0.26, sustain: 0.7, release: 0.2 };
      fenv = { attack: 0.01, decay: 0.2, sustain: 0.5, baseFrequency: 120, octaves: 2.5 };
      Q = 4; subMix = 0.5; width = 0.6;
    } else if (eng === "sub808") {
      osc = { type: "sine" }; env = { attack: 0.006, decay: 0.3, sustain: 0.8, release: 0.3 };
      fenv = { attack: 0.01, decay: 0.2, baseFrequency: 55, octaves: 2 };
      Q = 1; subMix = 0.5; width = 0.2;
      try { nodes.subBass.set({ envelope: { attack: 0.008, decay: 0.32, sustain: 0.85, release: 0.35 } }); } catch (e) {}
    } else if (eng === "logdrum") {
      osc = { type: "sine" }; env = { attack: 0.004, decay: 0.2, sustain: 0.1, release: 0.15 };
      fenv = { attack: 0.01, decay: 0.2, baseFrequency: 70, octaves: 2 };
      Q = 1; subMix = 0.14; width = 0.25;
      try { nodes.logBody.set({ pitchDecay: 0.06, octaves: 4 }); } catch (e) {}
    } else {   // housePluck (also techno/hardcore roll, offbeat, funk)
      var roll = (p.bass === "roll");
      osc = { type: "sawtooth" };
      env = roll ? { attack: 0.006, decay: 0.2, sustain: 0.5, release: 0.16 }
                 : { attack: 0.004, decay: 0.12, sustain: 0.08, release: 0.09 };
      fenv = { attack: 0.002, decay: 0.15, sustain: 0.05, release: 0.08,
               baseFrequency: (p.bass === "offbeat" || p.bass === "funk") ? 90 : 75, octaves: 3 };
      Q = 2.5; subMix = 0.3; width = 0.5;
    }
    try {
      nodes.bass.set({ oscillator: osc, envelope: env, filter: { Q: Q }, portamento: 0, filterEnvelope: fenv });
      nodes.subGain.gain.rampTo(subMix, 0.2);
      nodes.bassWiden.width.rampTo(width, 0.2);
    } catch (e) {}
  }

  function updateBassMotion(p, arrBar) {
    var eng = nodes.bassEngine;
    if (!nodes.wobble || (eng !== "wobble" && eng !== "reese")) return;
    try {
      if (eng === "wobble") {                       // LFO rate steps through the phrase (2n..16n)
        var rates = ["4n", "8n", "8t", "16n"];
        nodes.wobble.frequency.value = rates[arrBar % rates.length];
        nodes.wobble.min = 90; nodes.wobble.max = 1400;
      } else {                                       // reese — slow evolving/reversing filter movement
        var q = arrBar % 4;
        nodes.wobble.min = 180 + q * 40; nodes.wobble.max = 900 + q * 220;
        nodes.wobble.frequency.value = (q % 2 === 0) ? "2n" : "1n";
      }
    } catch (e) {}
  }

  function bassNote(p, s) {
    var deg = (s % 8 === 4) ? 4 : (s % 16 === 14) ? 5 : 0;   // root, with a 5th on the '&', octave-ish lift near the turnaround
    return noteFor(p, deg, 1);
  }
  function triggerBass(p, s, arrBar, when) {
    var eng = nodes.bassEngine || "housePluck", note = bassNote(p, s);
    try {
      if (eng === "acid") {
        var acc = (s % 8 === 3 || s % 8 === 6), slide = (s % 8 === 6);
        nodes.bass.set({ portamento: slide ? 0.06 : 0, filterEnvelope: { octaves: acc ? 5.5 : 4, baseFrequency: 90 } });
        nodes.bass.triggerAttackRelease(note, slide ? "8n" : "16n", when, acc ? 0.98 : 0.7);
      } else if (eng === "psy") {
        var pos = s % 4, v = (pos === 1) ? 0.76 : (pos === 2) ? 0.9 : 0.82;   // first note after the kick is softer
        nodes.bass.triggerAttackRelease(note, "16n", when, v);
      } else if (eng === "reese") {
        nodes.bass.triggerAttackRelease(note, "8n", when, 0.85);
        nodes.subBass.triggerAttackRelease(note, "8n", when, 0.9);
      } else if (eng === "wobble") {
        nodes.bass.triggerAttackRelease(note, "4n", when, 0.9);
        nodes.subBass.triggerAttackRelease(note, "4n", when, 0.9);
      } else if (eng === "sub808") {
        nodes.subBass.set({ portamento: 0.04 });
        nodes.subBass.triggerAttackRelease(note, "4n", when, 0.95);
        nodes.bass.triggerAttackRelease(note, "16n", when, 0.22);   // faint transient click
      } else if (eng === "logdrum") {
        nodes.logBody.triggerAttackRelease(note, "8n", when, 0.9);
        nodes.logTail.triggerAttackRelease(note, "8n", when, 0.5);
      } else {   // housePluck
        var roll = (p.bass === "roll"), dur = roll ? "16n" : "8n";
        nodes.bass.triggerAttackRelease(note, dur, when, 0.82 + (s % 4 === 0 ? 0.06 : 0));
        if (nodes.subGain.gain.value > 0.02) nodes.subBass.triggerAttackRelease(note, dur, when, 0.85);
      }
    } catch (e) {}
  }

  // ---- per-family drum presets ----
  function selectDrumKit(p) {
    var fam = p.family, id = p.id || "";
    if (fam === "ambient") return "ambient";
    if (fam === "dnb") return /jungle/.test(id) ? "jungle" : "dnb";
    if (fam === "dubstep") return /riddim/.test(id) ? "riddim" : "dubstep";
    if (fam === "trance") return /psy|goa|forest|fullon|full ?on/.test(id) ? "psytrance" : "trance";
    if (fam === "techno") return "techno";
    if (fam === "breaks") return "breaks";
    if (fam === "garage") return "garage";
    if (fam === "hardcore") return /hardstyle/.test(id) ? "hardstyle" : "hardcore";
    if (fam === "trap") return /future/.test(id) ? "futurebass" : "trap";
    if (/amapiano|piano|afro/.test(id)) return "amapiano";
    if (/deep/.test(id)) return "deephouse";
    if (/tech/.test(id)) return "techhouse";
    return "house";
  }
  var DRUMKITS = {
    house:     { kick: { octaves: 5,   pitchDecay: 0.03,  decay: 0.30 }, snareF: 1600, snareDecay: 0.16, hatDecay: 0.030, hatGain: 0.32, openHat: 0.24, perc: 0.12, click: 0.14, sat: 0.05 },
    deephouse: { kick: { octaves: 4.5, pitchDecay: 0.05,  decay: 0.40 }, snareF: 1400, snareDecay: 0.20, hatDecay: 0.040, hatGain: 0.24, openHat: 0.20, perc: 0.10, click: 0.10, sat: 0.04 },
    techhouse: { kick: { octaves: 5.5, pitchDecay: 0.02,  decay: 0.24 }, snareF: 1900, snareDecay: 0.12, hatDecay: 0.028, hatGain: 0.34, openHat: 0.20, perc: 0.16, click: 0.16, sat: 0.06 },
    techno:    { kick: { octaves: 5,   pitchDecay: 0.03,  decay: 0.42 }, snareF: 1500, snareDecay: 0.14, hatDecay: 0.035, hatGain: 0.30, openHat: 0.26, perc: 0.16, click: 0.16, sat: 0.10 },
    trance:    { kick: { octaves: 6,   pitchDecay: 0.02,  decay: 0.30 }, snareF: 2000, snareDecay: 0.16, hatDecay: 0.030, hatGain: 0.34, openHat: 0.30, perc: 0.12, click: 0.16, sat: 0.05 },
    psytrance: { kick: { octaves: 6,   pitchDecay: 0.015, decay: 0.26 }, snareF: 2200, snareDecay: 0.10, hatDecay: 0.025, hatGain: 0.32, openHat: 0.22, perc: 0.20, click: 0.18, sat: 0.06 },
    dnb:       { kick: { octaves: 5,   pitchDecay: 0.02,  decay: 0.20 }, snareF: 1800, snareDecay: 0.22, hatDecay: 0.030, hatGain: 0.32, openHat: 0.22, perc: 0.18, click: 0.14, sat: 0.08 },
    jungle:    { kick: { octaves: 4.5, pitchDecay: 0.03,  decay: 0.18 }, snareF: 1700, snareDecay: 0.24, hatDecay: 0.028, hatGain: 0.30, openHat: 0.20, perc: 0.20, click: 0.12, sat: 0.10 },
    dubstep:   { kick: { octaves: 5,   pitchDecay: 0.05,  decay: 0.28 }, snareF: 1400, snareDecay: 0.26, hatDecay: 0.030, hatGain: 0.24, openHat: 0.18, perc: 0.12, click: 0.14, sat: 0.12 },
    riddim:    { kick: { octaves: 5,   pitchDecay: 0.04,  decay: 0.24 }, snareF: 1500, snareDecay: 0.22, hatDecay: 0.028, hatGain: 0.24, openHat: 0.16, perc: 0.12, click: 0.16, sat: 0.14 },
    breaks:    { kick: { octaves: 5,   pitchDecay: 0.03,  decay: 0.26 }, snareF: 1700, snareDecay: 0.20, hatDecay: 0.032, hatGain: 0.34, openHat: 0.24, perc: 0.20, click: 0.14, sat: 0.08 },
    garage:    { kick: { octaves: 5,   pitchDecay: 0.03,  decay: 0.26 }, snareF: 1800, snareDecay: 0.18, hatDecay: 0.030, hatGain: 0.36, openHat: 0.26, perc: 0.18, click: 0.14, sat: 0.06 },
    amapiano:  { kick: { octaves: 4.5, pitchDecay: 0.05,  decay: 0.36 }, snareF: 1500, snareDecay: 0.16, hatDecay: 0.050, hatGain: 0.30, openHat: 0.22, perc: 0.22, click: 0.10, sat: 0.04 },
    hardcore:  { kick: { octaves: 4,   pitchDecay: 0.02,  decay: 0.34 }, snareF: 1600, snareDecay: 0.14, hatDecay: 0.030, hatGain: 0.30, openHat: 0.20, perc: 0.14, click: 0.18, sat: 0.30 },
    hardstyle: { kick: { octaves: 3.5, pitchDecay: 0.06,  decay: 0.50 }, snareF: 1500, snareDecay: 0.16, hatDecay: 0.030, hatGain: 0.28, openHat: 0.20, perc: 0.12, click: 0.16, sat: 0.28 },
    trap:      { kick: { octaves: 6,   pitchDecay: 0.06,  decay: 0.50 }, snareF: 1500, snareDecay: 0.20, hatDecay: 0.020, hatGain: 0.30, openHat: 0.16, perc: 0.12, click: 0.12, sat: 0.06 },
    futurebass:{ kick: { octaves: 5.5, pitchDecay: 0.03,  decay: 0.32 }, snareF: 1800, snareDecay: 0.20, hatDecay: 0.025, hatGain: 0.32, openHat: 0.24, perc: 0.14, click: 0.14, sat: 0.05 },
    ambient:   { kick: { octaves: 4,   pitchDecay: 0.08,  decay: 0.50 }, snareF: 1200, snareDecay: 0.30, hatDecay: 0.060, hatGain: 0.14, openHat: 0.14, perc: 0.08, click: 0.06, sat: 0.03 }
  };
  function applyDrumPreset(kitId, p) {
    var k = DRUMKITS[kitId] || DRUMKITS.house;
    try {
      nodes.kick.set({ octaves: k.kick.octaves, pitchDecay: k.kick.pitchDecay, envelope: { attack: 0.001, decay: k.kick.decay, sustain: 0 } });
      nodes.snareFilt.frequency.rampTo(k.snareF, 0.2);
      nodes.snare.set({ envelope: { attack: 0.001, decay: k.snareDecay, sustain: 0 } });
      nodes.hat.set({ envelope: { attack: 0.001, decay: k.hatDecay, sustain: 0 } });
      nodes.hatGain.gain.rampTo(k.hatGain, 0.2);
      nodes.openHatGain.gain.rampTo(k.openHat, 0.2);
      nodes.percGain.gain.rampTo(k.perc, 0.2);
      nodes.kickClickGain.gain.rampTo(k.click, 0.2);
      if (nodes.drumSat) nodes.drumSat.distortion = Math.min(0.5, k.sat + p.distortion * 0.15);
      nodes.drumKit = kitId;
    } catch (e) {}
  }

  function applyProfile(p, ramp) {
    if (!p) return;
    try {
      // per-genre master tone: bright for melodic/low-dark, warm & dark for high-dark
      try { nodes.masterEQ.high.rampTo(2.5 - p.darkness * 5, 0.4); nodes.masterEQ.low.rampTo((p.warmth - 0.5) * 3, 0.4); } catch (e) {}
      // techno rumble send: four-on-the-floor + dark genres get a rolling sub-rumble
      try { if (nodes.rumbleGain) nodes.rumbleGain.gain.rampTo((p.kick === "four" && p.darkness > 0.55) ? Math.min(0.5, (p.darkness - 0.5) * 0.9) : 0, 0.3); } catch (e) {}
      // ---- per-family drum preset (kick/snare/hat/perc tone + levels) ----
      applyDrumPreset(selectDrumKit(p), p);
      // ---- dedicated bass engine (house / acid / reese / wobble / psy / logdrum / sub808) ----
      nodes.bassEngine = selectBassEngine(p);
      configureBassEngine(nodes.bassEngine, p);
      // ---- genre-matched chord voice (keys / organ-stab / supersaw / pad / saw) ----
      var cv = p.chordVoice, chOscOpt, chEnv, chWet;
      if (cv === "supersaw") {                                                     // trance / prog / big room / future
        chOscOpt = { type: "fatsawtooth", count: 7, spread: 36 };
        chEnv = { attack: (p.chords === "pad") ? 0.5 : 0.02, decay: 0.3, sustain: 0.65, release: (p.chords === "pad") ? 2.2 : 1.3 };
        chWet = 0.42;
      } else if (cv === "keys") {                                                  // house / disco / amapiano — FM Rhodes / e-piano
        chOscOpt = { type: "fmsine", harmonicity: 1.5, modulationIndex: 2.2 };
        chEnv = { attack: 0.005, decay: 0.5, sustain: 0.32, release: 0.8 };
        chWet = 0.2;
      } else if (cv === "square") {                                                // classic house / garage organ-stab
        chOscOpt = { type: "square" };
        chEnv = { attack: 0.004, decay: 0.22, sustain: 0.2, release: 0.28 };
        chWet = 0.12;
      } else if (cv === "pad") {                                                   // ambient / deep / melodic / dub techno — soft warm pad
        chOscOpt = { type: "fatsawtooth", count: 3, spread: 18 };
        chEnv = { attack: 0.7, decay: 0.4, sustain: 0.8, release: 2.6 };
        chWet = 0.5;
      } else {                                                                     // saw (default)
        chOscOpt = { type: "sawtooth" };
        chEnv = { attack: 0.02, decay: 0.3, sustain: 0.6, release: 1.2 };
        chWet = 0.25;
      }
      nodes.chords.set({ oscillator: chOscOpt, envelope: chEnv });
      try { nodes.chorus.wet.rampTo(chWet, 0.3); } catch (e) {}
      nodes.chordFilt.frequency.rampTo(p.filterCutoff, 0.3);
      try { nodes.reverbSend.gain.rampTo(p.reverbWet, 0.4); nodes.delaySend.gain.rampTo(p.delayWet, 0.3); } catch (e) {}
      try { nodes.bassSat.distortion = Math.min(0.4, p.distortion * 0.5); } catch (e) {}   // drumSat now owned by applyDrumPreset
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
      if (!state.active) {                    // cold start — apply immediately so the first genre is ready
        state.active = p; state.step = 0; state.pending = null;
        applyProfile(p, false); RS.genreId = p.id; RS.progRomans = romansFor(p);
      } else if (!state.playing) {            // switching while stopped — no onStep to swap, so apply now
        state.active = p; state.pending = null;
        applyProfile(p, true); RS.genreId = p.id; RS.progRomans = romansFor(p);
      } else {                                // switching while playing — queue; onStep applies on the next bar boundary
        state.pending = p;
      }
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
