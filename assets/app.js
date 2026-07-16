/* ============================================================
   EDM GENOME — app.js
   Dependency-free. Force graph + oscilloscope + spectrum bars +
   DNA structure panel + live Collective channels.
   ============================================================ */
(function () {
  "use strict";

  // ---- boot guard (error state) ----
  var DATA = window.DJDATA;
  if (!DATA || !DATA.nodes || !DATA.nodes.length) {
    document.getElementById("loading").classList.add("done");
    document.getElementById("err").classList.add("show");
    return;
  }

  // ---- channels (Alpha Omega Collective) ----
  var CHANNELS = [
    { name: "Plasma", c1: "#FF3D9A", c2: "#7A5CFF" },
    { name: "Ion",    c1: "#2FE6FF", c2: "#4C7BFF" },
    { name: "Flux",   c1: "#B6FF3C", c2: "#22D39B" },
    { name: "Solar",  c1: "#FF7A29", c2: "#FF3D6E" },
    { name: "Nova",   c1: "#C86BFF", c2: "#5C7BFF" },
    { name: "Mint",   c1: "#12E1B0", c2: "#2FA8FF" }
  ];
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} }
  function applyChannel(i) {
    var ch = CHANNELS[i] || CHANNELS[0];
    document.documentElement.style.setProperty("--c1", ch.c1);
    document.documentElement.style.setProperty("--c2", ch.c2);
    store("edm_channel", i);
    Array.prototype.forEach.call(chWrap.children, function (b, j) {
      b.setAttribute("aria-pressed", j === i ? "true" : "false");
    });
  }

  // ---- element refs ----
  var graph = document.getElementById("graph"),
      gx = graph.getContext("2d"),
      scope = document.getElementById("scope"),
      sx = scope.getContext("2d"),
      chWrap = document.getElementById("channels"),
      searchIn = document.getElementById("search"),
      results = document.getElementById("results"),
      panel = document.getElementById("panel"),
      legend = document.getElementById("legend"),
      overlay = document.getElementById("overlay");
  var DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  // ---- data prep ----
  var nodes = DATA.nodes.map(function (n) {
    return Object.assign({}, n, { x: 0, y: 0, vx: 0, vy: 0, fixed: false });
  });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  var links = DATA.links.filter(function (l) { return byId[l.s] && byId[l.t]; });

  // adjacency (for neighbour highlighting)
  var adj = {};
  nodes.forEach(function (n) { adj[n.id] = {}; });
  links.forEach(function (l) { adj[l.s][l.t] = l.k; adj[l.t][l.s] = l.k; });

  // cluster seed positions by family
  var fams = DATA.families.map(function (f) { return f.name; });
  var famIndex = {}; fams.forEach(function (f, i) { famIndex[f] = i; });
  nodes.forEach(function (n) {
    var a = (famIndex[n.family] / fams.length) * Math.PI * 2;
    var r = 260 + Math.random() * 60;
    var jitter = n.level === "Genre" ? 30 : 90;
    n.x = Math.cos(a) * r + (Math.random() - 0.5) * jitter;
    n.y = Math.sin(a) * r + (Math.random() - 0.5) * jitter;
    n.wa = Math.random() * 6.2832; n.wb = Math.random() * 6.2832;
  });
  function radius(n) {
    return n.level === "Genre" ? 7 + (n.energy || 5) * 0.7 : 3.5 + (n.energy || 5) * 0.28;
  }
  // node colour: by family (data) or by Camelot key (harmonic-mixing wheel)
  function camelotColour(nd) {
    var m = (nd.camelot || "").match(/(\d+)\s*([ABab])/);
    if (!m) return "hsl(0,0%,55%)";
    var hue = ((parseInt(m[1], 10) - 1) / 12) * 360;
    return m[2].toUpperCase() === "B" ? "hsl(" + hue + ",70%,66%)" : "hsl(" + hue + ",85%,55%)";
  }
  var colourMode = (store("edm_colourmode") === "camelot") ? "camelot" : "family";
  function colourOf(nd) { return colourMode === "camelot" ? camelotColour(nd) : nd.colour; }

  // ---- view transform ----
  var cam = { x: 0, y: 0, scale: 0.9 }, W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    [graph].forEach(function (cv) {
      cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px";
    });
    gx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scope.width = W * DPR; scope.height = 40 * DPR; scope.style.width = W + "px";
    sx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function toWorld(px, py) { return { x: (px - W / 2) / cam.scale + cam.x, y: (py - H / 2) / cam.scale + cam.y }; }

  // ---- force simulation ----
  var alpha = 1;
  function tick() {
    var a = alpha, i, j, n, m, dx, dy, d2, d, f;
    // repulsion
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        m = nodes[j];
        dx = n.x - m.x; dy = n.y - m.y; d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 90000) continue;                 // ignore very far pairs
        f = 700 / d2;
        var inv = 1 / Math.sqrt(d2);
        n.vx += dx * inv * f; n.vy += dy * inv * f;
        m.vx -= dx * inv * f; m.vy -= dy * inv * f;
      }
    }
    // link springs
    for (i = 0; i < links.length; i++) {
      var l = links[i]; n = byId[l.s]; m = byId[l.t];
      var L = l.k === "child" ? 55 : l.k === "related" ? 120 : 150;
      var K = l.k === "child" ? 0.045 : l.k === "related" ? 0.006 : 0.004;
      dx = m.x - n.x; dy = m.y - n.y; d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      f = (d - L) * K; dx = dx / d * f; dy = dy / d * f;
      n.vx += dx; n.vy += dy; m.vx -= dx; m.vy -= dy;
    }
    // water waves: each passing ring nudges every node outward (hubs + orphans)
    var nowW = (performance.now() - t0) / 1000;
    for (var wv = waves.length - 1; wv >= 0; wv--) {
      var wave = waves[wv], age = nowW - wave.t, R = age * 430, strength = 1 - age / 1.6;
      if (strength <= 0) { waves.splice(wv, 1); continue; }
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        dx = n.x - wave.x; dy = n.y - wave.y; d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var band = Math.abs(d - R);
        if (band < 58) { var push = (1 - band / 58) * strength * 2.8; n.vx += dx / d * push; n.vy += dy / d * push; }
      }
    }
    // gravity to centre + gentle continuous wander + integrate
    var Tw = (performance.now() - t0) / 1000;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      n.vx += -n.x * 0.0015; n.vy += -n.y * 0.0015;
      n.vx += Math.cos(Tw * 0.28 + n.wa) * 0.12 + Math.cos(Tw * 0.11 + n.wb) * 0.08;
      n.vy += Math.sin(Tw * 0.24 + n.wb) * 0.12 + Math.sin(Tw * 0.13 + n.wa) * 0.08;
      if (n === dragNode) continue;
      n.x += n.vx * (a + 0.09); n.y += n.vy * (a + 0.09);
      n.vx *= 0.93; n.vy *= 0.93;
    }
    if (alpha > 0.06) alpha *= 0.99; else alpha = 0.06; // gentle "on water" drift, forever
  }
  function reheat(v) { alpha = Math.max(alpha, v || 0.5); }
  function splash(x, y, c) { waves.push({ x: x, y: y, t: (performance.now() - t0) / 1000, c: c }); if (waves.length > 8) waves.shift(); reheat(0.8); }

  // ---- render ----
  var hover = null, selected = null, query = "", matchSet = null, selectAnim = -1e9, waves = [], reduceMotion = false;
  try { reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function draw() {
    gx.clearRect(0, 0, W, H);
    var RS = (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) ? window.BeatGenomeAudio.getReactiveState() : null;
    gx.save();
    gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);

    // base links (child only, faint)
    gx.lineWidth = 0.6 / cam.scale;
    gx.strokeStyle = "rgba(255,255,255,0.06)";
    gx.beginPath();
    for (var i = 0; i < links.length; i++) {
      if (links[i].k !== "child") continue;
      var n = byId[links[i].s], m = byId[links[i].t];
      gx.moveTo(n.x, n.y); gx.lineTo(m.x, m.y);
    }
    gx.stroke();

    // highlighted links for focus node
    var focus = hover || selected;
    if (focus) {
      for (i = 0; i < links.length; i++) {
        var l = links[i];
        if (l.s !== focus.id && l.t !== focus.id) continue;
        var a2 = byId[l.s], b2 = byId[l.t];
        gx.strokeStyle = l.k === "mix" ? "rgba(120,200,255,0.5)"
                       : l.k === "related" ? "rgba(255,255,255,0.28)" : colourOf(focus);
        gx.lineWidth = (l.k === "child" ? 1.4 : 1) / cam.scale;
        gx.setLineDash(l.k === "mix" ? [4 / cam.scale, 4 / cam.scale] : []);
        gx.beginPath(); gx.moveTo(a2.x, a2.y); gx.lineTo(b2.x, b2.y); gx.stroke();
      }
      gx.setLineDash([]);
    }

    // water ripples radiating from clicks
    var nowR = (performance.now() - t0) / 1000;
    for (var wi = 0; wi < waves.length; wi++) {
      var wr = waves[wi], wAge = nowR - wr.t, wRad = wAge * 430, wA = 1 - wAge / 1.6;
      if (wA <= 0) continue;
      gx.strokeStyle = wr.c || "#fff"; gx.lineWidth = 2 / cam.scale;
      gx.globalAlpha = wA * 0.5; gx.beginPath(); gx.arc(wr.x, wr.y, wRad, 0, 6.2832); gx.stroke();
      gx.globalAlpha = wA * 0.2; gx.beginPath(); gx.arc(wr.x, wr.y, wRad * 0.66, 0, 6.2832); gx.stroke();
      gx.globalAlpha = 1;
    }

    // nodes — each ripples to its own BPM
    var nowS = (performance.now() - t0) / 1000;
    for (i = 0; i < nodes.length; i++) {
      var nd = nodes[i], r0 = radius(nd);
      var dim = matchSet && !matchSet[nd.id];
      var isFocus = focus && (nd === focus || adj[focus.id][nd.id]);
      var beat = (nowS * (nd.bpm || 120) / 60) % 1;   // position in the beat at this genre's tempo
      var thump = Math.pow(1 - beat, 3);              // sharp attack, quick decay
      var r = r0 * (1 + 0.16 * thump);                // body pulses on the beat
      var col = colourOf(nd);
      if (nd === selected) { var se = nowS - selectAnim; if (se >= 0 && se < 0.85) r *= 1 + 0.55 * Math.exp(-7 * se) * Math.cos(16 * se); }
      if (RS && RS.playing && nd === selected && !reduceMotion) r *= 1 + RS.kick * 0.28 + RS.bass * 0.05;
      var baseA = dim ? 0.12 : (focus && !isFocus ? 0.28 : 1);
      // ripple ring on hubs (genre-level) — expands once per beat, fades as it grows
      if (nd.level === "Genre" && !dim) {
        var ringR = r + beat * (r0 * 2.6);
        gx.globalAlpha = baseA * 0.5 * (1 - beat);
        gx.beginPath(); gx.arc(nd.x, nd.y, ringR, 0, 6.2832);
        gx.strokeStyle = col; gx.lineWidth = 1.3 / cam.scale; gx.stroke();
        gx.globalAlpha = 1;
      }
      gx.globalAlpha = baseA;
      gx.beginPath(); gx.arc(nd.x, nd.y, r, 0, 6.2832);
      gx.fillStyle = col;
      gx.shadowColor = col; gx.shadowBlur = (nd === focus ? 26 : 10) + 8 * thump + (RS && nd === selected ? RS.chord * 14 : 0);
      gx.fill();
      gx.shadowBlur = 0;
      if (nd === selected) { gx.lineWidth = 2 / cam.scale; gx.strokeStyle = "#fff"; gx.stroke(); }
      gx.globalAlpha = 1;

      // labels
      var showLabel = (nd.level === "Genre" && cam.scale > 0.5) || nd === focus || (cam.scale > 1.7);
      if (showLabel && !dim) {
        gx.globalAlpha = focus && !isFocus ? 0.3 : 1;
        gx.font = (nd.level === "Genre" ? "600 " : "400 ") + (11 / cam.scale) + "px 'Space Grotesk',sans-serif";
        gx.fillStyle = nd === focus ? "#fff" : "rgba(236,236,244,0.85)";
        gx.textAlign = "center";
        gx.fillText(nd.name, nd.x, nd.y - r - 4 / cam.scale);
        gx.globalAlpha = 1;
      }
    }
    gx.restore();
  }

  // ---- oscilloscope + spectrum bars ----
  var t0 = performance.now();
  function focusParams() {
    var f = hover || selected;
    var c1 = getComputedStyle(document.documentElement).getPropertyValue("--c1").trim() || "#FF3D9A";
    return { bpm: f ? f.bpm : 124, energy: f ? f.energy : 5, colour: f ? colourOf(f) : c1 };
  }
  function drawScope(ctx, w, h, p, big) {
    ctx.clearRect(0, 0, w, h);
    var t = (performance.now() - t0) / 1000;
    var bpm = p.bpm || 120;
    var beatHz = bpm / 60;                        // beats per second = the genre's native tempo
    var beat = (t * beatHz) % 1;                  // position within the current beat (0..1)
    var pulse = Math.pow(1 - beat, 2.4);          // sharp attack that decays each beat
    var barPos = (t * beatHz / 4) % 1;            // playhead sweeps once per 4-beat bar
    var mid = h / 2;
    var baseAmp = (h / 2 - 3) * (0.22 + (p.energy / 10) * 0.62);
    var amp = baseAmp * (0.72 + 0.5 * pulse);     // wave amplitude pumps on every beat
    var cyc = 2 + bpm / 22;                        // more waves across the width at higher BPM
    var speed = beatHz;                            // horizontal scroll speed = the tempo
    // spectrum bars behind the wave — beat-reactive, prominent in the panel (big)
    var bars = big ? 34 : 60, bw = w / bars;
    for (var b = 0; b < bars; b++) {
      var seed = Math.sin(b * 12.9898) * 43758.545; seed -= Math.floor(seed);
      var wob = Math.abs(Math.sin(b * 0.55 + t * speed * 3.0 + seed * 6.2832));
      var hv = 0.10 + wob * 0.55 * (p.energy / 10) + (big ? 0.42 * pulse * (0.35 + seed) : 0);
      var bh = Math.min(1, hv) * h * (big ? 0.95 : 0.85);
      ctx.globalAlpha = (big ? 0.30 : 0.14) + (big ? 0.30 * pulse * seed : 0);
      ctx.fillStyle = p.colour;
      ctx.fillRect(b * bw + bw * 0.12, h - bh, bw * 0.76, bh);
    }
    ctx.globalAlpha = 1;
    // oscilloscope line
    ctx.beginPath();
    for (var xp = 0; xp <= w; xp += 2) {
      var ph = (xp / w) * Math.PI * 2 * cyc + t * speed * Math.PI * 2;
      var yv = mid + Math.sin(ph) * amp * (0.7 + 0.3 * Math.sin(ph * 0.5));
      if (xp === 0) ctx.moveTo(xp, yv); else ctx.lineTo(xp, yv);
    }
    ctx.strokeStyle = p.colour; ctx.lineWidth = big ? 2.2 : 1.6;
    ctx.shadowColor = p.colour; ctx.shadowBlur = big ? 10 : 8; ctx.stroke(); ctx.shadowBlur = 0;
    // beat playhead (panel only)
    if (big) {
      ctx.globalAlpha = 0.12 + 0.5 * pulse;
      ctx.fillStyle = p.colour;
      ctx.fillRect(barPos * w - 1, 0, 2, h);
      ctx.globalAlpha = 1;
    }
  }

  var pScope = document.getElementById("pScope"), psx = pScope.getContext("2d"), pScopeOn = false;
  function sizePanelScope() {
    var w = pScope.clientWidth || 380;
    pScope.width = w * DPR; pScope.height = 46 * DPR; psx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return w;
  }

  // ---- main loop ----
  function frame() {
    tick();
    draw();
    if (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) { var _rs = window.BeatGenomeAudio.getReactiveState(); _rs.kick *= 0.86; _rs.snare *= 0.82; _rs.hat *= 0.75; _rs.bass *= 0.9; _rs.chord *= 0.93; _rs.master *= 0.9; }
    drawScope(sx, W, 40, focusParams(), false);
    if (pScopeOn && panel.classList.contains("open")) {
      drawScope(psx, pScope.clientWidth || 380, 46, currentPanelParams(), true);
    }
    requestAnimationFrame(frame);
  }

  // ---- hit testing / interaction ----
  function nodeAt(px, py) {
    var w = toWorld(px, py), best = null, bd = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], dx = n.x - w.x, dy = n.y - w.y, d = dx * dx + dy * dy;
      var rr = radius(n) + 6 / cam.scale;
      if (d < rr * rr && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  var dragging = false, dragNode = null, moved = false, last = null;
  graph.addEventListener("pointerdown", function (e) {
    graph.setPointerCapture(e.pointerId);
    last = { x: e.clientX, y: e.clientY }; moved = false;
    var n = nodeAt(e.clientX, e.clientY);
    if (n) { dragNode = n; n.fixed = true; } else { dragging = true; graph.classList.add("grabbing"); }
  });
  graph.addEventListener("pointermove", function (e) {
    if (dragNode) {
      var w = toWorld(e.clientX, e.clientY); dragNode.x = w.x; dragNode.y = w.y; dragNode.vx = dragNode.vy = 0;
      moved = true; reheat(0.5); return;
    }
    if (dragging) {
      cam.x -= (e.clientX - last.x) / cam.scale; cam.y -= (e.clientY - last.y) / cam.scale;
      last = { x: e.clientX, y: e.clientY }; moved = true; return;
    }
    var h = nodeAt(e.clientX, e.clientY);
    if (h !== hover) { hover = h; graph.style.cursor = h ? "pointer" : "grab"; }
  });
  function endPointer(e) {
    if (dragNode && !moved) select(dragNode);
    else if (dragging && !moved) { /* click empty = deselect handled below */ }
    if (dragNode) dragNode.fixed = false;
    dragNode = null; dragging = false; graph.classList.remove("grabbing");
  }
  graph.addEventListener("pointerup", endPointer);
  graph.addEventListener("pointercancel", endPointer);
  graph.addEventListener("wheel", function (e) {
    e.preventDefault();
    var w0 = toWorld(e.clientX, e.clientY);
    var k = Math.exp(-e.deltaY * 0.0014);
    cam.scale = Math.max(0.25, Math.min(4.5, cam.scale * k));
    var w1 = toWorld(e.clientX, e.clientY);
    cam.x += w0.x - w1.x; cam.y += w0.y - w1.y;
  }, { passive: false });

  // centre view on a node (smooth)
  function centerOn(n, targetScale) {
    var ts = targetScale || Math.max(1.1, cam.scale), sx0 = cam.x, sy0 = cam.y, ss = cam.scale, t = 0;
    (function step() {
      t += 0.08; var e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      cam.x = sx0 + (n.x - sx0) * e; cam.y = sy0 + (n.y - sy0) * e; cam.scale = ss + (ts - ss) * e;
      if (t < 1) requestAnimationFrame(step);
    })();
  }

  // ---- detail panel ----
  var FIELD_SECTIONS = [
    ["Sounds like", ["Sound Signature"]],
    ["Structure", ["Typical Length", "Phrasing", "Track Structure"]],
    ["Mix it (DJ)", ["DJ Set Placement", "Mixes Well With", "Transition Tip", "Blend Length (bars)",
                     "Sound Colour FX", "Beat FX", "Transition Loop (bars)", "Beat FX Setting (beat)",
                     "Beat FX Depth (%)", "Mix-In / Mix-Out", "Vocal Density / Layerability", "Double-Drop / Mashup"]],
    ["Produce it", ["Sound Design / Instrumentation", "Drum Programming", "Scale / Mode", "Chord Progression",
                    "Harmony Approach", "Essential Synths / Plugins", "Production Techniques", "Mix / Master Targets"]],
    ["Context", ["Origin", "Era", "Peak / Momentum (yrs)", "Key Labels", "Representative Artists",
                 "Landmark Track", "Fuses Into / Related", "Notes"]]
  ];
  var CHIP_FIELDS = { "Mixes Well With": 1, "Fuses Into / Related": 1 };
  var panelNode = null;
  function currentPanelParams() {
    return panelNode ? { bpm: panelNode.bpm, energy: panelNode.energy, colour: colourOf(panelNode) }
                     : focusParams();
  }
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function buildDNA(d) {
    var segs = [
      ["Intro", d["Intro (bars)"], d["Intro Feel"]],
      ["Build", d["Build (bars)"], d["Build Feel"]],
      ["Drop/Main", d["Drop/Main (bars)"], d["Drop/Main Feel"]],
      ["Breakdown", d["Breakdown (bars)"], d["Breakdown Feel"]],
      ["Outro", d["Outro (bars)"], d["Outro Feel"]]
    ].filter(function (s) { return s[1] || s[2]; });
    if (!segs.length) return "";
    var h = '<div class="dna"><div class="rail"></div>';
    segs.forEach(function (s) {
      h += '<div class="seg"><div class="knot"></div>' +
        '<div class="lab">' + esc(s[0]) + '</div>' +
        '<div class="bars">' + esc(s[1] || "–") + '</div>' +
        '<div class="feel">' + esc(s[2] || "") + '</div></div>';
    });
    return h + "</div>";
  }

  // horizontal arrangement timeline: Intro → Build → Drop → Breakdown → Outro,
  // segment widths proportional to bar-counts, brightness peaking at the drop.
  function firstInt(s) { var m = (s || "").match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
  function buildArrangeBar(d) {
    var defs = [
      ["Intro", "Intro (bars)", "Intro Feel", 0.52],
      ["Build", "Build (bars)", "Build Feel", 0.72],
      ["Drop", "Drop/Main (bars)", "Drop/Main Feel", 1],
      ["Breakdown", "Breakdown (bars)", "Breakdown Feel", 0.62],
      ["Outro", "Outro (bars)", "Outro Feel", 0.46]
    ];
    var segs = defs.map(function (s) {
      return { name: s[0], bars: (d[s[1]] || "").trim(), feel: (d[s[2]] || "").trim(), o: s[3], n: firstInt(d[s[1]]) };
    }).filter(function (s) { return s.bars || s.feel; });
    if (!segs.length) return "";
    var anyN = segs.some(function (s) { return s.n > 0; });
    var html = '<div class="arrbar" role="img" aria-label="Arrangement timeline: intro, build, drop, breakdown, outro">';
    segs.forEach(function (s) {
      var grow = anyN ? (s.n > 0 ? s.n : 1) : 1;
      var label = (s.bars && s.bars.toLowerCase() !== "n/a") ? s.bars : "";
      html += '<div class="arrseg" style="flex:' + grow + ';--o:' + s.o + '" title="' +
        esc(s.name + " · " + (s.bars || "—") + (s.feel ? " · " + s.feel : "")) + '">' +
        '<span class="an">' + esc(s.name) + '</span>' +
        (label ? '<span class="ab">' + esc(label) + '</span>' : '') + '</div>';
    });
    return html + '</div>';
  }

  // visual renderers for a few DJ-mix fields (meter / pips / pill)
  function renderField(key, val) {
    if (key === "Beat FX Depth (%)") {
      var nums = (val.match(/\d+/g) || []).map(Number), lo = nums[0] || 0, hi = (nums[1] != null ? nums[1] : lo);
      return '<div class="field"><div class="k">' + esc(key) + '</div>' +
        '<div class="meter" title="' + esc(val) + '"><i style="left:' + lo + '%;width:' + Math.max(4, hi - lo) + '%"></i></div>' +
        '<div class="v small">' + esc(val) + '</div></div>';
    }
    if (key === "Vocal Density / Layerability" || key === "Double-Drop / Mashup") {
      var t = val.toLowerCase();
      var rank = (t.indexOf("high") === 0 || t.indexOf("med-high") === 0) ? 3 : (t.indexOf("med") === 0 || t.indexOf("low-med") === 0) ? 2 : (t.indexOf("low") === 0) ? 1 : 0;
      var pips = ""; for (var q = 1; q <= 3; q++) pips += '<i class="' + (q <= rank ? "on" : "") + '"></i>';
      return '<div class="field"><div class="k">' + esc(key) + '</div><div class="lvlrow"><span class="pips">' + pips + '</span><span class="v small">' + esc(val) + '</span></div></div>';
    }
    if (key === "Blend Length (bars)" || key === "Transition Loop (bars)" || key === "Beat FX Setting (beat)") {
      return '<div class="field"><div class="k">' + esc(key) + '</div><div class="v"><span class="pill">' + esc(val) + '</span></div></div>';
    }
    return null;
  }

  // ---- signature tracks bar (bottom-centre, separate container) ----
  var tracksBar = document.getElementById("tracksBar"),
      tbGenre = document.getElementById("tbGenre"),
      tbList = document.getElementById("tbList"),
      tbClose = document.getElementById("tbClose");
  function updateDock() {
    var h = 0, pl = document.getElementById("bgaudio"), tb = document.getElementById("tracksBar");
    if (pl) h += pl.offsetHeight || 56;
    if (tb && !tb.hidden) h += (tb.offsetHeight || 0) + 6;
    document.documentElement.style.setProperty("--dockh", (h + 8) + "px");
  }
  if (tbClose) tbClose.addEventListener("click", function () { tracksBar.hidden = true; updateDock(); });
  function renderTracks(n) {
    if (!tracksBar || !n || !n.d) return;
    var d = n.d, html = "";
    for (var k = 1; k <= 5; k++) { var tt = d["Top Track " + k]; if (tt && tt.trim()) html += '<button class="tb-t" data-track="' + esc(tt) + '"><span class="tp">\u25B6</span>' + esc(tt) + "</button>"; }
    if (!html) { tracksBar.hidden = true; updateDock(); return; }
    tbGenre.textContent = n.name; tbList.innerHTML = html; tracksBar.hidden = false;
    Array.prototype.forEach.call(tbList.querySelectorAll(".tb-t"), function (b) { b.addEventListener("click", function () { openPreview(b.dataset.track); }); });
    updateDock();
  }

  function openPanel(n) {
    panelNode = n;
    panel.style.setProperty("--nodeC", colourOf(n));
    panel.style.setProperty("--spin", (240 / (n.bpm || 124)).toFixed(2) + "s");  // ring spins once per bar at the genre BPM
    document.getElementById("pFam").textContent = n.family;
    document.getElementById("pName").textContent = n.name;
    document.getElementById("pLvl").textContent = n.level + (n.d["Drum Feel"] ? " · " + n.d["Drum Feel"] : "");
    // metrics
    var met = document.getElementById("pMetrics"), d = n.d;
    met.innerHTML =
      metric("BPM", d["Typical BPM"] || (n.bpm + "")) +
      metric("Energy", (n.energy || "–") + "/10") +
      metric("Camelot", n.camelot || "–") +
      metric("Key", (d["Common Keys"] || "–").split(",")[0]);
    // energy bars
    var eb = '<div class="ebars">';
    for (var i = 1; i <= 10; i++) eb += '<i class="' + (i <= (n.energy || 0) ? "on" : "") + '"></i>';
    eb += "</div>";
    // sections
    var body = eb;
    var arrBar = buildArrangeBar(d), dna = buildDNA(d);
    body += '<div class="sec"><h3>Arrangement</h3>' + arrBar +
      (dna || (arrBar ? "" : '<div class="field"><div class="v">' + esc(d["Track Structure"] || "—") + "</div></div>")) + "</div>";
    FIELD_SECTIONS.forEach(function (sec) {
      var inner = "";
      sec[1].forEach(function (key) {
        var val = d[key]; if (!val || !val.trim()) return;
        if (key === "Track Structure" && buildDNA(d)) return; // shown as DNA already
        var vis = renderField(key, val); if (vis) { inner += vis; return; }
        if (CHIP_FIELDS[key]) {
          inner += '<div class="field"><div class="k">' + esc(key) + '</div><div class="chips">' + chips(val) + "</div></div>";
        } else {
          inner += '<div class="field"><div class="k">' + esc(key) + '</div><div class="v">' + esc(val) + "</div></div>";
        }
      });
      if (inner) body += '<div class="sec"><h3>' + esc(sec[0]) + "</h3>" + inner + "</div>";
    });
    // signature tracks now live in the bottom-centre tracks bar (renderTracks)

    document.getElementById("pBody").innerHTML = body;
    // wire chips
    Array.prototype.forEach.call(document.querySelectorAll("#pBody .chip"), function (c) {
      if (c.dataset.id) c.addEventListener("click", function () { select(byId[c.dataset.id]); });
    });
    renderTracks(n);
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); document.body.classList.add("panel-open");
    pScopeOn = true; sizePanelScope();
  }
  function metric(k, v) { return '<div class="metric"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + "</div></div>"; }
  function chips(val) {
    return val.split(/[,/]/).map(function (s) {
      var name = s.trim(); if (!name || name === "(varies by style)" || name.charAt(0) === "(") return name ? '<span class="chip static">' + esc(name) + "</span>" : "";
      var id = findId(name);
      return id ? '<span class="chip" data-id="' + id + '">' + esc(name) + "</span>"
                : '<span class="chip static">' + esc(name) + "</span>";
    }).join("");
  }
  function findId(name) {
    var key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].name.toLowerCase().replace(/[^a-z0-9]/g, "") === key) return nodes[i].id;
    }
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].family.toLowerCase().replace(/[^a-z0-9]/g, "") === key && nodes[i].level === "Genre") return nodes[i].id;
    }
    return null;
  }
  function closePanel() { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); document.body.classList.remove("panel-open"); pScopeOn = false; selected = null; }
  document.getElementById("panelClose").addEventListener("click", closePanel);

  // ---- song preview popup (Spotify embed when a track id is known; else a keyless 30s preview) ----
  var previewEl = null, previewAudio = null, audioWasPlaying = false;
  function ensurePreview() {
    if (previewEl) return;
    previewEl = document.createElement("div");
    previewEl.className = "preview";
    previewEl.innerHTML = '<div class="pvcard"><button class="pvclose" aria-label="Close">\u2715</button><div class="pvbody"></div></div>';
    document.body.appendChild(previewEl);
    previewEl.addEventListener("click", function (e) { if (e.target === previewEl) closePreview(); });
    previewEl.querySelector(".pvclose").addEventListener("click", closePreview);
  }
  function closePreview() {
    if (previewAudio) { try { previewAudio.pause(); } catch (e) {} previewAudio = null; }
    if (previewEl) previewEl.classList.remove("show");
    if (audioWasPlaying && window.BeatGenomeAudio && window.BeatGenomeAudio.resume) { window.BeatGenomeAudio.resume(); }
    audioWasPlaying = false;
  }
  function parseTrack(text) {
    var noYear = text.replace(/\s*\((?:19|20)\d\d\)\s*$/, "").trim();
    var parts = noYear.split(" - ");
    var title = parts[0] ? parts[0].trim() : noYear;
    var artist = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
    return { title: title, artist: artist, query: (title + " " + artist).trim() };
  }
  function openPreview(text) {
    ensurePreview();
    if (window.BeatGenomeAudio && window.BeatGenomeAudio.playing) { audioWasPlaying = true; window.BeatGenomeAudio.pause(); } else { audioWasPlaying = false; }
    var t = parseTrack(text), body = previewEl.querySelector(".pvbody");
    previewEl.style.setProperty("--nodeC", panelNode ? colourOf(panelNode) : "#1DB954");
    var spUrl = "https://open.spotify.com/search/" + encodeURIComponent(t.query);
    body.innerHTML = '<div class="pvtitle">' + esc(t.title) + '</div><div class="pvartist">' + esc(t.artist) + '</div>' +
      '<div class="pvplayer">loading preview\u2026</div>' +
      '<a class="pvspotify" href="' + spUrl + '" target="_blank" rel="noopener">Open in Spotify \u2197</a>';
    previewEl.classList.add("show");
    var player = body.querySelector(".pvplayer");
    var key = (t.title + "|" + t.artist).toLowerCase().replace(/[^a-z0-9|]/g, "");
    var sid = (window.SPOTIFY_IDS || {})[key];
    if (sid) {
      player.innerHTML = '<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/' + sid + '?utm_source=beatgenome" width="100%" height="152" frameborder="0" allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" loading="lazy"></iframe>';
      return;
    }
    fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(t.query) + "&entity=song&limit=1")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var hit = j.results && j.results[0];
        if (hit && hit.previewUrl) {
          var art = (hit.artworkUrl100 || "").replace("100x100bb", "300x300bb");
          player.innerHTML = (art ? '<img class="pvart" src="' + art + '" alt="">' : "") +
            '<audio class="pvaudio" controls autoplay src="' + hit.previewUrl + '"></audio>' +
            '<div class="pvnote">30-sec preview \u00b7 Apple Music</div>';
          previewAudio = player.querySelector("audio");
          if (previewAudio) { var pr = previewAudio.play(); if (pr && pr.catch) pr.catch(function () {}); }
        } else {
          player.innerHTML = '<div class="pvnote">No preview found \u2014 try Open in Spotify.</div>';
        }
      })
      .catch(function () { player.innerHTML = '<div class="pvnote">Preview unavailable \u2014 try Open in Spotify.</div>'; });
  }

  function select(n) { if (!n) return; selected = n; selectAnim = (performance.now() - t0) / 1000; splash(n.x, n.y, colourOf(n)); openPanel(n); centerOn(n); if (window.BeatGenomeOnSelect) { try { window.BeatGenomeOnSelect(n); } catch (e) {} } }

  // ---- search ----
  var resIdx = -1, resList = [];
  function runSearch() {
    query = searchIn.value.trim().toLowerCase();
    if (!query) { results.classList.remove("show"); matchSet = null; searchIn.setAttribute("aria-expanded", "false"); return; }
    resList = nodes.filter(function (n) {
      return n.name.toLowerCase().indexOf(query) >= 0 || n.family.toLowerCase().indexOf(query) >= 0;
    }).slice(0, 40);
    matchSet = {}; resList.forEach(function (n) { matchSet[n.id] = 1; });
    if (!resList.length) matchSet = null;
    results.innerHTML = resList.length
      ? resList.map(function (n, i) {
          return '<button role="option" data-id="' + n.id + '" class="' + (i === resIdx ? "active" : "") + '">' +
            '<span class="dot" style="background:' + colourOf(n) + '"></span>' + esc(n.name) +
            '<span class="fam">' + esc(n.family) + "</span></button>";
        }).join("")
      : '<div class="none">no genre matches "' + esc(query) + '"</div>';
    results.classList.add("show"); searchIn.setAttribute("aria-expanded", "true");
    Array.prototype.forEach.call(results.querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { pick(byId[b.dataset.id]); });
    });
  }
  function pick(n) { if (!n) return; results.classList.remove("show"); searchIn.value = n.name; matchSet = null; select(n); }
  searchIn.addEventListener("input", function () { resIdx = -1; runSearch(); });
  searchIn.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { resIdx = Math.min(resList.length - 1, resIdx + 1); runSearch(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { resIdx = Math.max(0, resIdx - 1); runSearch(); e.preventDefault(); }
    else if (e.key === "Enter") { pick(resList[resIdx >= 0 ? resIdx : 0]); }
    else if (e.key === "Escape") { results.classList.remove("show"); searchIn.blur(); }
  });

  // ---- legend (family or Camelot, depending on colour mode) ----
  var legendTitle = legend.querySelector("h4");
  function renderLegend() {
    var grid = document.getElementById("legendGrid"), h = "", k, hue;
    if (colourMode === "camelot") {
      legendTitle.firstChild.nodeValue = "Camelot ";
      document.getElementById("famCnt").textContent = "(A min / B maj)";
      for (k = 1; k <= 12; k++) {
        hue = ((k - 1) / 12) * 360;
        h += '<div class="row"><span class="dot" style="background:hsl(' + hue + ',85%,55%)"></span>' + k + "A / " + k + "B</div>";
      }
      grid.innerHTML = h;
    } else {
      legendTitle.firstChild.nodeValue = "Families ";
      document.getElementById("famCnt").textContent = "(" + fams.length + ")";
      DATA.families.forEach(function (f) {
        h += '<div class="row" data-fam="' + esc(f.name) + '"><span class="dot" style="background:' + f.colour + '"></span>' + esc(f.name) + "</div>";
      });
      grid.innerHTML = h;
      Array.prototype.forEach.call(grid.children, function (row) {
        row.addEventListener("click", function () {
          var fam = row.dataset.fam, gnode = nodes.filter(function (n) { return n.family === fam && n.level === "Genre"; })[0] || nodes.filter(function (n) { return n.family === fam; })[0];
          if (gnode) select(gnode);
        });
      });
    }
  }
  renderLegend();
  legend.querySelector(".tog").addEventListener("click", function () { legend.classList.toggle("collapsed"); });

  // ---- guides overlay ----
  (function buildGuides() {
    var tabs = document.getElementById("guideTabs"), body = document.getElementById("guideBody");
    var names = Object.keys(DATA.guides || {});
    if (!names.length) { document.getElementById("guidesBtn").style.display = "none"; return; }
    names.forEach(function (nm, i) {
      var b = document.createElement("button"); b.textContent = nm; b.className = i === 0 ? "active" : "";
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (x) { x.classList.remove("active"); });
        b.classList.add("active"); body.innerHTML = md(DATA.guides[nm]); body.parentNode.scrollTop = 0;
      });
      tabs.appendChild(b);
    });
    var x = document.createElement("button"); x.textContent = "✕ close"; x.className = "x";
    x.addEventListener("click", function () { overlay.classList.remove("show"); });
    tabs.appendChild(x);
    body.innerHTML = md(DATA.guides[names[0]]);
    document.getElementById("guidesBtn").addEventListener("click", function () { overlay.classList.add("show"); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.classList.remove("show"); });
  })();

  // minimal, safe markdown → html
  function md(src) {
    var lines = src.replace(/\r/g, "").split("\n"), out = [], i, inCode = false, code = [], tbl = [];
    function flushTbl() {
      if (!tbl.length) return;
      var rows = tbl.filter(function (r) { return !/^\s*\|?[\s:|-]+\|?\s*$/.test(r); });
      var html = "<table>";
      rows.forEach(function (r, ri) {
        var cells = r.replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
        html += "<tr>" + cells.map(function (c) { return (ri === 0 ? "<th>" + inline(c) + "</th>" : "<td>" + inline(c) + "</td>"); }).join("") + "</tr>";
      });
      out.push(html + "</table>"); tbl = [];
    }
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (/^```/.test(ln)) { if (inCode) { out.push("<pre>" + esc(code.join("\n")) + "</pre>"); code = []; } inCode = !inCode; continue; }
      if (inCode) { code.push(ln); continue; }
      if (/^\s*\|.*\|/.test(ln)) { tbl.push(ln); continue; } else flushTbl();
      if (/^###\s/.test(ln)) out.push("<h3>" + inline(ln.slice(4)) + "</h3>");
      else if (/^##\s/.test(ln)) out.push("<h2>" + inline(ln.slice(3)) + "</h2>");
      else if (/^#\s/.test(ln)) out.push("<h1>" + inline(ln.slice(2)) + "</h1>");
      else if (/^\s*[-*]\s/.test(ln)) {
        if (!out.length || out[out.length - 1].slice(-5) !== "</ul>") out.push("<ul></ul>");
        out[out.length - 1] = out[out.length - 1].replace("</ul>", "<li>" + inline(ln.replace(/^\s*[-*]\s/, "")) + "</li></ul>");
      }
      else if (/^\s*$/.test(ln)) out.push("");
      else out.push("<p>" + inline(ln) + "</p>");
    }
    flushTbl(); if (inCode) out.push("<pre>" + esc(code.join("\n")) + "</pre>");
    return out.join("\n");
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  // ---- channel dots ----
  CHANNELS.forEach(function (ch, i) {
    var b = document.createElement("button");
    b.style.background = "linear-gradient(135deg," + ch.c1 + "," + ch.c2 + ")";
    b.title = ch.name; b.setAttribute("aria-label", "Channel " + ch.name);
    b.addEventListener("click", function () { applyChannel(i); });
    chWrap.appendChild(b);
  });
  var savedCh = parseInt(store("edm_channel"), 10);
  applyChannel(isNaN(savedCh) ? 0 : savedCh);

  // ---- colour-mode toggle (family / Camelot key) ----
  var colourBtn = document.getElementById("colourBtn");
  if (colourBtn) {
    var updColourBtn = function () {
      colourBtn.textContent = colourMode === "camelot" ? "◑ KEY" : "◐ FAMILY";
      colourBtn.setAttribute("aria-pressed", colourMode === "camelot" ? "true" : "false");
    };
    updColourBtn();
    colourBtn.addEventListener("click", function () {
      colourMode = colourMode === "camelot" ? "family" : "camelot";
      store("edm_colourmode", colourMode);
      updColourBtn(); renderLegend();
      if (panelNode) panel.style.setProperty("--nodeC", colourOf(panelNode));
    });
  }

  // ---- global keys ----
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== searchIn) { e.preventDefault(); searchIn.focus(); searchIn.select(); }
    else if (e.key === "Escape") {
      if (previewEl && previewEl.classList.contains("show")) closePreview();
      else if (overlay.classList.contains("show")) overlay.classList.remove("show");
      else if (panel.classList.contains("open")) closePanel();
      else if (results.classList.contains("show")) results.classList.remove("show");
    }
  });
  document.getElementById("shuffleBtn").addEventListener("click", function () {
    select(nodes[Math.floor(Math.random() * nodes.length)]);
  });

  // ---- meta line ----
  document.getElementById("metaLine").textContent =
    DATA.meta.genres + " genres · " + DATA.meta.subgenres + " subgenres · " + DATA.meta.columns + " data points each";

  // ---- loading animation, then reveal ----
  var loadCv = document.getElementById("loadScope"), lcx = loadCv.getContext("2d");
  var loadStart = performance.now();
  (function loadAnim() {
    var el = document.getElementById("loading");
    if (el.classList.contains("done")) return;
    lcx.clearRect(0, 0, 440, 240);
    drawScope(lcx, 440, 240, { bpm: 128, energy: 8, colour: getComputedStyle(document.documentElement).getPropertyValue("--c1").trim() || "#FF3D9A" }, true);
    requestAnimationFrame(loadAnim);
  })();

  window.addEventListener("resize", function () { resize(); sizePanelScope(); updateDock(); });
  setTimeout(updateDock, 600);
  resize();
  // warm the simulation before revealing
  for (var w = 0; w < 220; w++) tick();
  cam.scale = 0.9; cam.x = 0; cam.y = 0;
  requestAnimationFrame(frame);
  setTimeout(function () { document.getElementById("loading").classList.add("done"); }, Math.max(300, 900 - (performance.now() - loadStart)));

  // expose for quick console poking / tests
  window.__GENOME = { nodes: nodes, links: links, byId: byId, select: select, version: "V10" };
})();
