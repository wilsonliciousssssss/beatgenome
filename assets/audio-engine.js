/* ============================================================
   BeatGenome — audio-engine.js  (V09: more genre-accurate)
   Procedural, in-browser genre audio on Tone.js.
   window.BeatGenomeAudio. App works fully if Tone.js is missing.
   ============================================================ */
(function (root) {
  "use strict";
  var T = root.Tone;
  var RS = { kick: 0, snare: 0, hat: 0, bass: 0, chord: 0, master: 0, playing: false, bpm: 124, genreId: null };
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
    nodes.master = new T.Gain(0.0001).connect(nodes.limiter);
    nodes.reverb = new T.Reverb({ decay: state.lowPerf ? 1.0 : 2.4, wet: 0.3 }).connect(nodes.master);
    nodes.delay = new T.FeedbackDelay("8n.", 0.22); nodes.delay.wet.value = 0.15; nodes.delay.connect(nodes.master);

    nodes.drive = new T.Distortion(0).connect(nodes.master);            // per-genre grit
    nodes.drumBus = new T.Gain(0.9).connect(nodes.drive);
    nodes.kick = new T.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0 } }).connect(nodes.drumBus);
    nodes.snare = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } });
    nodes.snareFilt = new T.Filter(1800, "bandpass").connect(nodes.drumBus); nodes.snare.connect(nodes.snareFilt);
    nodes.hat = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 } });
    nodes.hatFilt = new T.Filter(8000, "highpass").connect(nodes.drumBus); nodes.hatGain = new T.Gain(0.32); nodes.hat.connect(nodes.hatGain); nodes.hatGain.connect(nodes.hatFilt);
    nodes.perc = new T.MetalSynth({ frequency: 250, envelope: { attack: 0.001, decay: 0.12, release: 0.01 }, harmonicity: 5.1, resonance: 4000, octaves: 1.4 });
    nodes.percGain = new T.Gain(0.1).connect(nodes.drumBus); nodes.perc.connect(nodes.percGain);

    nodes.bassFilt = new T.Filter(600, "lowpass").connect(nodes.drive);
    nodes.bass = new T.MonoSynth({ oscillator: { type: "sawtooth" }, filter: { Q: 2 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 }, filterEnvelope: { attack: 0.01, decay: 0.2, baseFrequency: 120, octaves: 2.5 } });
    nodes.bassGain = new T.Gain(0.5); nodes.bass.connect(nodes.bassGain); nodes.bassGain.connect(nodes.bassFilt);
    nodes.wobble = new T.LFO("8n", 300, 300).connect(nodes.bassFilt.frequency); nodes.wobble.start();  // static unless wobble genre

    nodes.chordFilt = new T.Filter(1200, "lowpass").connect(nodes.reverb); nodes.chordFilt.connect(nodes.delay);
    nodes.chords = new T.PolySynth(T.Synth); nodes.chords.maxPolyphony = state.lowPerf ? 4 : 8;
    nodes.chords.set({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 1.4 } });
    nodes.chordGain = new T.Gain(0.15); nodes.chords.connect(nodes.chordGain); nodes.chordGain.connect(nodes.chordFilt);

    nodes.lead = new T.FMSynth({ harmonicity: 2, modulationIndex: 6, envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.4 } });
    nodes.leadGain = new T.Gain(0.1).connect(nodes.delay); nodes.lead.connect(nodes.leadGain);

    T.Transport.scheduleRepeat(onStep, "16n");
  }

  var CHORD_PROG = [0, 5, 3, 6];
  function onStep(time) {
    var p = state.active; if (!p) return;
    if (state.pending && state.step % 16 === 0) { state.active = p = state.pending; state.pending = null; }
    var s = state.step % 16, bar = Math.floor(state.step / 16) % 4;
    var when = time + ((s % 2 === 1) ? (p.swing || 0) * 0.05 : 0);
    try {
      if (p.kickPattern[s]) { nodes.kick.triggerAttackRelease("C1", "8n", when, 0.9 + (p.energy - 0.5) * 0.2); RS.kick = 1; RS.master = 0.9; }
      if (p.clapPattern[s]) { nodes.snare.triggerAttackRelease("16n", when, 0.8); RS.snare = 1; }
      if (p.closedHatPattern[s]) { nodes.hat.triggerAttackRelease("32n", when, 0.35 + Math.random() * 0.2); RS.hat = 1; }
      if (p.openHatPattern[s]) { nodes.hat.triggerAttackRelease("16n", when, 0.5); RS.hat = 1; }
      if (!state.lowPerf && p.percPattern[s]) { nodes.perc.triggerAttackRelease("C4", "32n", when, 0.22); }
      if (p.bassPattern[s]) {
        var bn = noteFor(p, (s % 8 === 4 ? 4 : 0), p.bass === "sub" ? 1 : 1);
        var dur = (p.bass === "roll") ? "16n" : (p.bass === "wobble" || p.bass === "reese") ? "8n" : "8n";
        nodes.bass.triggerAttackRelease(bn, dur, when, 0.85); RS.bass = 1;
      }
      // chords: arp (trance/melodic) vs block (house/techno)
      if (p.chords !== "none" && p.chordDensity > 0.12) {
        var prog = (p.chordProg && p.chordProg.length) ? p.chordProg : CHORD_PROG;
        var deg = prog[bar % prog.length];
        var triad = [noteFor(p, deg, 3), noteFor(p, deg + 2, 3), noteFor(p, deg + 4, 4)];
        if (p.chords === "arp") {
          if (s % 2 === 0) { nodes.chords.triggerAttackRelease(triad[(s / 2) % 3], "16n", when, 0.4); RS.chord = Math.max(RS.chord, 0.7); }
        } else if (s === 0) {
          nodes.chords.triggerAttackRelease(triad, p.chords === "stab" ? "8n" : "2n", when, 0.5); RS.chord = 1;
        }
      }
      if (!state.lowPerf && p.melody > 0.6 && (s === 2 || s === 7 || s === 12) && Math.random() < 0.55) {
        nodes.lead.triggerAttackRelease(noteFor(p, (bar * 2 + s) % 7, 4), "8n", when, 0.4);
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
      var bt = (p.bass === "sub" || p.bass === "logdrum") ? "sine" : (p.bass === "wobble" || p.bass === "reese") ? "fatsawtooth" : (p.bass === "acid") ? "square" : "sawtooth";
      nodes.bass.set({ oscillator: { type: bt } });
      nodes.bass.set({ filter: { Q: p.bass === "acid" ? 6 : 2 }, filterEnvelope: { octaves: p.bass === "acid" ? 4 : 2.5, baseFrequency: p.bass === "sub" ? 55 : 120 } });
      var chOsc = p.chordVoice === "keys" ? "triangle" : p.chordVoice === "square" ? "square" : p.chordVoice === "supersaw" ? "fatsawtooth" : (p.chords === "stab") ? "square" : "fatsawtooth";
      var chAtk = (p.chords === "pad") ? 0.6 : 0.02, chRel = p.chordVoice === "keys" ? 0.7 : (p.chords === "pad") ? 2.4 : (p.chords === "stab") ? 0.25 : 1.3;
      nodes.chords.set({ oscillator: { type: chOsc }, envelope: { attack: chAtk, decay: 0.3, sustain: p.chords === "stab" ? 0.2 : 0.6, release: chRel } });
      // wobble movement (dubstep) vs static cutoff
      var cut = p.filterCutoff * 0.5;
      if (p.bass === "wobble") { nodes.wobble.min = 110; nodes.wobble.max = 1300; try { nodes.wobble.frequency.value = "8n"; } catch (e) {} }
      else { nodes.wobble.min = cut; nodes.wobble.max = cut; }
      nodes.chordFilt.frequency.rampTo(p.filterCutoff, 0.3);
      nodes.reverb.wet.rampTo(p.reverbWet, 0.4);
      nodes.delay.wet.value = p.delayWet;
      nodes.drive.distortion = Math.min(0.45, p.distortion * 0.5);
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
      applyProfile(p, true); RS.genreId = p.id;
      if (!state.playing) { try { T.Transport.start(); } catch (e) {} state.playing = true; RS.playing = true; try { nodes.master.gain.rampTo(state.volume * 0.85, 0.4); } catch (e) {} }
      emit("play");
    },
    pause: function () { if (!state.playing) return; try { nodes.master.gain.rampTo(0.0001, 0.2); T.Transport.pause(); } catch (e) {} state.playing = false; RS.playing = false; emit("pause"); },
    resume: function () { if (state.initialized && state.active && !state.playing) API.playGenre(state.active); },
    stop: function () { try { nodes.master.gain.rampTo(0.0001, 0.25); } catch (e) {} setTimeout(function () { try { T.Transport.stop(); T.Transport.position = 0; } catch (e) {} }, 260); state.playing = false; RS.playing = false; state.step = 0; emit("stop"); },
    setVolume: function (v) { state.volume = Math.max(0, Math.min(1, +v || 0)); try { if (state.playing) nodes.master.gain.rampTo(state.volume * 0.85, 0.1); } catch (e) {} emit("volume"); },
    getVolume: function () { return state.volume; },
    getReactiveState: function () { return RS; },
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
