/* ============================================================
   BeatGenome — audio-profiles.js
   Pure logic: turn a genre's data into a normalized, deterministic
   audio profile. No Tone.js, no DOM. Safe to unit-test in Node.
   Exposes window.BeatGenomeProfiles.
   ============================================================ */
(function (root) {
  "use strict";

  // ---- seeded RNG (deterministic per genre) ----
  function hashString(s) {
    s = String(s || "");
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- numeric helpers ----
  function clamp(v, lo, hi) { v = +v; if (isNaN(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

  function parseBpm(value, fallback) {
    fallback = fallback || 124;
    var n;
    if (typeof value === "number" && isFinite(value)) n = value;
    else {
      var nums = (String(value == null ? "" : value).match(/\d{2,3}/g) || [])
        .map(Number).filter(function (x) { return x >= 40 && x <= 300; });
      if (!nums.length) return fallback;
      n = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
    }
    return clamp(Math.round(n), 60, 200);
  }

  function normalizeScore(value, fallback) {
    if (value == null || value === "") return fallback;
    if (typeof value === "number") {
      if (value <= 1) return clamp01(value);
      if (value <= 10) return clamp01(value / 10);
      return clamp01(value / 100);
    }
    var s = String(value).toLowerCase();
    var m = s.match(/(\d+(\.\d+)?)/);
    if (m) {
      var num = parseFloat(m[1]);
      if (s.indexOf("/10") > -1 || (num <= 10 && num > 1)) return clamp01(num / 10);
      if (num <= 1) return clamp01(num);
      return clamp01(num / 100);
    }
    if (/\b(very high|max|intense)\b/.test(s)) return 0.9;
    if (/high/.test(s)) return 0.75;
    if (/\b(med|medium|mid)\b/.test(s)) return 0.5;
    if (/low/.test(s)) return 0.25;
    return fallback;
  }

  function has(text, words) {
    text = (text || "").toLowerCase();
    for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) > -1) return true;
    return false;
  }

  // ---- family classification ----
  function familyOf(g) {
    var p = ((g["Parent Genre"] || g.family || "") + " " + (g["Genre / Subgenre"] || g.name || "")).toLowerCase();
    if (has(p, ["drum & bass", "dnb", "neurofunk", "liquid", "jump up", "jungle"])) return "dnb";
    if (has(p, ["dubstep", "riddim", "140", "grime"])) return "dubstep";
    if (has(p, ["psy", "goa", "trance"])) return "trance";
    if (has(p, ["hard techno", "techno"])) return "techno";
    if (has(p, ["breaks", "breakbeat", "uk bass", "electro"])) return "breaks";
    if (has(p, ["garage", "2-step", "bassline"])) return "garage";
    if (has(p, ["hardcore", "hardstyle", "gabber", "frenchcore", "uptempo", "hard dance"])) return "hardcore";
    if (has(p, ["ambient", "experimental", "downtempo", "organic"])) return "ambient";
    if (has(p, ["trap", "future bass", "hip-hop", "hip hop", "wave"])) return "trap";
    return "house";
  }

  // ---- family defaults ----
  // kick topology: four | dnb | break | half | none
  var FAMILIES = {
    house:    { bpm: 124, energy: .62, darkness: .40, groove: .70, melody: .55, density: .55, swing: .12, warmth: .60, distortion: .10, space: .45, kick: "four", bass: "offbeat", chords: "stab", feel: 1 },
    techno:   { bpm: 132, energy: .82, darkness: .78, groove: .55, melody: .30, density: .55, swing: .03, warmth: .30, distortion: .30, space: .55, kick: "four", bass: "roll", chords: "drone", feel: 1 },
    trance:   { bpm: 136, energy: .80, darkness: .45, groove: .55, melody: .85, density: .62, swing: .02, warmth: .55, distortion: .12, space: .78, kick: "four", bass: "roll", chords: "arp", feel: 1 },
    dnb:      { bpm: 174, energy: .85, darkness: .55, groove: .70, melody: .45, density: .70, swing: .06, warmth: .40, distortion: .22, space: .55, kick: "dnb", bass: "reese", chords: "pad", feel: 0.5 },
    dubstep:  { bpm: 140, energy: .78, darkness: .70, groove: .55, melody: .35, density: .45, swing: .04, warmth: .30, distortion: .40, space: .55, kick: "half", bass: "wobble", chords: "none", feel: 0.5 },
    breaks:   { bpm: 132, energy: .70, darkness: .45, groove: .72, melody: .45, density: .62, swing: .10, warmth: .45, distortion: .20, space: .45, kick: "break", bass: "funk", chords: "stab", feel: 1 },
    garage:   { bpm: 133, energy: .68, darkness: .40, groove: .82, melody: .55, density: .58, swing: .28, warmth: .55, distortion: .10, space: .45, kick: "break", bass: "sub", chords: "stab", feel: 1 },
    hardcore: { bpm: 155, energy: .95, darkness: .70, groove: .45, melody: .40, density: .60, swing: .02, warmth: .30, distortion: .55, space: .40, kick: "four", bass: "roll", chords: "stab", feel: 1 },
    ambient:  { bpm: 100, energy: .22, darkness: .45, groove: .25, melody: .60, density: .20, swing: .00, warmth: .70, distortion: .05, space: .92, kick: "none", bass: "sub", chords: "pad", feel: 1 },
    trap:     { bpm: 140, energy: .66, darkness: .55, groove: .60, melody: .55, density: .50, swing: .06, warmth: .45, distortion: .20, space: .55, kick: "half", bass: "sub", chords: "pad", feel: 0.5 }
  };

  // ---- a few explicit overrides (representative genres) ----
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  var OVERRIDES = {
    deephouse:     { darkness: .35, warmth: .78, melody: .60, chords: "pad", energy: .5 },
    techhouse:     { groove: .8, melody: .35, warmth: .5 },
    proghouse:     { melody: .75, space: .7, chords: "arp" },
    melodichouse:  { melody: .8, darkness: .55, space: .75, chords: "arp" },
    melodictechno: { melody: .78, darkness: .8, space: .72, chords: "arp", energy: .82 },
    afrohouse:     { groove: .85, swing: .18, warmth: .7, melody: .5 },
    minimaldeeptech: { density: .4, melody: .25, groove: .8 },
    detroittechno: { warmth: .5, melody: .5, darkness: .55 },
    industrialtechno: { darkness: .9, distortion: .5, melody: .15 },
    hardtechno:    { energy: .92, distortion: .45, darkness: .85 },
    psytrance:     { bpm: 145, energy: .9, bass: "roll", density: .75, darkness: .6 },
    uplifting:     { melody: .95, space: .85 },
    liquid:        { warmth: .7, melody: .7, darkness: .35 },
    jungle:        { groove: .8, density: .8, bass: "sub" },
    riddim:        { distortion: .5, melody: .2, darkness: .75 },
    ukgarage:      { swing: .3, groove: .85, melody: .55 },
    amapiano:      { bpm: 113, groove: .85, swing: .2, warmth: .75, kick: "four", bass: "sub" },
    gabber:        { bpm: 180, distortion: .7, energy: .98 },
    acidhouse:     { bass: "acid", groove: .75, warmth: .55 },
    acidtechno:    { bass: "acid", distortion: .4, darkness: .8 },
    dubtechno:     { space: .88, darkness: .7, chords: "pad", density: .32 },
    goatrance:     { bpm: 145, melody: .8, density: .72 }
  };

  // ---- key / scale ----
  var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function parseKey(g) {
    var s = (g["Common Keys"] || g["Camelot"] || "").toString();
    var m = s.match(/\b([A-G])(#|b)?\b/);
    var root = "A";
    if (m) { root = m[1] + (m[2] === "#" ? "#" : ""); if (m[2] === "b") { var idx = NOTES.indexOf(m[1]); root = NOTES[(idx + 11) % 12]; } }
    var scale = /maj/i.test(s) && !/min/i.test(s) ? "major" : "minor";
    return { root: root, scale: scale };
  }

  // ---- deterministic 16-step patterns ----
  function kickPattern(topo) {
    var p = new Array(16); for (var i = 0; i < 16; i++) p[i] = 0;
    if (topo === "four") { p[0] = p[4] = p[8] = p[12] = 1; }
    else if (topo === "dnb") { p[0] = 1; p[10] = 1; }
    else if (topo === "break") { p[0] = 1; p[6] = 1; p[10] = 1; }
    else if (topo === "half") { p[0] = 1; }
    return p;
  }
  function clapPattern(topo) {
    var p = new Array(16); for (var i = 0; i < 16; i++) p[i] = 0;
    if (topo === "none") return p;
    if (topo === "half") { p[8] = 1; }
    else { p[4] = 1; p[12] = 1; } // backbeat 2 & 4
    return p;
  }
  function hatPattern(density, rng, swing) {
    var p = new Array(16), i;
    for (i = 0; i < 16; i++) {
      var base = (i % 2 === 1) ? 0.9 : 0.55;          // emphasise offbeats
      p[i] = (rng() < base * (0.4 + density * 0.8)) ? 1 : 0;
    }
    return p;
  }
  function genPattern(density, rng) {
    var p = new Array(16); for (var i = 0; i < 16; i++) p[i] = rng() < density * 0.5 ? 1 : 0;
    return p;
  }

  // ---- build a profile ----
  // ---- data-derived intent (scale/mode, chord progression, instruments) ----
  var MODES = { phrygian:[0,1,3,5,7,8,10], dorian:[0,2,3,5,7,9,10], major:[0,2,4,5,7,9,11],
    mixolydian:[0,2,4,5,7,9,10], harmonicminor:[0,2,3,5,7,8,11], minor:[0,2,3,5,7,8,10] };
  function parseScale(g, fallbackMajor) {
    var s = (g["Scale / Mode"] || "").toLowerCase();
    if (/phrygian/.test(s)) return { name:"phrygian", steps:MODES.phrygian, major:false };
    if (/dorian/.test(s)) return { name:"dorian", steps:MODES.dorian, major:false };
    if (/mixolydian/.test(s)) return { name:"mixolydian", steps:MODES.mixolydian, major:true };
    if (/harmonic/.test(s)) return { name:"harmonicminor", steps:MODES.harmonicminor, major:false };
    if (/(major|ionian)/.test(s) && !/minor/.test(s)) return { name:"major", steps:MODES.major, major:true };
    return { name:"minor", steps:MODES.minor, major: !!fallbackMajor };
  }
  var ROMAN = { i:0, ii:1, iii:2, iv:3, v:4, vi:5, vii:6 };
  function parseProg(g) {
    var s = (g["Chord Progression"] || "").split("(")[0], toks = s.split(/[\s\-\u2013\u2014\/]+/), deg = [];
    for (var i = 0; i < toks.length; i++) { var m = toks[i].toLowerCase().match(/^[b#]?(iii|vii|ii|iv|vi|i|v)(?:maj7|maj|min|sus2|sus4|sus|dim|aug|add9|m|7|9|6|\u00B0|\+)?[0-9]?$/); if (m && ROMAN.hasOwnProperty(m[1])) deg.push(ROMAN[m[1]]); }
    return deg.length >= 2 ? deg.slice(0, 4) : [0, 5, 2, 6];
  }
  function bassStyle(g, dflt) {
    var s = ((g["Sound Design / Instrumentation"]||"")+" "+(g["Essential Synths / Plugins"]||"")+" "+(g["Sound Signature"]||"")).toLowerCase();
    if (/tb-?303|acid/.test(s)) return "acid";
    if (/log-?drum/.test(s)) return "logdrum";
    if (/reese|neuro/.test(s)) return "reese";
    if (/wobble|growl|talking bass|lfo/.test(s)) return "wobble";
    if (/808/.test(s)) return "sub";
    if (/sub-?bass|deep sub|round sub|sub \b/.test(s)) return "sub";
    return dflt;
  }
  function chordVoice(g, chords) {
    var s = ((g["Sound Design / Instrumentation"]||"")+" "+(g["Essential Synths / Plugins"]||"")+" "+(g["Harmony Approach"]||"")).toLowerCase();
    if (/supersaw|sylenth|spire|nexus|hypersaw/.test(s)) return "supersaw";
    if (/piano|rhodes|organ|e-piano|keys/.test(s)) return "keys";
    if (chords === "stab") return "square";
    if (chords === "pad") return "pad";
    return "saw";
  }
  function kickTopo(g, dflt) {
    var s = (g["Drum Programming"] || "").toLowerCase();
    if (/half-?time/.test(s)) return "half";
    if (/breakbeat|amen|broken|2-step|two-step/.test(s)) return "break";
    if (/four-on|4-on|four on the/.test(s)) return "four";
    return dflt;
  }

  function buildAudioProfile(g) {
    g = g || {};
    var fam = familyOf(g);
    var base = FAMILIES[fam] || FAMILIES.house;
    var id = norm(g["Genre / Subgenre"] || g.name || fam) || fam;
    var rng = mulberry32(hashString(id));

    var prof = {};
    for (var k in base) if (base.hasOwnProperty(k)) prof[k] = base[k];

    // data-derived refinements (read-only on source)
    prof.family = fam;
    prof.id = id;
    prof.name = g["Genre / Subgenre"] || g.name || fam;
    prof.bpm = parseBpm(g["Typical BPM"] != null ? g["Typical BPM"] : g.bpm, base.bpm);
    prof.energy = normalizeScore(g["Energy (1-10)"], base.energy);

    var sig = ((g["Sound Signature"] || "") + " " + (g["DJ Set Placement"] || "") + " " + (g["Drum Feel"] || "")).toLowerCase();
    if (has(sig, ["dark", "hypnotic", "industrial", "menacing", "grim"])) prof.darkness = clamp01(prof.darkness + 0.18);
    if (has(sig, ["warm", "soul", "jazzy", "organic", "melodic", "euphoric"])) { prof.darkness = clamp01(prof.darkness - 0.14); prof.melody = clamp01(prof.melody + 0.12); }
    if (has(sig, ["swung", "shuffle", "swing", "garage"])) prof.swing = clamp01(prof.swing + 0.15);
    if (has(sig, ["distort", "aggress", "hard", "raw"])) prof.distortion = clamp01(prof.distortion + 0.18);

    // apply explicit override, if any
    var ov = OVERRIDES[id];
    if (ov) for (var o in ov) if (ov.hasOwnProperty(o)) prof[o] = ov[o];

    // key/scale/mode + per-(sub)genre intent from the row's own data
    var key = parseKey(g); prof.key = key.root;
    var sc = parseScale(g, key.scale === "major"); prof.scale = sc.major ? "major" : "minor"; prof.scaleSteps = sc.steps; prof.mode = sc.name;
    prof.chordProg = parseProg(g);
    prof.bass = bassStyle(g, prof.bass);
    prof.chordVoice = chordVoice(g, prof.chords);
    prof.kick = kickTopo(g, prof.kick);
    var dtext = ((g["Drum Programming"] || "") + " " + (g["Sound Signature"] || "")).toLowerCase();
    if (/swing|shuffle|swung|2-step|two-step|garage|amapiano/.test(dtext)) prof.swing = clamp01(prof.swing + 0.16);

    // rhythmic feel (halftime families feel slower)
    prof.rhythmicFeel = base.feel || 1;
    prof.bars = 4;

    // patterns (deterministic)
    prof.kickPattern = kickPattern(prof.kick);
    prof.clapPattern = clapPattern(prof.kick === "none" ? "none" : (prof.kick === "half" ? "half" : "two"));
    prof.closedHatPattern = prof.kick === "none" ? genPattern(prof.density * 0.4, rng) : hatPattern(prof.density, rng, prof.swing);
    prof.openHatPattern = (function () { var p = new Array(16); for (var i = 0; i < 16; i++) p[i] = (i % 4 === 2 && fam === "house") ? 1 : 0; return p; })();
    prof.percPattern = genPattern(prof.density, rng);
    prof.bassPattern = (function () {
      var p = new Array(16), i;
      if (prof.bass === "roll" || prof.bass === "acid") { for (i = 0; i < 16; i++) p[i] = (i % 2 === 1) ? 1 : 0; }
      else if (prof.bass === "logdrum") { p = [1,0,0,1,0,0,1,0,0,1,0,0,1,0,1,0]; }
      else if (prof.bass === "offbeat") { for (i = 0; i < 16; i++) p[i] = (i % 4 === 2) ? 1 : 0; }
      else if (prof.bass === "reese" || prof.bass === "wobble") { p = kickPattern(prof.kick).slice(); }
      else { for (i = 0; i < 16; i++) p[i] = (i % 8 === 0) ? 1 : 0; } // sub / funk sparse
      return p;
    })();

    // synth params
    prof.filterCutoff = Math.round(lerp(400, 3200, clamp01(prof.energy * 0.7 + (1 - prof.darkness) * 0.5)));
    prof.resonance = clamp(lerp(0.4, 1.2, prof.energy), 0.2, 1.6);
    prof.reverbWet = clamp01(prof.space * 0.5);
    prof.delayWet = clamp01(prof.melody * 0.25);
    prof.stereoWidth = clamp01(0.3 + prof.space * 0.5);
    prof.chordDensity = clamp01(prof.melody * (prof.chords === "none" ? 0 : 1));

    // final clamp / NaN guard
    ["energy", "darkness", "groove", "melody", "density", "swing", "warmth", "distortion", "space",
     "reverbWet", "delayWet", "stereoWidth", "chordDensity"].forEach(function (key2) { prof[key2] = clamp01(prof[key2]); });
    prof.bpm = clamp(prof.bpm || base.bpm, 60, 200);

    return prof;
  }

  // ---- interpolation (for the later morph phase) ----
  function interpolate(a, b, t) {
    t = clamp01(t);
    var out = {}, k;
    var numeric = ["bpm", "energy", "darkness", "groove", "melody", "density", "swing", "warmth",
                   "distortion", "space", "filterCutoff", "resonance", "reverbWet", "delayWet", "stereoWidth"];
    for (k in a) if (a.hasOwnProperty(k)) out[k] = a[k];
    numeric.forEach(function (key) {
      if (typeof a[key] === "number" && typeof b[key] === "number") out[key] = a[key] + (b[key] - a[key]) * t;
    });
    // enums / patterns snap at the midpoint
    var src = t < 0.5 ? a : b;
    ["kick", "bass", "chords", "scale", "key", "kickPattern", "clapPattern", "closedHatPattern",
     "openHatPattern", "percPattern", "bassPattern"].forEach(function (key) { out[key] = src[key]; });
    out.name = a.name + " ⇄ " + b.name;
    if (isNaN(out.bpm)) out.bpm = a.bpm;
    return out;
  }

  root.BeatGenomeProfiles = {
    buildAudioProfile: buildAudioProfile,
    interpolate: interpolate,
    parseBpm: parseBpm,
    normalizeScore: normalizeScore,
    familyOf: familyOf,
    _internals: { hashString: hashString, mulberry32: mulberry32, clamp01: clamp01 }
  };
})(typeof window !== "undefined" ? window : this);
