/* ============================================================
   BeatGenome — audio-ui.js  (V09)
   Always-visible compact player that shows AND reacts to the
   clicked genre (live meter). Play doubles as "enable sound".
   ============================================================ */
(function (root) {
  "use strict";
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var AUDIO = root.BeatGenomeAudio, PROFILES = root.BeatGenomeProfiles;
    var LS = { vol: "beatgenome.audioVolume" };
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    var wrap = document.createElement("div");
    wrap.className = "bgaudio"; wrap.id = "bgaudio";
    wrap.innerHTML =
      '<div class="bga-player" id="bgaPlayer">' +
        '<div class="bga-camelot" id="bgaCamelot" aria-label="Camelot key"></div>' +
        '<div class="bga-chords" id="bgaChords" aria-label="Chord progression (live)"></div>' +
        '<canvas class="bga-meter" id="bgaMeter" width="200" height="26" aria-hidden="true"></canvas>' +
        '<div class="bga-info"><span class="bga-dot"></span>' +
          '<span class="bga-genre" id="bgaGenre">select a genre</span>' +
          '<span class="bga-bpm" id="bgaBpm"></span></div>' +
        '<div class="bga-ctrls">' +
          '<button class="bga-btn bga-play" id="bgaPlay" aria-pressed="false" aria-label="Enable and play sound">▶</button>' +
          '<button class="bga-btn bga-stop" id="bgaStop" aria-label="Stop">■</button>' +
          '<input class="bga-vol" id="bgaVol" type="range" min="0" max="100" value="70" aria-label="Volume">' +
        '</div>' +
        '<div class="bga-state" id="bgaState">sound off · press ▶</div>' +
      '</div>' +
      '<div class="bga-msg" id="bgaMsg" hidden>Interactive sound unavailable.</div>';
    document.body.appendChild(wrap);

    var elGenre = wrap.querySelector("#bgaGenre"), elBpm = wrap.querySelector("#bgaBpm"),
        elPlay = wrap.querySelector("#bgaPlay"), elStop = wrap.querySelector("#bgaStop"),
        elVol = wrap.querySelector("#bgaVol"), elState = wrap.querySelector("#bgaState"),
        elMeter = wrap.querySelector("#bgaMeter"), mx = elMeter.getContext("2d");

    if (!AUDIO || !AUDIO.supported || !PROFILES) {
      wrap.querySelector("#bgaPlayer").hidden = true; wrap.querySelector("#bgaMsg").hidden = false; return;
    }

    var currentProfile = null, currentName = null;
    var savedVol = parseInt(get(LS.vol), 10);
    if (!isNaN(savedVol)) { elVol.value = savedVol; AUDIO.setVolume(savedVol / 100); }

    function setPlayIcon(playing) { elPlay.textContent = playing ? "⏸︎" : "▶︎"; elPlay.setAttribute("aria-pressed", playing ? "true" : "false"); wrap.classList.toggle("playing", playing); }
    function setState(txt) { elState.textContent = txt; }

    function tapPlay() {
      if (!AUDIO.enabled) {
        setState("starting…");
        AUDIO.initialize().then(function (ok) {
          if (!ok) { wrap.querySelector("#bgaPlayer").hidden = true; wrap.querySelector("#bgaMsg").hidden = false; return; }
          AUDIO.setVolume((parseInt(elVol.value, 10) || 70) / 100);
          if (currentProfile) { AUDIO.playGenre(currentProfile); setState("playing " + currentName); }
          else setState("select a genre");
        });
      } else if (AUDIO.playing) { AUDIO.pause(); setState("paused"); }
      else if (currentProfile) { AUDIO.playGenre(currentProfile); }
    }
    elPlay.addEventListener("click", tapPlay);
    elStop.addEventListener("click", function () { AUDIO.stop(); setState("stopped"); });
    elVol.addEventListener("input", function () { var v = parseInt(elVol.value, 10) || 0; AUDIO.setVolume(v / 100); set(LS.vol, v); });

    AUDIO.onChange(function (t, s) { setPlayIcon(s.playing); if (s.playing && s.genre) setState("playing " + s.genre); });

    // graph calls this on every node selection (click or search)
    root.BeatGenomeOnSelect = function (node) {
      if (!node || !node.d) return;
      try { currentProfile = PROFILES.buildAudioProfile(node.d); } catch (e) { return; }
      currentName = node.name || currentProfile.name;
      elGenre.textContent = currentName;
      elBpm.textContent = currentProfile.bpm + " BPM";
      updateCamelot(node);
      if (AUDIO.enabled) { AUDIO.playGenre(currentProfile); setState("playing " + currentName); }
      else {
        // autoplay: the click is a user gesture, so start the engine and play this genre
        var prof = currentProfile, nm = currentName;
        setState("starting…");
        AUDIO.initialize().then(function (ok) {
          if (ok && prof) { AUDIO.setVolume((parseInt(elVol.value, 10) || 70) / 100); AUDIO.playGenre(prof); setState("playing " + nm); }
          else { wrap.querySelector("#bgaPlayer").hidden = true; wrap.querySelector("#bgaMsg").hidden = false; }
        });
      }
    };

    // ---- footer chord box (live roman numerals for what Tone.js is playing) ----
    var elChords = wrap.querySelector("#bgaChords");
    var elCamelot = wrap.querySelector("#bgaCamelot");
    function camelotNeighbors(code) {
      var m = (code || "").match(/(\d+)\s*([ABab])/); if (!m) return [];
      var n = parseInt(m[1], 10), L = m[2].toUpperCase();
      var up = (n % 12) + 1, dn = ((n + 10) % 12) + 1, other = L === "A" ? "B" : "A";
      return [dn + L, up + L, n + other];
    }
    var CAM_KEY = { "1A":"Ab min","2A":"Eb min","3A":"Bb min","4A":"F min","5A":"C min","6A":"G min","7A":"D min","8A":"A min","9A":"E min","10A":"B min","11A":"F# min","12A":"Db min","1B":"B maj","2B":"F# maj","3B":"Db maj","4B":"Ab maj","5B":"Eb maj","6B":"Bb maj","7B":"F maj","8B":"C maj","9B":"G maj","10B":"D maj","11B":"A maj","12B":"E maj" };
    function updateCamelot(node) {
      if (!elCamelot) return;
      var code = (node && node.camelot) ? node.camelot : "";
      if (!code) { elCamelot.innerHTML = ""; return; }
      var key = CAM_KEY[code] || ((node.d && node.d["Common Keys"]) ? node.d["Common Keys"].split(",")[0].trim() : "");
      var nb = camelotNeighbors(code);
      elCamelot.innerHTML = '<span class="bga-ck">Camelot</span>' +
        '<div class="bga-cam"><span class="bga-cam-code">' + code + '</span>' +
        '<div class="bga-cam-col">' + (key ? '<span class="bga-cam-key">' + key + '</span>' : '') +
        (nb.length ? '<span class="bga-cam-mix">\u2194 ' + nb.join(" ") + '</span>' : '') + '</div></div>';
    }
    var lastSig = "", lastStep = -2;
    function updateChords(rs) {
      var romans = (rs && rs.progRomans) ? rs.progRomans : [];
      var sig = romans.join("-");
      if (sig !== lastSig) {
        lastSig = sig; lastStep = -2;
        if (!romans.length) { elChords.innerHTML = ""; return; }
        var html = '<span class="bga-ck">Chords</span><span class="bga-chips">';
        for (var k = 0; k < romans.length; k++) html += '<button class="bga-chip" data-i="' + k + '">' + romans[k] + '</button>';
        elChords.innerHTML = html + '</span>';
        Array.prototype.forEach.call(elChords.querySelectorAll(".bga-chip"), function (b) {
          b.addEventListener("click", function () {
            var i = parseInt(b.dataset.i, 10) || 0;
            if (!AUDIO.enabled) { tapPlay(); return; }
            if (!AUDIO.playing && currentProfile) AUDIO.playGenre(currentProfile);
            if (AUDIO.strumChord) AUDIO.strumChord(i);
          });
        });
      }
      var step = (rs && rs.playing) ? (rs.chordStep | 0) : -1;
      if (step !== lastStep) {
        lastStep = step;
        var chips = elChords.querySelectorAll(".bga-chip");
        for (var j = 0; j < chips.length; j++) chips[j].classList.toggle("on", j === step);
      }
    }

    // live reacting meter (kick · bass · snare · hat · chord)
    var c1 = function () { return getComputedStyle(document.documentElement).getPropertyValue("--c1").trim() || "#FF3D9A"; };
    (function meter() {
      var w = elMeter.width, h = elMeter.height, rs = AUDIO.getReactiveState ? AUDIO.getReactiveState() : null;
      updateChords(rs);
      mx.clearRect(0, 0, w, h);
      var vals = rs ? [rs.kick, rs.bass, rs.snare, rs.hat, rs.chord, rs.master] : [0, 0, 0, 0, 0, 0];
      var n = vals.length, bw = w / n, col = c1();
      mx.fillStyle = col;
      for (var i = 0; i < n; i++) {
        var v = Math.max(0.04, Math.min(1, vals[i] || 0)), bh = v * (h - 4);
        mx.globalAlpha = 0.35 + v * 0.65;
        mx.fillRect(i * bw + 2, h - bh - 2, bw - 4, bh);
      }
      mx.globalAlpha = 1;
      requestAnimationFrame(meter);
    })();
  });
})(typeof window !== "undefined" ? window : this);
