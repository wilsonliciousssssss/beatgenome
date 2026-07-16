/* Node test for assets/audio-profiles.js — determinism, ranges, fallback, no NaN. */
global.window = {};
require("../assets/audio-profiles.js");
require("../assets/data.js");
var P = global.window.BeatGenomeProfiles, D = global.window.DJDATA;
var pass = 0, fail = 0;
function ok(name, cond) { (cond ? pass++ : fail++); if (!cond) console.log("FAIL " + name); }

var scal = ["energy","darkness","groove","melody","density","swing","warmth","distortion","space","reverbWet","delayWet","stereoWidth","chordDensity"];
var nanHits = 0, badRange = 0, badBpm = 0, badPat = 0, built = 0;

D.nodes.forEach(function (n) {
  var g = n.d; g.name = n.name;
  var p = P.buildAudioProfile(g); built++;
  scal.forEach(function (k) { if (typeof p[k] !== "number" || isNaN(p[k])) nanHits++; else if (p[k] < 0 || p[k] > 1) badRange++; });
  if (!(p.bpm >= 60 && p.bpm <= 200)) badBpm++;
  ["kickPattern","clapPattern","closedHatPattern","bassPattern"].forEach(function (pat) { if (!Array.isArray(p[pat]) || p[pat].length !== 16) badPat++; });
});
ok("built a profile for every node", built === D.nodes.length);
ok("no NaN scalar", nanHits === 0);
ok("all scalars in 0..1", badRange === 0);
ok("all bpm 60..200", badBpm === 0);
ok("all patterns length 16", badPat === 0);

// determinism: same input twice => identical
var a = P.buildAudioProfile({ "Genre / Subgenre": "Melodic Techno", "Typical BPM": "122-126", "Energy (1-10)": "6" });
var b = P.buildAudioProfile({ "Genre / Subgenre": "Melodic Techno", "Typical BPM": "122-126", "Energy (1-10)": "6" });
ok("deterministic patterns", JSON.stringify(a.closedHatPattern) === JSON.stringify(b.closedHatPattern));
ok("melodic techno != house energy/darkness", (function(){ var h=P.buildAudioProfile({"Genre / Subgenre":"House"}); return a.darkness>h.darkness; })());

// fallback for unknown / malformed
var f = P.buildAudioProfile({});
ok("empty input -> valid profile", f && f.bpm >= 60 && !isNaN(f.energy));
ok("garbage bpm -> fallback", P.parseBpm("banana", 128) === 128);
ok("normalizeScore words", P.normalizeScore("High", 0.5) === 0.75 && P.normalizeScore("", 0.4) === 0.4);
var m = P.interpolate(a, P.buildAudioProfile({"Genre / Subgenre":"Ambient"}), 0.5);
ok("interpolate no NaN bpm", !isNaN(m.bpm));

console.log("\n" + pass + "/" + (pass + fail) + " checks passed");
process.exit(fail ? 1 : 0);
