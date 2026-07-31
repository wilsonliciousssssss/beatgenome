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
  var CHANNEL_ART = ["magenta", "cobalt", "lime", "orange", "magenta", "teal"];
  function setChannelArt(i) {
    var col = CHANNEL_ART[i] || "magenta";
    try {
      var olds = document.querySelectorAll('link[rel="icon"]');
      for (var k = 0; k < olds.length; k++) { if (olds[k].parentNode) olds[k].parentNode.removeChild(olds[k]); }
      var link = document.createElement("link");
      link.rel = "icon"; link.type = "image/png"; link.setAttribute("sizes", "48x48");
      link.href = "assets/icons/favicon-" + col + "-48.png?v=101";
      document.head.appendChild(link);
    } catch (e) {}
    try {
      var badge = document.querySelector(".badge");
      if (badge) badge.style.backgroundImage = 'url("assets/icons/product-' + col + '-216.png?v=101")';
    } catch (e) {}
  }
  function applyChannel(i) {
    var ch = CHANNELS[i] || CHANNELS[0];
    document.documentElement.style.setProperty("--c1", ch.c1);
    document.documentElement.style.setProperty("--c2", ch.c2);
    store("edm_channel", i);
    setChannelArt(i);
    Array.prototype.forEach.call(chWrap.children, function (b, j) {
      b.setAttribute("aria-pressed", j === i ? "true" : "false");
    });
    if (window.__syncMenuChannels) window.__syncMenuChannels();
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
  // V49: central Layout & Scale Manager (assets/layout-manager.js) is the single sizing source
  var LM = window.BeatGenomeLayout || null;
  var MX = LM ? LM.metrics() : null;
  var IS_TOUCH = MX ? MX.isTouch : !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  var QUALITY = MX ? MX.renderQuality : "high";
  var NODE_SCALE = MX ? MX.nodeScale : 1;
  var LABEL_SCALE = MX ? MX.typographyScale : 1;
  var DPR = Math.max(1, Math.min(2, (MX && MX.pixelRatio) || window.devicePixelRatio || 1));

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
    return (n.level === "Genre" ? 7 + (n.energy || 5) * 0.7 : 3.5 + (n.energy || 5) * 0.28) * NODE_SCALE;
  }
  // V75: past ZREF zoom, shrink glyphs in world-space so their ON-SCREEN size stays fixed
  // (positions still spread with zoom, so zooming in declutters instead of magnifying the pile)
  var ZREF = 1.0;
  function zc() { return cam.scale > ZREF ? ZREF / cam.scale : 1; }
  // V79: line thickness that scales with zoom (thinner out, thicker in), clamped so it never goes hairline/huge
  function lineW(px, mn, mx) { var s = Math.max(mn, Math.min(mx, px * cam.scale)); return s / cam.scale; }
  // node colour: by family (data) or by Camelot key (harmonic-mixing wheel)
  function camelotColour(nd) {
    var m = (nd.camelot || "").match(/(\d+)\s*([ABab])/);
    if (!m) return "hsl(0,0%,55%)";
    var hue = ((parseInt(m[1], 10) - 1) / 12) * 360;
    return m[2].toUpperCase() === "B" ? "hsl(" + hue + ",70%,66%)" : "hsl(" + hue + ",85%,55%)";
  }
  var colourMode = (store("edm_colourmode") === "camelot") ? "camelot" : "family";
  function colourOf(nd) { return colourMode === "camelot" ? camelotColour(nd) : nd.colour; }
  // ---- V19: family-encoded node glyphs (sharp/pixel) ----
  var GLYPHS = ["square", "diamond", "plus", "xbox", "ring", "tri", "boxdot", "aster"];
  function glyphFor(nd) { var fi = famIndex[nd.family]; if (fi == null) fi = 0; return GLYPHS[fi % GLYPHS.length]; }
  function drawGlyph(g, shape, x, y, r) {
    switch (shape) {
      case "diamond": g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); break;
      case "plus": { var t = r * 0.42; g.fillRect(x - t, y - r, 2 * t, 2 * r); g.fillRect(x - r, y - t, 2 * r, 2 * t); break; }
      case "xbox": { var t2 = r * 0.4; g.save(); g.translate(x, y); g.rotate(0.785398); g.fillRect(-t2, -r, 2 * t2, 2 * r); g.fillRect(-r, -t2, 2 * r, 2 * t2); g.restore(); break; }
      case "ring": g.lineWidth = Math.max(1.1, r * 0.46); g.beginPath(); g.arc(x, y, r * 0.82, 0, 6.2832); g.stroke(); break;
      case "tri": g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.82); g.lineTo(x - r, y + r * 0.82); g.closePath(); g.fill(); break;
      case "boxdot": g.lineWidth = Math.max(1, r * 0.3); g.strokeRect(x - r, y - r, 2 * r, 2 * r); g.beginPath(); g.arc(x, y, r * 0.3, 0, 6.2832); g.fill(); break;
      case "aster": { g.lineWidth = Math.max(1, r * 0.3); g.beginPath(); for (var k = 0; k < 6; k++) { var an = k * 1.0472; g.moveTo(x, y); g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } g.stroke(); break; }
      default: g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }

  // ---- view transform ----
  var cam = { x: 0, y: 0, scale: 0.9 }, W = 0, H = 0;
  var orbitRot = 0, orbitVel = 0, orbitDragAng = 0, orbitTouchedAt = 0;   // V81/V82: master wheel-rotation + idle-drift clock
  var MINKEY = ["", "G#m", "D#m", "A#m", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m"];   // Camelot number -> minor key (A ring)
  var MAJKEY = ["", "B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];               // -> relative major (B ring)
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
  function splash(x, y, c) { waves.push({ x: x, y: y, t: (performance.now() - t0) / 1000, c: c }); if (waves.length > (QUALITY === "reduced" ? 3 : 8)) waves.shift(); reheat(0.8); }

  // ---- render ----
  var hover = null, selected = null, query = "", matchSet = null, selectAnim = -1e9, waves = [], reduceMotion = false;
  var focusMode = "all", userSetFocus = false, interactingUntil = 0;
  try { reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function draw() {
    gx.clearRect(0, 0, W, H);
    var RS = (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) ? window.BeatGenomeAudio.getReactiveState() : null;
    gx.save();
    gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);

    // V49 focus-mode visibility set: ALL = null, FAMILY = same family, RELATED = neighbours
    var fset = null;
    if (selected && focusMode !== "all") {
      fset = {}; fset[selected.id] = 1;
      if (focusMode === "family") { for (var fi2 = 0; fi2 < nodes.length; fi2++) { if (nodes[fi2].family === selected.family) fset[nodes[fi2].id] = 1; } }
      else { for (var akey in adj[selected.id]) fset[akey] = 1; }
    }
    // base links (child only, faint) - second faded pass when focus mode dims part of the graph
    gx.lineWidth = Math.max(0.6, 0.75 * (MX ? MX.graphScale : 1)) / cam.scale;
    gx.strokeStyle = "rgba(198,240,0,0.10)";
    gx.beginPath();
    for (var i = 0; i < links.length; i++) {
      if (links[i].k !== "child") continue;
      if (fset && !(fset[links[i].s] && fset[links[i].t])) continue;
      var n = byId[links[i].s], m = byId[links[i].t];
      gx.moveTo(n.x, n.y); gx.lineTo(m.x, m.y);
    }
    gx.stroke();
    if (fset) {
      gx.globalAlpha = 0.3;
      gx.beginPath();
      for (i = 0; i < links.length; i++) {
        if (links[i].k !== "child") continue;
        if (fset[links[i].s] && fset[links[i].t]) continue;
        var n2f = byId[links[i].s], m2f = byId[links[i].t];
        gx.moveTo(n2f.x, n2f.y); gx.lineTo(m2f.x, m2f.y);
      }
      gx.stroke(); gx.globalAlpha = 1;
    }

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

    // nodes — glyph by family; hubs get glitch-split + bold square frame (V19)
    var nowS = (performance.now() - t0) / 1000;
    for (i = 0; i < nodes.length; i++) {
      var nd = nodes[i], r0 = radius(nd) * zc();
      var dim = matchSet && !matchSet[nd.id];
      var dimF = fset && !fset[nd.id];
      var isFocus = focus && (nd === focus || adj[focus.id][nd.id]);
      var isHub = nd.level === "Genre";
      var beat = (nowS * (nd.bpm || 120) / 60) % 1;
      var thump = Math.pow(1 - beat, 3);
      var r = r0 * (1 + 0.16 * thump);
      var col = colourOf(nd);
      var shape = glyphFor(nd);
      if (nd === selected) { var se = nowS - selectAnim; if (se >= 0 && se < 0.85) r *= 1 + 0.55 * Math.exp(-7 * se) * Math.cos(16 * se); }
      if (RS && RS.playing && nd === selected && !reduceMotion) r *= 1 + RS.kick * 0.28 + RS.bass * 0.05;
      var baseA = dim ? (IS_TOUCH ? 0.35 : 0.12) : dimF ? 0.18 : (focus && !isFocus ? 0.28 : 1);
      // hub beat-ring — a square outline expanding once per beat
      if (isHub && !dim) {
        var rr = r + beat * (r0 * 2.4);
        gx.globalAlpha = baseA * 0.42 * (1 - beat);
        gx.strokeStyle = col; gx.lineWidth = 1.4 / cam.scale;
        gx.strokeRect(nd.x - rr, nd.y - rr, rr * 2, rr * 2);
        gx.globalAlpha = 1;
      }
      gx.globalAlpha = baseA;
      // hubs: cyan/magenta glitch split behind the fill (ΛΩ look)
      if (isHub && !dim) {
        var off = Math.max(1.1, r * 0.26);
        gx.fillStyle = "#00DCFF"; gx.strokeStyle = "#00DCFF"; drawGlyph(gx, shape, nd.x - off, nd.y, r);
        gx.fillStyle = "#FF288F"; gx.strokeStyle = "#FF288F"; drawGlyph(gx, shape, nd.x + off, nd.y, r);
      }
      gx.fillStyle = col; gx.strokeStyle = col;
      gx.shadowColor = col; gx.shadowBlur = QUALITY === "reduced" ? 0 : (nd === focus ? 22 : 8) + 7 * thump + (RS && nd === selected ? RS.chord * 12 : 0);
      drawGlyph(gx, shape, nd.x, nd.y, r);
      gx.shadowBlur = 0;
      // hub distinct bold square frame
      if (isHub) {
        var fr = r + Math.max(2.2, r * 0.7);
        gx.lineWidth = Math.max(1.6, r * 0.3);
        gx.strokeStyle = (nd === selected) ? "#fff" : col;
        gx.strokeRect(nd.x - fr, nd.y - fr, fr * 2, fr * 2);
      } else if (nd === selected) {
        var sf = r + Math.max(1.6, r * 0.6);
        gx.lineWidth = Math.max(1.2, r * 0.26); gx.strokeStyle = "#fff";
        gx.strokeRect(nd.x - sf, nd.y - sf, sf * 2, sf * 2);
      }
      gx.globalAlpha = 1;

      // labels - V49 adaptive density: fewer on small screens, fewer while panning, selected always
      var dens = MX ? MX.labelDensity : "high";
      var allTh = dens === "low" ? 2.2 : dens === "medium" ? 1.9 : 1.7;
      var busy = performance.now() < interactingUntil;
      var showLabel = (isHub && cam.scale > 0.5) || nd === focus || nd === selected || (!busy && cam.scale > allTh);
      if (busy && !isHub && nd !== focus && nd !== selected) showLabel = false;
      if (showLabel && !dim && !dimF) {
        gx.globalAlpha = focus && !isFocus ? 0.3 : 1;
        var fpx = Math.max(10, (nd === focus || nd === selected ? 13 : isHub ? 12 : 10.5) * LABEL_SCALE);
        gx.font = (isHub ? "600 " : "400 ") + (fpx / cam.scale) + "px 'Space Grotesk',sans-serif";
        gx.fillStyle = nd === focus ? "#fff" : "rgba(236,236,244,0.85)";
        gx.textAlign = "center";
        gx.fillText(nd.name, nd.x, nd.y - r - 6 / cam.scale);
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

  // ================= V20: DNA timeline view + bpm/bar glitch =================
  var _sv0 = store("edm_view"); var viewMode = (_sv0 === "dna" || _sv0 === "orbit" || _sv0 === "metro") ? _sv0 : "graph";
  var trans = null;
  var dnaPending = null;
  var DNA = { width: 2600, minY: 1970, maxY: 2025, genres: [] };
  var DNA_R = 118;
  function parseEra(s) {
    s = (s || "").toLowerCase();
    var yrs = (s.match(/(?:19|20)\d\d/g) || []).map(Number);
    var mod = /early/.test(s) ? 1 : /late/.test(s) ? 8 : 5;
    if (yrs.length > 1) return Math.round((yrs[0] + yrs[yrs.length - 1]) / 2);
    if (yrs.length === 1) return Math.floor(yrs[0] / 10) * 10 + mod;
    return null;
  }
  function mapX(y) { var span = (DNA.maxY - DNA.minY) || 1; return (((y - DNA.minY) / span) - 0.5) * DNA.width; }
  function seededF(i, salt) { var x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); }
  function buildTimeline() {
    var gen = nodes.filter(function (n) { return n.level === "Genre"; });
    gen.forEach(function (n) { n._year = parseEra(n.d.Era); });
    var famYear = {};
    gen.forEach(function (n) { if (n._year != null) famYear[n.family] = n._year; });
    var allY = gen.map(function (n) { return n._year; }).filter(function (y) { return y != null; }).sort(function (p, q) { return p - q; });
    var medY = allY.length ? allY[Math.floor(allY.length / 2)] : 2005;
    gen.forEach(function (n) { if (n._year == null) n._year = medY; });
    nodes.forEach(function (n) { if (n.level !== "Genre") { n._year = parseEra(n.d.Era) || famYear[n.family] || medY; } });
    var ys = nodes.map(function (n) { return n._year; });
    DNA.minY = Math.min(1970, Math.min.apply(null, ys));
    DNA.maxY = Math.max(2025, Math.max.apply(null, ys));
    gen.sort(function (p, q) { return (p._year - q._year) || p.name.localeCompare(q.name); });
    var byYear = {};
    gen.forEach(function (n) { (byYear[n._year] = byYear[n._year] || []).push(n); });
    Object.keys(byYear).forEach(function (yy) {
      var arr = byYear[yy];
      arr.forEach(function (n, j) { n._hx = mapX(n._year) + (j - (arr.length - 1) / 2) * 30; n._strand = j % 2; });
    });
    gen.forEach(function (n) { n._subs = nodes.filter(function (m) { return m.level !== "Genre" && m.family === n.family; }); });
    DNA.genres = gen;
    var subs = nodes.filter(function (n) { return n.level !== "Genre"; });
    subs.forEach(function (m, i) {
      m._fx = mapX(m._year) + (seededF(i, 1) - 0.5) * 46;
      var side = (i % 2) ? 1 : -1;
      m._fyBase = side * (DNA_R + 44 + seededF(i, 2) * 132);
    });
    DNA.subs = subs;
  }
  function fitDNA() { cam.x = 0; cam.y = 0; var sw = (W * 0.92) / DNA.width, sh = (H * 0.88) / (2 * (DNA_R + 190)); cam.scale = Math.max(0.24, Math.min(1.1, Math.min(sw, sh))); }
  function startViewTransition(toMode) {
    var from = { x: cam.x, y: cam.y, scale: cam.scale }, to, toDNA = (toMode === "dna");
    if (toDNA) { var sw = (W * 0.92) / DNA.width, sh = (H * 0.88) / (2 * (DNA_R + 190)); to = { x: 0, y: 0, scale: Math.max(0.24, Math.min(1.1, Math.min(sw, sh))) }; }
    else { to = { x: 0, y: 0, scale: 0.9 }; }
    for (var i = 0; i < nodes.length; i++) { var n = nodes[i]; if (toDNA) { n._mx0 = n.x; n._my0 = n.y; } else { n._mx0 = (n._dx != null ? n._dx : n.x); n._my0 = (n._dy != null ? n._dy : n.y); } }
    trans = { t0: (performance.now() - t0) / 1000, dur: reduceMotion ? 0.5 : 1.1, from: from, to: to, toMode: toMode, toDNA: toDNA };
  }
  function drawMorph(e, toDNA) {
    gx.clearRect(0, 0, W, H);
    gx.save();
    gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);
    var t = (performance.now() - t0) / 1000, cbpm = focusParams().bpm || 124, turn = t * (cbpm / 120) * 0.85, R = DNA_R;
    var pres = toDNA ? e : (1 - e), gj = reduceMotion ? 0 : (1 - pres) * 22;
    if (pres > 0.02) {
      var x0 = mapX(DNA.minY) - 30, x1 = mapX(DNA.maxY) + 30, strand, xx, ph, yy;
      for (strand = 0; strand < 2; strand++) {
        gx.beginPath();
        for (xx = x0; xx <= x1; xx += 9) { ph = (xx / 210) + turn + strand * Math.PI; yy = Math.sin(ph) * R + Math.sin(xx * 3.3 + t * 40 + strand * 2) * gj; if (xx === x0) gx.moveTo(xx, yy); else gx.lineTo(xx, yy); }
        gx.globalAlpha = pres; gx.strokeStyle = "rgba(198,240,0,0.5)"; gx.lineWidth = (9.6 / cam.scale) * (0.35 + 0.65 * pres); gx.stroke();
      }
      // V56: adenine/thymine rungs WARP from straight lines into the DNA electric waveform
      // wv 0 -> straight glitchy rung (graph side) ; wv 1 -> full DNA wave (matches drawDNA for a seamless handoff)
      var wv = pres * pres, beatHz2 = cbpm / 60, eframe = Math.floor(t * 26);
      gx.shadowColor = "rgba(120,210,255,0.85)"; gx.lineCap = "round";
      gx.setLineDash([0.6 / cam.scale, 5.5 / cam.scale]); gx.lineDashOffset = -(t * beatHz2 * 30) / cam.scale;
      for (xx = x0; xx <= x1; xx += 40) {
        var pr = (xx / 210) + turn, ya = Math.sin(pr) * R, yb = Math.sin(pr + Math.PI) * R, dep = Math.cos(pr);
        var flick = 0.55 + 0.45 * Math.abs(Math.sin(xx * 0.9 + t * 21));
        gx.globalAlpha = pres * (0.34 + 0.4 * (dep + 1) / 2) * flick;
        gx.strokeStyle = "rgba(150,226,255,0.95)"; gx.lineWidth = 1.5 / cam.scale; gx.shadowBlur = 5 * pres;
        gx.beginPath();
        for (var sw = 0; sw <= 1.0001; sw += 0.06) {
          var yy2 = ya + (yb - ya) * sw, tap = Math.sin(sw * Math.PI);
          var wave = Math.sin(sw * Math.PI * 3 + xx * 0.05 - t * beatHz2 * Math.PI * 2);
          var sd = Math.sin((sw * 57.3 + xx * 3.1 + eframe) * 12.9898) * 43758.5453, jit = (sd - Math.floor(sd)) - 0.5;
          var off = (wave + jit * 1.1) * tap * (26 + 12 * (dep + 1) / 2) * wv + Math.sin(xx * 3.3 + t * 40) * gj * (1 - wv);
          if (sw === 0) gx.moveTo(xx + off, yy2); else gx.lineTo(xx + off, yy2);
        }
        gx.stroke();
      }
      gx.setLineDash([]); gx.lineCap = "butt"; gx.shadowBlur = 0;
      gx.globalAlpha = 1;
    }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], tx, ty;
      if (toDNA) { if (n.level === "Genre") { var ph2 = (n._hx / 210) + turn + n._strand * Math.PI; tx = n._hx; ty = Math.sin(ph2) * R; } else { tx = n._fx; ty = n._fyBase; } }
      else { tx = n.x; ty = n.y; }
      var x = n._mx0 + (tx - n._mx0) * e, y = n._my0 + (ty - n._my0) * e;
      var col = colourOf(n), isHub = n.level === "Genre", r = radius(n) * (isHub ? 1.25 : 1.1), sh = glyphFor(n);
      if (isHub) { var off = Math.max(1.1, r * 0.26); gx.fillStyle = "#00DCFF"; gx.strokeStyle = "#00DCFF"; drawGlyph(gx, sh, x - off, y, r); gx.fillStyle = "#FF288F"; gx.strokeStyle = "#FF288F"; drawGlyph(gx, sh, x + off, y, r); }
      gx.fillStyle = col; gx.strokeStyle = col; gx.shadowColor = col; gx.shadowBlur = 8; drawGlyph(gx, sh, x, y, r); gx.shadowBlur = 0;
      if (isHub) { var fr = r + Math.max(2.2, r * 0.7); gx.lineWidth = Math.max(1.5, r * 0.28); gx.strokeStyle = col; gx.strokeRect(x - fr, y - fr, fr * 2, fr * 2); }
    }
    gx.restore();
  }
  function plotGlyph(n, x, y, r, alpha, isHub, hot) {
    var col = colourOf(n), sh = glyphFor(n);
    gx.globalAlpha = alpha;
    if (isHub) {
      var off = Math.max(1.1, r * 0.26);
      gx.fillStyle = "#00DCFF"; gx.strokeStyle = "#00DCFF"; drawGlyph(gx, sh, x - off, y, r);
      gx.fillStyle = "#FF288F"; gx.strokeStyle = "#FF288F"; drawGlyph(gx, sh, x + off, y, r);
    }
    gx.fillStyle = col; gx.strokeStyle = col;
    gx.shadowColor = col; gx.shadowBlur = hot ? 20 : 8;
    drawGlyph(gx, sh, x, y, r);
    gx.shadowBlur = 0;
    if (isHub) {
      var fr = r + Math.max(2.2, r * 0.7);
      gx.lineWidth = Math.max(1.5, r * 0.28); gx.strokeStyle = hot ? "#fff" : col;
      gx.strokeRect(x - fr, y - fr, fr * 2, fr * 2);
    }
    gx.globalAlpha = 1; n._dx = x; n._dy = y;
  }
  function drawDNA() {
    gx.clearRect(0, 0, W, H);
    gx.save();
    gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);
    var t = (performance.now() - t0) / 1000;
    var cbpm = 124, ccd = 1e9;
    for (var ci = 0; ci < DNA.genres.length; ci++) { var cgd = Math.abs(DNA.genres[ci]._hx - cam.x); if (cgd < ccd) { ccd = cgd; cbpm = DNA.genres[ci].bpm || 124; } }
    var turn = t * (cbpm / 120) * 0.85;
    var beatHz = cbpm / 60;
    function wob(x) { return Math.sin(x * 0.016 - t * beatHz * Math.PI) * 34; }
    var R = DNA_R, x0 = mapX(DNA.minY) - 30, x1 = mapX(DNA.maxY) + 30, TOP = R + 190;
    gx.textAlign = "center"; gx.font = (12 / cam.scale) + "px 'Space Mono',monospace";
    for (var yr = Math.ceil(DNA.minY / 10) * 10; yr <= DNA.maxY; yr += 10) {
      var xd = mapX(yr);
      gx.strokeStyle = "rgba(255,255,255,0.055)"; gx.lineWidth = 1 / cam.scale;
      gx.beginPath(); gx.moveTo(xd, -TOP); gx.lineTo(xd, TOP); gx.stroke();
      gx.fillStyle = "rgba(154,154,182,0.6)"; gx.fillText(yr + "s", xd, -TOP + 20);
    }
    for (var strand = 0; strand < 2; strand++) {
      gx.beginPath();
      for (var xx = x0; xx <= x1; xx += 9) { var ph = (xx / 210) + turn + strand * Math.PI, yy = Math.sin(ph) * R; if (xx === x0) gx.moveTo(xx, yy); else gx.lineTo(xx, yy); }
      gx.strokeStyle = "rgba(198,240,0,0.5)"; gx.lineWidth = lineW(14, 4, 22); gx.stroke();
    }
    var eframe = Math.floor(t * 26);
    var dashDot = 0.6 / cam.scale, dashGap = 5.5 / cam.scale, dashOff = -(t * beatHz * 30) / cam.scale;
    gx.shadowColor = "rgba(120,210,255,0.85)"; gx.lineCap = "round";
    for (var xrg = x0; xrg <= x1; xrg += 40) {
      var pr = (xrg / 210) + turn, ya = Math.sin(pr) * R, yb = Math.sin(pr + Math.PI) * R, dep = Math.cos(pr);
      var flick = 0.55 + 0.45 * Math.abs(Math.sin(xrg * 0.9 + t * 21));
      gx.globalAlpha = (0.18 + 0.26 * (dep + 1) / 2) * flick;
      gx.strokeStyle = "rgba(150,226,255,0.95)"; gx.lineWidth = 1.5 / cam.scale; gx.shadowBlur = 5;
      gx.setLineDash([dashDot, dashGap]); gx.lineDashOffset = dashOff;
      gx.beginPath();
      for (var sw = 0; sw <= 1.0001; sw += 0.06) {
        var yy = ya + (yb - ya) * sw, tap = Math.sin(sw * Math.PI);
        var base = Math.sin(sw * Math.PI * 3 + xrg * 0.05 - t * beatHz * Math.PI * 2);
        var sd = Math.sin((sw * 57.3 + xrg * 3.1 + eframe) * 12.9898) * 43758.5453; var jit = (sd - Math.floor(sd)) - 0.5;
        var off = (base + jit * 1.1) * tap * (26 + 12 * (dep + 1) / 2);
        if (sw === 0) gx.moveTo(xrg + off, yy); else gx.lineTo(xrg + off, yy);
      }
      gx.stroke();
    }
    gx.setLineDash([]); gx.lineCap = "butt"; gx.shadowBlur = 0;
    gx.globalAlpha = 1;
    var focus = hover || selected;
    DNA.genres.forEach(function (n) { var ph = (n._hx / 210) + turn + n._strand * Math.PI; n._dx = n._hx; n._dy = Math.sin(ph) * R; n._dep = Math.cos(ph); });
    DNA.subs.forEach(function (m) { m._dx = m._fx + Math.cos(t * 0.24 + (m.wb || 0)) * 10; m._dy = m._fyBase + Math.sin(t * 0.30 + (m.wa || 0)) * 14; });
    if (focus) {
      gx.strokeStyle = "rgba(198,240,0,0.55)"; gx.lineWidth = 1.3 / cam.scale; gx.setLineDash([5 / cam.scale, 4 / cam.scale]);
      if (focus.level === "Genre") {
        (focus._subs || []).forEach(function (m) { if (m._dx != null) { gx.beginPath(); gx.moveTo(focus._dx, focus._dy); gx.lineTo(m._dx, m._dy); gx.stroke(); } });
        gx.setLineDash([]);
      } else {
        var g = DNA.genres.filter(function (f) { return f.family === focus.family; })[0];
        if (g && g._dx != null) {
          gx.beginPath(); gx.moveTo(focus._dx, focus._dy); gx.lineTo(g._dx, g._dy); gx.stroke(); gx.setLineDash([]);
          gx.font = "600 " + (11 / cam.scale) + "px 'Space Grotesk',sans-serif"; gx.fillStyle = "#C6F000"; gx.textAlign = "center";
          gx.fillText("↳ " + g.name, focus._dx, focus._dy + radius(focus) * 1.2 + 15 / cam.scale);
        }
        gx.setLineDash([]);
      }
    }
    DNA.subs.forEach(function (m) {
      var dim = matchSet && !matchSet[m.id];
      var rel = focus && ((focus === m) || (focus.family === m.family));
      var mbeat = (t * (m.bpm || 120) / 60) % 1, mthump = Math.pow(1 - mbeat, 3);
      var r = radius(m) * zc() * 1.12 * (1 + 0.22 * mthump);
      plotGlyph(m, m._dx, m._dy, r, dim ? 0.12 : (focus && !rel ? 0.4 : 0.82), false, focus === m);
      if (rel) {
        gx.globalAlpha = 1; gx.font = "400 " + (10 / cam.scale) + "px 'Space Grotesk',sans-serif"; gx.fillStyle = focus === m ? "#fff" : "rgba(236,236,244,0.82)"; gx.textAlign = "center";
        gx.fillText(m.name, m._dx, m._dy - r - 5 / cam.scale); gx.globalAlpha = 1;
      }
    });
    DNA.genres.forEach(function (n) {
      var sc = 0.62 + 0.38 * (n._dep + 1) / 2, dim = matchSet && !matchSet[n.id];
      var rel = focus && (n === focus || focus.family === n.family);
      var nbeat = (t * (n.bpm || 120) / 60) % 1, nthump = Math.pow(1 - nbeat, 3);
      var r = radius(n) * zc() * 1.25 * sc * (1 + 0.22 * nthump);
      plotGlyph(n, n._dx, n._dy, r, dim ? 0.16 : 1, true, rel);
      gx.globalAlpha = dim ? 0.2 : (0.55 + 0.45 * (n._dep + 1) / 2);
      gx.font = "600 " + (11 / cam.scale) + "px 'Space Grotesk',sans-serif"; gx.fillStyle = rel ? "#fff" : "rgba(236,236,244,0.85)"; gx.textAlign = "center";
      gx.fillText(n.name, n._dx, n._dy - r - 6 / cam.scale); gx.globalAlpha = 1;
    });
    gx.restore();
  }
  function nodeAtDNA(px, py) {
    var w = toWorld(px, py), best = null, bd = 1e9, pool = DNA.genres.concat(DNA.subs);
    for (var i = 0; i < pool.length; i++) {
      var n = pool[i]; if (n._dx == null) continue;
      var dx = n._dx - w.x, dy = n._dy - w.y, d = dx * dx + dy * dy, rr = radius(n) * zc() * 1.4 + 8 / cam.scale;
      if (d < rr * rr && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // ---- V70: Camelot Orbit scene (harmonic-mixing solar system) ----
  // Main genres are planets placed on the Camelot wheel (A = minor inner ring, B = major
  // outer ring, 12 at the top clockwise); their subgenres orbit them as moons. Hub/orphan
  // glyph design is preserved (planets = hub glitch+frame, moons = orphan glyphs).
  var ORBIT = { rA: 300, rB: 780, sun: 165, rIn: 255, rOut: 780, rings: [], genres: [], subs: [] };
  function buildOrbit() {
    var gen = nodes.filter(function (n) { return n.level === "Genre"; });
    var slot = {}, es = [];
    gen.forEach(function (g) {
      var m = (g.camelot || "").match(/(\d+)\s*([ABab])/);
      g._cn = m ? (((parseInt(m[1], 10) - 1) % 12) + 1) : 0;
      g._cl = m ? m[2].toUpperCase() : "?";
      es.push(g.energy || 5);
      (slot[g._cn] = slot[g._cn] || []).push(g);                          // group by key NUMBER = angular sector
    });
    var eMin = Math.min.apply(null, es), eMax = Math.max.apply(null, es); if (eMax <= eMin) eMax = eMin + 1;
    Object.keys(slot).forEach(function (kn) {
      var arr = slot[kn]; arr.sort(function (a, b) { return ((a.energy || 5) - (b.energy || 5)) || (a._cl < b._cl ? -1 : 1); });
      var total = arr.length;
      arr.forEach(function (g, idx) {
        var base = ((g._cn % 12) / 12) * Math.PI * 2 - Math.PI / 2;       // 12 at top, clockwise
        var fanW = Math.min(0.5, 0.12 * total);                          // busy keys fan wider across their sector
        g._oa = base + (total > 1 ? (idx / (total - 1) - 0.5) * fanW : 0);
        var tE = ((g.energy || 5) - eMin) / (eMax - eMin);               // energy -> orbital distance (inner calm .. outer intense)
        var bias = g._cl === "A" ? -0.08 : g._cl === "B" ? 0.08 : 0;      // minor pulled inner, major pushed outer
        var frac = Math.max(0.02, Math.min(0.98, tE * 0.84 + 0.09 + bias));
        var jit = (seededF(idx * 7 + g._cn, 5) - 0.5) * 46;              // de-collide same-energy planets on a ring
        g._or = ORBIT.rIn + frac * (ORBIT.rOut - ORBIT.rIn) + jit;
      });
    });
    ORBIT.rings = []; for (var ri = 0; ri < 6; ri++) ORBIT.rings.push(ORBIT.rIn + (ORBIT.rOut - ORBIT.rIn) * (ri / 5));
    var subs = nodes.filter(function (n) { return n.level !== "Genre"; });
    subs.forEach(function (s, i) {
      var p = null;
      for (var k in adj[s.id]) { if (adj[s.id][k] === "child" && byId[k] && byId[k].level === "Genre") { p = byId[k]; break; } }
      if (!p) { var fam = gen.filter(function (g) { return g.family === s.family; }); p = fam[0] || gen[0]; }
      s._parentG = p; s._moonI = i;
    });
    gen.forEach(function (g) { g._moons = subs.filter(function (s) { return s._parentG === g; }); });
    subs.forEach(function (s) {
      var p = s._parentG, mi = p._moons.indexOf(s), mt = p._moons.length;
      s._moonR = radius(p) * 1.7 + 15 + (mi % 4) * 12;                     // moon orbit radius (a few rings)
      s._moonPh = (mt > 1 ? (mi / mt) * Math.PI * 2 : 0) + seededF(s._moonI, 3) * 0.7;
      s._moonSp = (0.1 + seededF(s._moonI, 4) * 0.14) * ((mi % 2) ? 1 : -1); // orbital speed + direction
    });
    ORBIT.genres = gen; ORBIT.subs = subs;
  }
  function fitOrbit() { cam.x = 0; cam.y = 0; var need = (ORBIT.rB + 130) * 2; cam.scale = Math.max(0.22, Math.min(1.0, Math.min(W, H) * 0.92 / need)); }
  function orbitScreenAngle(px, py) { var ox = W / 2 - cam.x * cam.scale, oy = H / 2 - cam.y * cam.scale; return Math.atan2(py - oy, px - ox); }
  function orbitKick(dir) { orbitVel = dir * 0.052; orbitTouchedAt = performance.now(); interactingUntil = performance.now() + 350; }   // ~one 30-deg sector
  var _lastActiveK = -1;
  function orbitActiveKey() { var s = Math.round(-orbitRot / (Math.PI / 6)), kk = ((s % 12) + 12) % 12; return kk === 0 ? 12 : kk; }   // Camelot number at the top
  function orbitKeyLabel(k) { return "\u25c4  " + k + " \u00b7 " + MINKEY[k] + " \u00b7 " + MAJKEY[k] + "  \u25ba"; }
  function rotateGraph(th) {                                            // V87: slow clockwise spin of the whole graph
    var n0 = nodes.length; if (!n0) return; var cx = 0, cy = 0, i;
    for (i = 0; i < n0; i++) { cx += nodes[i].x; cy += nodes[i].y; } cx /= n0; cy /= n0;
    var c = Math.cos(th), s = Math.sin(th);
    for (i = 0; i < n0; i++) { var nd = nodes[i]; if (nd.fixed) continue; var dx = nd.x - cx, dy = nd.y - cy; nd.x = cx + dx * c - dy * s; nd.y = cy + dx * s + dy * c; }
  }
  var hiIdx = { graph: -1, dna: -1, metro: -1 }, matchFromCtl = false, DECADES = [1970, 1980, 1990, 2000, 2010, 2020];
  function ctlCategory(m) {
    if (m === "graph") return { n: fams.length, name: function (i) { return fams[i]; }, test: function (i) { var f = fams[i]; return function (nd) { return nd.family === f; }; } };
    if (m === "metro") { if (!MOODS) return null; return { n: MOODS.length, name: function (i) { return MOODS[i][0].toUpperCase(); }, test: function (i) { return function (nd) { return nodeHasMood(nd, i); }; } }; }
    if (m === "dna") return { n: DECADES.length, name: function (i) { return DECADES[i] + "s"; }, test: function (i) { var d = DECADES[i]; return function (nd) { return Math.floor((nd._year || 0) / 10) * 10 === d; }; } };
    return null;
  }
  function applyCtlHighlight(m) {                                       // V85: highlight one category (dims the rest)
    var c = ctlCategory(m), i = c ? hiIdx[m] : -1;
    if (!c || i < 0) { updSceneCtl(m); return; }
    var test = c.test(i), ms = {}, any = false;
    for (var k = 0; k < nodes.length; k++) { if (test(nodes[k])) { ms[nodes[k].id] = 1; any = true; } }
    matchSet = any ? ms : null; matchFromCtl = true; updSceneCtl(m);
  }
  function sceneCtlLabel(m) {
    m = m || viewMode;
    if (m === "orbit") return orbitKeyLabel(orbitActiveKey());
    var c = ctlCategory(m), i = c ? hiIdx[m] : -1, noun = m === "graph" ? "FAMILIES" : m === "dna" ? "ERAS" : "MOODS";
    if (!c || i < 0) return "◄►  HIGHLIGHT " + noun;
    return "◄  " + c.name(i) + "  ►";
  }
  function sceneNudge(dir) {                                            // orbit rotates; every other scene cycles + highlights a category
    if (viewMode === "orbit") { orbitKick(dir); return; }
    var c = ctlCategory(viewMode); if (!c) return;
    var idx = hiIdx[viewMode] + dir;
    if (idx >= c.n) idx = -1; else if (idx < -1) idx = c.n - 1;         // pass the end -> a "clear" state
    hiIdx[viewMode] = idx;
    if (idx < 0) { if (matchFromCtl) { matchSet = null; matchFromCtl = false; } updSceneCtl(viewMode); } else applyCtlHighlight(viewMode);
    interactingUntil = performance.now() + 350;
  }
  function updSceneCtl(m) { if (!orbitCtl) return; orbitCtl.hidden = false; orbitCtl.setAttribute("aria-hidden", "false"); var _h = orbitCtl.querySelector(".orbithint"); if (_h) _h.textContent = sceneCtlLabel(m); }
  function stepOrbitRotation() {
    var st = Math.PI / 6;                                               // 30-deg sectors
    if (Math.abs(orbitVel) > 0.0006) { orbitRot += orbitVel; orbitVel *= 0.9; return; }   // inertia
    orbitVel = 0;
    if (performance.now() - orbitTouchedAt > 1000) { orbitRot += 0.0015; }   // V82/V83: slow continuous drift of the whole chart around the sun
    else { var tg = Math.round(orbitRot / st) * st, d = tg - orbitRot; if (Math.abs(d) > 0.0012) orbitRot += d * 0.14; else orbitRot = tg; }   // soft snap after a manual rotate
  }
  function nodeAtOrbit(px, py) {
    var w = toWorld(px, py), best = null, bd = 1e9, pool = ORBIT.subs.concat(ORBIT.genres);
    for (var i = 0; i < pool.length; i++) { var n = pool[i]; if (n._dx == null) continue; var dx = n._dx - w.x, dy = n._dy - w.y, d = dx * dx + dy * dy, rr = radius(n) * zc() * 1.7 + 10 / cam.scale; if (d < rr * rr && d < bd) { bd = d; best = n; } }
    return best;
  }
  function sceneNodeAt(px, py) { return viewMode === "orbit" ? nodeAtOrbit(px, py) : viewMode === "metro" ? nodeAtMetro(px, py) : nodeAtDNA(px, py); }
  // ---- V71: Mood Metro scene (subway map of genres by emotion/mood) ----
  // Each mood is a coloured line; genres matching a mood are stations on it (ordered by BPM). A genre
  // on several moods gets interchange rings + a dashed transfer link between its stations; its subgenres
  // sit as small stops below its home station. Hub/orphan glyph design preserved.
  var MOOD_COL = ["#8A63FF", "#FFC24B", "#FF3D6E", "#2FE6FF", "#B6FF3C", "#FF7A29", "#5C8CFF", "#FF3D9A"];
  var METRO = { lines: [], genres: [], subs: [], stations: [], H: 150, X0: -880, X1: 880, cy: 0 };
  function buildMetro() {
    var gen = nodes.filter(function (n) { return n.level === "Genre"; });
    METRO.lines = []; METRO.lineByMood = {};
    gen.forEach(function (g) { g._metro = {}; g._metroLines = []; });
    MOODS.forEach(function (m, mi) {
      var mem = gen.filter(function (g) { return nodeHasMood(g, mi); }).sort(function (a, b) { return ((a.bpm || 120) - (b.bpm || 120)) || a.name.localeCompare(b.name); });
      var y = (mi - (MOODS.length - 1) / 2) * METRO.H;
      var spd = (0.02 + 0.006 * (mi % 3)) * ((mi % 2) ? 1 : -1);           // each line scrolls; adjacent lines opposite ways
      mem.forEach(function (g, j) { g._metro[mi] = { u: (mem.length > 1 ? j / mem.length : 0.5), y: y }; g._metroLines.push(mi); });
      var ln = { mood: mi, y: y, members: mem, spd: spd }; METRO.lines.push(ln); METRO.lineByMood[mi] = ln;
    });
    var noMood = gen.filter(function (g) { return g._metroLines.length === 0; });
    if (noMood.length) {
      var yy = (MOODS.length - (MOODS.length - 1) / 2) * METRO.H;
      noMood.sort(function (a, b) { return (a.bpm || 120) - (b.bpm || 120); });
      noMood.forEach(function (g, j) { g._metro[-1] = { u: (noMood.length > 1 ? j / noMood.length : 0.5), y: yy }; g._metroLines.push(-1); });
      var ln2 = { mood: -1, y: yy, members: noMood, spd: 0.016 }; METRO.lines.push(ln2); METRO.lineByMood[-1] = ln2;
    }
    gen.forEach(function (g) { g._homeMood = g._metroLines[0]; g._metroP = g._metro[g._homeMood]; });
    var subs = nodes.filter(function (n) { return n.level !== "Genre"; }), perP = {};
    subs.forEach(function (s) {
      var p = null; for (var k in adj[s.id]) { if (adj[s.id][k] === "child" && byId[k] && byId[k].level === "Genre") { p = byId[k]; break; } }
      if (!p) { var fam = gen.filter(function (g) { return g.family === s.family; }); p = fam[0] || gen[0]; }
      s._metroParent = p; (perP[p.id] = perP[p.id] || []).push(s);
    });
    subs.forEach(function (s) { var arr = perP[s._metroParent.id], j = arr.indexOf(s); s._ox = 0; s._oy = 46 + j * 24; });
    METRO.genres = gen; METRO.subs = subs;
    METRO.cy = (METRO.lines[0].y + METRO.lines[METRO.lines.length - 1].y) / 2;
  }
  function metroLiveX(u, ln, t) { var uu = u + t * ln.spd; uu = uu - Math.floor(uu); return METRO.X0 + uu * (METRO.X1 - METRO.X0); }  // travel + loop
  function metroPos(g, mi, t) { var b = g._metro[mi]; return { x: metroLiveX(b.u, METRO.lineByMood[mi], t), y: b.y }; }
  function metroSubPos(s, t) { var p = s._metroParent, hp = metroPos(p, p._homeMood, t); return { x: hp.x + s._ox, y: hp.y + s._oy }; }
  function metroShort(nm) { return nm.split(/\s*[\/(]/)[0].trim() || nm; }
  function metroCam() {                                                  // V76: phones fit by height (readable) + pan the width; desktop fits whole
    var h = (METRO.lines.length + 1.6) * METRO.H, y = METRO.cy;
    if (W < 680) { var sc = Math.max(0.3, Math.min(0.6, (H / h) * 0.9)); return { x: METRO.X0 + (W / 2) / sc - 30, y: y, scale: sc }; }
    var w = (METRO.X1 - METRO.X0) + 280, sc2 = Math.max(0.18, Math.min(0.95, Math.min(W / w, H / h) * 0.96));
    return { x: 0, y: y, scale: sc2 };
  }
  function fitMetro() { var c = metroCam(); cam.x = c.x; cam.y = c.y; cam.scale = c.scale; }
  function nodeAtMetro(px, py) {
    var w = toWorld(px, py), t = (performance.now() - t0) / 1000, best = null, bd = 1e9;
    for (var gi = 0; gi < METRO.genres.length; gi++) { var g = METRO.genres[gi]; for (var li = 0; li < g._metroLines.length; li++) { var p = metroPos(g, g._metroLines[li], t), dx = p.x - w.x, dy = p.y - w.y, d = dx * dx + dy * dy, rr = radius(g) * zc() * 1.6 + 10 / cam.scale; if (d < rr * rr && d < bd) { bd = d; best = g; } } }
    for (var si = 0; si < METRO.subs.length; si++) { var s = METRO.subs[si], sp = metroSubPos(s, t), ex = sp.x - w.x, ey = sp.y - w.y, e = ex * ex + ey * ey, r2 = radius(s) * 1.6 + 10 / cam.scale; if (e < r2 * r2 && e < bd) { bd = e; best = s; } }
    return best;
  }
  function drawMetro() {
    gx.clearRect(0, 0, W, H); gx.save(); gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);
    var iv = 1 / cam.scale, focus = hover || selected, t = (performance.now() - t0) / 1000;
    var RS = (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) ? window.BeatGenomeAudio.getReactiveState() : null;
    gx.lineCap = "round"; gx.lineJoin = "round";
    METRO.lines.forEach(function (ln) {                                    // static track + mood label
      var col = ln.mood >= 0 ? MOOD_COL[ln.mood] : "#9A9AB6";
      var faded = focus && !(focus._metroLines && focus._metroLines.indexOf(ln.mood) >= 0);
      gx.globalAlpha = faded ? 0.16 : 0.7; gx.strokeStyle = col; gx.lineWidth = lineW(10, 3, 16);
      gx.beginPath(); gx.moveTo(METRO.X0, ln.y); gx.lineTo(METRO.X1, ln.y); gx.stroke();
      gx.globalAlpha = faded ? 0.3 : 1; gx.fillStyle = col; gx.font = "600 " + (13 * iv) + "px 'Space Mono',monospace"; gx.textAlign = "right"; gx.textBaseline = "middle";
      gx.fillText(ln.mood >= 0 ? MOODS[ln.mood][0].toUpperCase() : "OTHER", METRO.X0 - 16 * iv, ln.y);
    });
    gx.globalAlpha = 1; gx.lineCap = "butt"; gx.lineJoin = "miter"; gx.textBaseline = "alphabetic";
    METRO.genres.forEach(function (g) {                                    // interchange transfer links (live)
      if (g._metroLines.length < 2) return;
      var pts = g._metroLines.map(function (mi) { return metroPos(g, mi, t); }).sort(function (a, b) { return a.y - b.y; });
      var hot = focus && (focus === g || focus._metroParent === g);
      gx.globalAlpha = hot ? 0.28 : 0.06; gx.strokeStyle = "#fff"; gx.lineWidth = 1.4 * iv; gx.setLineDash([3 * iv, 3 * iv]);
      gx.beginPath(); pts.forEach(function (p, i) { if (i === 0) gx.moveTo(p.x, p.y); else gx.lineTo(p.x, p.y); }); gx.stroke(); gx.setLineDash([]); gx.globalAlpha = 1;
    });
    METRO.subs.forEach(function (s, si) {                                  // orphans travel with their parent
      var sp = metroSubPos(s, t); s._dx = sp.x; s._dy = sp.y;
      var dim = matchSet && !matchSet[s.id], rel = focus && (focus === s || focus === s._metroParent);
      var r = radius(s) * zc() * 1.02, col = colourOf(s), sh = glyphFor(s);
      var tw = reduceMotion ? 1 : (0.72 + 0.28 * Math.sin(t * 2.6 + si));
      gx.globalAlpha = (dim ? 0.1 : (focus && !rel ? 0.26 : 0.68)) * tw; gx.fillStyle = col; gx.strokeStyle = col;
      if (QUALITY !== "reduced" && rel) { gx.shadowColor = col; gx.shadowBlur = focus === s ? 14 : 5; }
      drawGlyph(gx, sh, sp.x, sp.y, r); gx.shadowBlur = 0;
      if (!dim && (cam.scale > 0.72 || rel)) {                              // subgenre label (appears as you zoom in)
        gx.globalAlpha = focus && !rel ? 0.34 : 0.72; gx.fillStyle = "rgba(236,236,244,0.9)"; gx.font = (15 * iv) + "px 'Space Grotesk',sans-serif"; gx.textAlign = "left"; gx.textBaseline = "middle";
        gx.fillText(metroShort(s.name), sp.x + r + 8 * iv, sp.y); gx.globalAlpha = 1;
      }
    });
    gx.globalAlpha = 1;
    METRO.genres.forEach(function (g) {                                    // interchange rings on non-home lines (live)
      var dim = matchSet && !matchSet[g.id], rel = focus && (focus === g || focus._metroParent === g);
      g._metroLines.forEach(function (mi) {
        if (mi === g._homeMood) return;
        var p = metroPos(g, mi, t), c = mi >= 0 ? MOOD_COL[mi] : "#9A9AB6", rr = radius(g) * zc() * 0.7 + 2.5;
        gx.globalAlpha = dim ? 0.14 : (focus && !rel ? 0.32 : 1); gx.fillStyle = "#0a0a12"; gx.strokeStyle = c; gx.lineWidth = 2 * iv;
        gx.beginPath(); gx.arc(p.x, p.y, rr, 0, 6.2832); gx.fill(); gx.stroke(); gx.globalAlpha = 1;
        if (!dim && (cam.scale > 0.4 || rel)) {                            // V78: label the interchange circle
          var mc = Math.max(4, Math.floor(0.82 * METRO.H * cam.scale / 11));
          var ml = metroShort(g.name); if (ml.length > mc) ml = ml.slice(0, Math.max(3, mc - 1)) + "\u2026";
          gx.save(); gx.globalAlpha = focus && !rel ? 0.3 : 0.85; gx.translate(p.x, p.y - rr - 9 * iv); gx.rotate(-Math.PI / 2);
          gx.font = "600 " + (18 * iv) + "px 'Space Grotesk',sans-serif"; gx.fillStyle = c; gx.textAlign = "left"; gx.textBaseline = "middle";
          gx.fillText(ml, 0, 0); gx.restore(); gx.globalAlpha = 1;
        }
      });
    });
    METRO.genres.forEach(function (g) {                                    // home hub (travels) + vertical label from the top
      var hp = metroPos(g, g._homeMood, t);
      var dim = matchSet && !matchSet[g.id], rel = focus && (focus === g || focus._metroParent === g);
      var thump = (RS && RS.playing && !reduceMotion) ? Math.pow(1 - ((t * (g.bpm || 120) / 60) % 1), 3) : 0;
      var r = radius(g) * zc() * 1.35 * (1 + 0.12 * thump);
      plotGlyph(g, hp.x, hp.y, r, dim ? 0.16 : (focus && !rel ? 0.4 : 1), true, focus === g);
      if (!dim && (cam.scale > 0.4 || g === focus)) {
        var maxC = Math.max(4, Math.floor(0.82 * METRO.H * cam.scale / 11));  // clip so a label can't reach the line above
        var lbl = g === focus ? g.name : metroShort(g.name); if (lbl.length > maxC) lbl = lbl.slice(0, Math.max(3, maxC - 1)) + "\u2026";
        gx.save(); gx.globalAlpha = focus && !rel ? 0.35 : 1; gx.translate(hp.x, hp.y - r - 11 * iv); gx.rotate(-Math.PI / 2);
        gx.font = "600 " + (20 * iv) + "px 'Space Grotesk',sans-serif"; gx.fillStyle = g === focus ? "#fff" : "rgba(236,236,244,0.82)"; gx.textAlign = "left"; gx.textBaseline = "middle";
        gx.fillText(lbl, 0, 0); gx.restore(); gx.globalAlpha = 1;
      }
    });
    gx.restore();
  }
  function metroTrain(ln, f) {
    var mem = ln.members; if (mem.length < 2) return null;
    var idx = f * (mem.length - 1), i0 = Math.floor(idx), fr = idx - i0; if (i0 >= mem.length - 1) { i0 = mem.length - 2; fr = 1; }
    var p0 = mem[i0]._metro[ln.mood], p1 = mem[i0 + 1]._metro[ln.mood];
    return { x: p0.x + (p1.x - p0.x) * fr, y: p0.y + (p1.y - p0.y) * fr };
  }
  // ---- V72: generic scene morph so hubs/orphans glide between ANY two scenes ----
  function scenePos(n, mode) {
    var isHub = n.level === "Genre";
    if (mode === "dna") { if (isHub) { var ph = (n._hx / 210) + n._strand * Math.PI; return [n._hx, Math.sin(ph) * DNA_R]; } return [n._fx, n._fyBase]; }
    if (mode === "orbit") { if (isHub) return [Math.cos(n._oa) * n._or, Math.sin(n._oa) * n._or]; var p = n._parentG; if (!p) return [0, 0]; return [Math.cos(p._oa) * p._or + Math.cos(n._moonPh) * n._moonR, Math.sin(p._oa) * p._or + Math.sin(n._moonPh) * n._moonR]; }
    if (mode === "metro") { var tt = (performance.now() - t0) / 1000; if (isHub) { var hp = metroPos(n, n._homeMood, tt); return [hp.x, hp.y]; } var sp = metroSubPos(n, tt); return [sp.x, sp.y]; }
    return [n.x, n.y];
  }
  function sceneCam(mode) {
    if (mode === "dna") { var sw = (W * 0.92) / DNA.width, sh = (H * 0.88) / (2 * (DNA_R + 190)); return { x: 0, y: 0, scale: Math.max(0.24, Math.min(1.1, Math.min(sw, sh))) }; }
    if (mode === "orbit") { var need = (ORBIT.rB + 130) * 2; return { x: 0, y: 0, scale: Math.max(0.22, Math.min(1.0, Math.min(W, H) * 0.92 / need)) }; }
    if (mode === "metro") { return metroCam(); }
    return { x: 0, y: 0, scale: (MX && MX.initialZoom) || 0.9 };
  }
  function startSceneMorph(toMode) {
    var fromMode = viewMode;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (fromMode === "graph") { n._mx0 = n.x; n._my0 = n.y; } else { n._mx0 = (n._dx != null ? n._dx : n.x); n._my0 = (n._dy != null ? n._dy : n.y); }
      var tp = scenePos(n, toMode); n._mtx = tp[0]; n._mty = tp[1];
    }
    trans = { t0: (performance.now() - t0) / 1000, dur: reduceMotion ? 0.55 : 1.15, from: { x: cam.x, y: cam.y, scale: cam.scale }, to: sceneCam(toMode), toMode: toMode, fromMode: fromMode };
  }
  function drawSceneMorph(e, toMode) {
    gx.clearRect(0, 0, W, H); gx.save();
    gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);
    var t = (performance.now() - t0) / 1000, iv = 1 / cam.scale;
    gx.globalAlpha = e * 0.9;                                          // target scene forms / fades in
    if (toMode === "orbit") {
      gx.lineWidth = 1.3 * iv; gx.strokeStyle = "rgba(120,200,255,0.2)"; gx.beginPath(); gx.arc(0, 0, ORBIT.rA, 0, 6.2832); gx.stroke();
      gx.strokeStyle = "rgba(255,200,60,0.2)"; gx.beginPath(); gx.arc(0, 0, ORBIT.rB, 0, 6.2832); gx.stroke();
    } else if (toMode === "metro") {
      gx.lineCap = "round"; gx.lineWidth = lineW(10, 3, 16);
      METRO.lines.forEach(function (ln) { gx.strokeStyle = ln.mood >= 0 ? MOOD_COL[ln.mood] : "#9A9AB6"; gx.beginPath(); gx.moveTo(METRO.X0, ln.y); gx.lineTo(METRO.X1, ln.y); gx.stroke(); }); gx.lineCap = "butt";
    } else if (toMode === "dna") {
      var R = DNA_R, x0 = mapX(DNA.minY) - 30, x1 = mapX(DNA.maxY) + 30, turn = t * 0.85, gj = reduceMotion ? 0 : (1 - e) * 20;
      for (var strand = 0; strand < 2; strand++) { gx.beginPath(); for (var xx = x0; xx <= x1; xx += 9) { var ph = (xx / 210) + turn + strand * Math.PI, yy = Math.sin(ph) * R + Math.sin(xx * 3.3 + t * 40 + strand * 2) * gj; if (xx === x0) gx.moveTo(xx, yy); else gx.lineTo(xx, yy); } gx.strokeStyle = "rgba(198,240,0,0.5)"; gx.lineWidth = lineW(14, 4, 22) * (0.35 + 0.65 * e); gx.stroke(); }
    } else {
      gx.lineWidth = 0.6 * iv; gx.strokeStyle = "rgba(198,240,0,0.1)"; gx.beginPath();
      for (var li = 0; li < links.length; li++) { if (links[li].k !== "child") continue; var na = byId[links[li].s], nb = byId[links[li].t]; if (na && nb) { gx.moveTo(na._mtx, na._mty); gx.lineTo(nb._mtx, nb._mty); } } gx.stroke();
    }
    gx.globalAlpha = 1;
    var gj2 = reduceMotion ? 0 : (1 - e) * (1 - e) * 24;              // warp jitter that settles
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var x = n._mx0 + (n._mtx - n._mx0) * e + (gj2 ? Math.sin(i * 3.3 + t * 42) * gj2 : 0);
      var y = n._my0 + (n._mty - n._my0) * e + (gj2 ? Math.cos(i * 2.7 + t * 42) * gj2 : 0);
      var isHub = n.level === "Genre", r = radius(n) * zc() * (isHub ? 1.35 : 1.1);
      if (isHub) plotGlyph(n, x, y, r, 1, true, false);
      else { var col = colourOf(n), sh = glyphFor(n); gx.globalAlpha = 0.82; gx.fillStyle = col; gx.strokeStyle = col; drawGlyph(gx, sh, x, y, r); gx.globalAlpha = 1; }
    }
    gx.restore();
  }
  function drawOrbit() {
    gx.clearRect(0, 0, W, H);
    gx.save();
    gx.translate(W / 2, H / 2); gx.scale(cam.scale, cam.scale); gx.translate(-cam.x, -cam.y);
    var t = (performance.now() - t0) / 1000;
    var RS = (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) ? window.BeatGenomeAudio.getReactiveState() : null;
    var iv = 1 / cam.scale;
    if (!(dragging && viewMode === "orbit")) stepOrbitRotation();
    var actK = orbitActiveKey();
    if (actK !== _lastActiveK) { _lastActiveK = actK; if (orbitCtl) { var _ah = orbitCtl.querySelector(".orbithint"); if (_ah && viewMode === "orbit") _ah.textContent = orbitKeyLabel(actK); } }
    var half = Math.PI / 12;
    for (var k = 1; k <= 12; k++) {                                      // V73: light background highlight per Camelot key
      var a = ((k % 12) / 12) * Math.PI * 2 - Math.PI / 2 + orbitRot, hue = ((k - 1) / 12) * 360;
      gx.fillStyle = "hsla(" + hue + ",78%,60%," + (k === actK ? 0.22 : (0.05 + (k % 2 ? 0.022 : 0))).toFixed(3) + ")";
      gx.beginPath(); gx.arc(0, 0, ORBIT.rOut + 70, a - half, a + half); gx.arc(0, 0, ORBIT.sun + 20, a + half, a - half, true); gx.closePath(); gx.fill();
    }
    var sunR = ORBIT.sun, br = 1 + 0.09 * Math.sin(t * 1.15);   // V87/V88: the sun always breathes in and out
    if (QUALITY !== "reduced") { var sgR = sunR * 1.85 * br; var sg = gx.createRadialGradient(0, 0, sunR * 0.2, 0, 0, sgR); sg.addColorStop(0, "rgba(255,210,90,0.36)"); sg.addColorStop(0.5, "rgba(255,150,40,0.14)"); sg.addColorStop(1, "rgba(255,120,20,0)"); gx.fillStyle = sg; gx.beginPath(); gx.arc(0, 0, sgR, 0, 6.2832); gx.fill(); }
    if (QUALITY !== "reduced") { for (var rp = 0; rp < 3; rp++) { var rph = ((t * 0.34) + rp / 3) % 1, rrr = sunR * br * (1 + rph * 0.55), ral = (1 - rph) * 0.32; gx.strokeStyle = "rgba(255,190,70," + ral.toFixed(3) + ")"; gx.lineWidth = 2 / cam.scale; gx.beginPath(); gx.arc(0, 0, rrr, 0, 6.2832); gx.stroke(); } }
    var cr = sunR * 0.9 * br;
    var cg2 = gx.createRadialGradient(0, 0, cr * 0.1, 0, 0, cr); cg2.addColorStop(0, "rgba(255,238,175,0.96)"); cg2.addColorStop(0.62, "rgba(255,178,58,0.55)"); cg2.addColorStop(1, "rgba(205,115,28,0.2)"); gx.fillStyle = cg2; gx.beginPath(); gx.arc(0, 0, cr, 0, 6.2832); gx.fill();
    gx.strokeStyle = "rgba(255,200,90,0.5)"; gx.lineWidth = 1.4 / cam.scale; gx.beginPath(); gx.arc(0, 0, sunR * br, 0, 6.2832); gx.stroke();
    if (QUALITY !== "reduced") { gx.strokeStyle = "rgba(255,205,95,0.3)"; gx.lineWidth = 1.4 / cam.scale; for (var ry = 0; ry < 16; ry++) { var ra = (ry / 16) * 6.2832 + t * 0.12, r0 = sunR * 1.03 * br, r1 = sunR * (1.11 + 0.05 * Math.sin(t * 2 + ry)) * br; gx.beginPath(); gx.moveTo(Math.cos(ra) * r0, Math.sin(ra) * r0); gx.lineTo(Math.cos(ra) * r1, Math.sin(ra) * r1); gx.stroke(); } }
    gx.lineWidth = 1 * iv;
    ORBIT.rings.forEach(function (rr, ri) { gx.strokeStyle = "rgba(180,205,255," + (0.05 + 0.03 * (1 - ri / 6)).toFixed(3) + ")"; gx.beginPath(); gx.arc(0, 0, rr, 0, 6.2832); gx.stroke(); });  // concentric orbits
    if (!reduceMotion) {                                                 // energy dots gliding along two orbits
      var qa = t * 0.14, qb = -t * 0.1, ra = ORBIT.rings[1], rb = ORBIT.rings[4];
      if (QUALITY !== "reduced") { gx.shadowColor = "rgba(150,210,255,0.9)"; gx.shadowBlur = 12; }
      gx.fillStyle = "rgba(150,210,255,0.9)"; gx.beginPath(); gx.arc(Math.cos(qa) * ra, Math.sin(qa) * ra, 5, 0, 6.2832); gx.fill();
      gx.fillStyle = "rgba(255,205,80,0.9)"; gx.beginPath(); gx.arc(Math.cos(qb) * rb, Math.sin(qb) * rb, 5, 0, 6.2832); gx.fill(); gx.shadowBlur = 0;
    }
    gx.textAlign = "center"; gx.textBaseline = "middle"; gx.font = "700 " + (14 * iv) + "px 'Space Mono',monospace";
    for (var k2 = 1; k2 <= 12; k2++) {                                   // spokes + coloured key numbers on the rim
      var a2 = ((k2 % 12) / 12) * Math.PI * 2 - Math.PI / 2 + orbitRot, hue2 = ((k2 - 1) / 12) * 360;
      gx.strokeStyle = "rgba(255,255,255,0.045)"; gx.lineWidth = 1 * iv;
      gx.beginPath(); gx.moveTo(Math.cos(a2) * (ORBIT.sun + 20), Math.sin(a2) * (ORBIT.sun + 20)); gx.lineTo(Math.cos(a2) * (ORBIT.rOut + 44), Math.sin(a2) * (ORBIT.rOut + 44)); gx.stroke();
      gx.font = "700 " + ((k2 === actK ? 21 : 16) * iv) + "px 'Space Mono',monospace"; gx.fillStyle = k2 === actK ? "#ffffff" : "hsl(" + hue2 + ",82%,70%)"; gx.fillText(k2 + "", Math.cos(a2) * (ORBIT.rOut + 58), Math.sin(a2) * (ORBIT.rOut + 58));
      gx.font = (11 * iv) + "px 'Space Mono',monospace"; gx.fillStyle = "rgba(236,236,244,0.66)"; gx.fillText(MINKEY[k2] + " \u00b7 " + MAJKEY[k2], Math.cos(a2) * (ORBIT.rOut + 82), Math.sin(a2) * (ORBIT.rOut + 82));
      gx.font = (11 * iv) + "px 'Space Mono',monospace"; gx.fillStyle = "hsla(" + hue2 + ",70%,68%,0.32)"; for (var rg = 0; rg < ORBIT.rings.length; rg++) { gx.fillText(k2 + "", Math.cos(a2) * ORBIT.rings[rg], Math.sin(a2) * ORBIT.rings[rg]); }
    }
    // V83: A/B axis legend text removed (keys are repeated at every ring instead)
    gx.font = "700 " + (15 * iv) + "px 'Space Grotesk',sans-serif";
    if (QUALITY !== "reduced") { gx.shadowColor = "rgba(255,224,140,0.9)"; gx.shadowBlur = 8; }
    gx.fillStyle = "rgba(34,20,4,0.92)"; gx.fillText("MIX IN", 0, -10 * iv); gx.fillText("HARMONY", 0, 10 * iv); gx.shadowBlur = 0;
    gx.textBaseline = "alphabetic";
    var focus = hover || selected;
    var selG = (selected && selected.level === "Genre" && selected.camelot) ? selected : null, compat = null;
    ORBIT.genres.forEach(function (g) { g._dx = Math.cos(g._oa + orbitRot) * g._or; g._dy = Math.sin(g._oa + orbitRot) * g._or; });
    if (selG) { compat = {}; for (var ci = 0; ci < ORBIT.genres.length; ci++) { var g2 = ORBIT.genres[ci]; if (g2 === selG) continue; var mv = orbitMove(selG.camelot, g2.camelot); if (mv) compat[g2.id] = mv; } }
    ORBIT.subs.forEach(function (s) { var p = s._parentG; if (!p) { s._dx = s._dy = null; return; } var ang = s._moonPh + t * s._moonSp; s._dx = p._dx + Math.cos(ang) * s._moonR; s._dy = p._dy + Math.sin(ang) * s._moonR; });
    var fp = focus ? (focus.level === "Genre" ? focus : focus._parentG) : null;
    gx.lineWidth = 0.6 * iv;                                              // V77: a thin orbit line for every moon
    ORBIT.subs.forEach(function (s) { var p = s._parentG; if (!p || p._dx == null) return; var mrel = focus && (focus === s || focus === p); gx.strokeStyle = mrel ? "rgba(198,240,0,0.24)" : "rgba(150,170,210,0.06)"; gx.beginPath(); gx.arc(p._dx, p._dy, s._moonR, 0, 6.2832); gx.stroke(); });
    ORBIT.subs.forEach(function (s) {
      if (s._dx == null) return;
      var dim = matchSet && !matchSet[s.id], rel = focus && (focus === s || focus === s._parentG);
      var r = radius(s) * zc() * 1.15, col = colourOf(s), sh = glyphFor(s);
      gx.globalAlpha = (dim ? 0.12 : (focus && !rel ? 0.4 : 0.82)) * (reduceMotion ? 1 : (0.78 + 0.22 * Math.sin(t * 2.5 + (s._moonI || 0))));
      gx.fillStyle = col; gx.strokeStyle = col;
      if (QUALITY !== "reduced" && (rel || focus === s)) { gx.shadowColor = col; gx.shadowBlur = (focus === s ? 16 : 6); }
      drawGlyph(gx, sh, s._dx, s._dy, r); gx.shadowBlur = 0;
      if (!dim && (cam.scale > 0.95 || rel)) {                             // subgenre label (appears as you zoom in / on focus)
        gx.globalAlpha = focus && !rel ? 0.34 : 0.72; gx.fillStyle = "rgba(236,236,244,0.9)"; gx.font = (14 * iv) + "px 'Space Grotesk',sans-serif"; gx.textAlign = "left"; gx.textBaseline = "middle";
        gx.fillText(metroShort(s.name), s._dx + r + 7 * iv, s._dy); gx.globalAlpha = 1;
      }
    });
    gx.globalAlpha = 1;
    if (selG) {                                                          // V80: harmonic-mixing connectors to compatible keys
      var sa = reduceMotion ? 1 : Math.max(0, Math.min(1, (t - selectAnim) / 0.45));
      for (var cj = 0; cj < ORBIT.genres.length; cj++) {
        var g3 = ORBIT.genres[cj], mv3 = compat[g3.id]; if (!mv3 || mv3 === "perfect") continue;   // same-key stays on its spoke; ring only, no connector
        var col3 = MOVECOL[mv3], ex = selG._dx + (g3._dx - selG._dx) * sa, ey = selG._dy + (g3._dy - selG._dy) * sa;
        gx.globalAlpha = mv3 === "energy" ? 0.42 : 0.72; gx.strokeStyle = col3; gx.lineWidth = lineW(mv3 === "energy" ? 1.4 : 2.4, 1, 5);
        if (mv3 === "energy") gx.setLineDash([5 * iv, 5 * iv]);
        gx.beginPath(); gx.moveTo(selG._dx, selG._dy); gx.lineTo(ex, ey); gx.stroke(); gx.setLineDash([]);
        var ang3 = Math.atan2(g3._dy - selG._dy, g3._dx - selG._dx), ah = 10 * iv;
        gx.beginPath(); gx.moveTo(ex, ey); gx.lineTo(ex - Math.cos(ang3 - 0.42) * ah, ey - Math.sin(ang3 - 0.42) * ah); gx.lineTo(ex - Math.cos(ang3 + 0.42) * ah, ey - Math.sin(ang3 + 0.42) * ah); gx.closePath(); gx.fillStyle = col3; gx.fill();
        gx.globalAlpha = 1;
      }
    }
    ORBIT.genres.forEach(function (g) {
      var dim = matchSet && !matchSet[g.id], rel = focus && (focus === g || focus._parentG === g);
      var thump = (RS && RS.playing && !reduceMotion) ? Math.pow(1 - ((t * (g.bpm || 120) / 60) % 1), 3) : 0;
      var r = radius(g) * zc() * 1.5 * (1 + 0.14 * thump);
      var hi = !selG || g === selG || (compat && compat[g.id]);
      plotGlyph(g, g._dx, g._dy, r, dim ? 0.18 : (selG ? (hi ? 1 : 0.24) : (focus && !rel ? 0.5 : 1)), true, focus === g || g === selG);
      if (selG && compat && compat[g.id]) {                              // V80: harmonic highlight ring in the move colour
        var mc = MOVECOL[compat[g.id]], fr2 = r + Math.max(3, r * 0.95);
        gx.globalAlpha = 0.95; gx.strokeStyle = mc; gx.lineWidth = lineW(2.6, 1.4, 6); gx.strokeRect(g._dx - fr2, g._dy - fr2, fr2 * 2, fr2 * 2); gx.globalAlpha = 1;
      }
      if (!dim && (cam.scale > 0.4 || g === focus || (selG && hi))) { gx.globalAlpha = selG ? (hi ? 1 : 0.3) : (focus && !rel ? 0.4 : 1); gx.font = "600 " + (11 * iv) + "px 'Space Grotesk',sans-serif"; gx.fillStyle = (g === focus || g === selG) ? "#fff" : "rgba(236,236,244,0.85)"; gx.textAlign = "center"; gx.fillText(g.name, g._dx, g._dy - r - 7 * iv); gx.globalAlpha = 1; }
    });
    gx.restore();
    if (selG) {                                                          // V80: harmonic HUD readout + legend (screen space)
      var nb = camelotNbr(selG.camelot), safe = [nb[0], selG.camelot, nb[1], nb[2]].filter(Boolean), en = orbitEnergyKeys(selG.camelot);
      var hx = 22, hy = 98;
      gx.textAlign = "left"; gx.textBaseline = "alphabetic";
      gx.font = "700 11px 'Space Mono',monospace"; gx.fillStyle = "rgba(236,236,244,0.5)"; gx.fillText("CURRENT TRACK", hx, hy);
      gx.font = "700 20px 'Space Grotesk',sans-serif"; gx.fillStyle = "#fff"; gx.fillText(selG.camelot + "   " + selG.name, hx, hy + 24);
      gx.font = "700 11px 'Space Mono',monospace"; gx.fillStyle = "rgba(236,236,244,0.5)"; gx.fillText("SAFE NEXT", hx, hy + 48);
      gx.font = "700 16px 'Space Mono',monospace"; gx.fillStyle = "#C6F000"; gx.fillText(safe.join("   \u00b7   "), hx, hy + 68);
      gx.font = "700 11px 'Space Mono',monospace"; gx.fillStyle = "rgba(255,205,80,0.72)"; gx.fillText("ENERGY (advanced)   " + en.join("  \u00b7  "), hx, hy + 90);
      var lg = ["perfect", "smooth", "mood", "energy"], lx = hx, ly = hy + 116;
      for (var li2 = 0; li2 < lg.length; li2++) { var kk = lg[li2]; gx.fillStyle = MOVECOL[kk]; gx.fillRect(lx, ly - 9, 11, 11); gx.font = "600 11px 'Space Mono',monospace"; gx.fillStyle = "rgba(236,236,244,0.72)"; gx.fillText(MOVELBL[kk], lx + 16, ly); lx += 16 + gx.measureText(MOVELBL[kk]).width + 24; }
    }
  }
  function updateGlitch() {
    if (reduceMotion) { document.documentElement.style.setProperty("--glitch", "0"); return; }
    var bpm = focusParams().bpm || 124, t = (performance.now() - t0) / 1000;
    var barPos = (t * bpm / 60 / 4) % 1, g = Math.pow(1 - barPos, 7);
    var rs = (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) ? window.BeatGenomeAudio.getReactiveState() : null;
    var amt = g * ((rs && rs.playing) ? 1 : 0.34);
    document.documentElement.style.setProperty("--glitch", amt.toFixed(3));
  }

  // ---- main loop ----
  // V51: the render loop must survive any exception - one device-specific error
  // previously killed requestAnimationFrame forever (frozen app = "touch not detected").
  var _errN = 0;
  function __bgErr(err) {
    _errN++;
    try { console.error("BeatGenome recovered from:", err); } catch (e0) {}
    if (_errN <= 3) {
      try {
        var et = document.createElement("div"); et.className = "bg-toast bg-err";
        et.textContent = "Recovered from a glitch: " + ((err && err.message) ? String(err.message).slice(0, 80) : "unknown error");
        document.body.appendChild(et);
        setTimeout(function () { if (et.parentNode) et.parentNode.removeChild(et); }, 7000);
      } catch (e1) {}
    }
  }
  window.addEventListener("error", function (ev) { if (ev && ev.error) __bgErr(ev.error); });
  function frame() {
    if (document.hidden) { setTimeout(function () { requestAnimationFrame(frame); }, 300); return; } // spec 07: idle when hidden
    try { frameBody(); } catch (err) { __bgErr(err); }
    requestAnimationFrame(frame);
  }
  var _fN = 0, _fAcc = 0, _fLast = performance.now();
  function frameBody() {
    var _fNow = performance.now(), _fDt = _fNow - _fLast; _fLast = _fNow;
    if (_fDt > 0 && _fDt < 500) {
      _fAcc += _fDt; _fN++;
      if (_fN >= 240) {
        var _fps = 1000 / (_fAcc / _fN);
        if (_fps < 28 && QUALITY !== "reduced") { QUALITY = "reduced"; if (LM) LM.degrade(); }
        _fN = 0; _fAcc = 0;
      }
    }
    updateGlitch();
    if (trans) {
      var _tt = ((performance.now() - t0) / 1000 - trans.t0) / trans.dur; if (_tt > 1) _tt = 1;
      var _e = _tt < 0.5 ? 4 * _tt * _tt * _tt : 1 - Math.pow(-2 * _tt + 2, 3) / 2;
      cam.x = trans.from.x + (trans.to.x - trans.from.x) * _e; cam.y = trans.from.y + (trans.to.y - trans.from.y) * _e; cam.scale = trans.from.scale + (trans.to.scale - trans.from.scale) * _e;
      drawSceneMorph(_e, trans.toMode);
      document.documentElement.style.setProperty("--glitch", (Math.sin(_tt * Math.PI) * 0.5).toFixed(3));
      if (_tt >= 1) { var _wasG = trans.toMode === "graph"; viewMode = trans.toMode; hover = null; trans = null; if (_wasG) reheat(0.6); }
    } else if (viewMode === "dna") { drawDNA(); } else if (viewMode === "orbit") { drawOrbit(); } else if (viewMode === "metro") { drawMetro(); } else { if (!(QUALITY === "reduced" && alpha <= 0.07 && (_fN % 2))) tick(); if (!dragNode && !dragging) rotateGraph(0.0018); draw(); }
    if (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) { var _rs = window.BeatGenomeAudio.getReactiveState(); _rs.kick *= 0.86; _rs.snare *= 0.82; _rs.hat *= 0.75; _rs.bass *= 0.9; _rs.chord *= 0.93; _rs.master *= 0.9; }
    if (scope.offsetParent !== null) drawScope(sx, W, 40, focusParams(), false); // skipped when hidden on phones
    if (pScopeOn && panel.classList.contains("open")) {
      drawScope(psx, pScope.clientWidth || 380, 46, currentPanelParams(), true);
      updateDrumPlayhead();
    }
    // V51: immersive exploring - chrome fades while the user pans/pinches on touch
    var _xpl = IS_TOUCH && performance.now() < interactingUntil && !panel.classList.contains("open");
    if (_xpl !== _xplOn) { _xplOn = _xpl; document.body.classList.toggle("exploring", _xpl); }
  }
  var _xplOn = false;

  // ---- hit testing / interaction ----
  function hitR(n) {
    var vis = radius(n) * zc();
    return IS_TOUCH ? Math.max(vis + 10 / cam.scale, 22 / cam.scale) : vis + 6 / cam.scale;
  }
  function nodeAt(px, py) {
    var w = toWorld(px, py), best = null, bd = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], dx = n.x - w.x, dy = n.y - w.y, d = dx * dx + dy * dy;
      var rr = hitR(n);
      if (d < rr * rr && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function nodesAt(px, py) {
    var w = toWorld(px, py), out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], dx = n.x - w.x, dy = n.y - w.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < hitR(n)) out.push({ n: n, d: d });
    }
    out.sort(function (a, b) { return a.d - b.d; });
    var seen = {}, uniq = out.filter(function (o) { if (seen[o.n.id]) return false; seen[o.n.id] = 1; return true; });
    // ambiguity filter: only rivals within ~16 screen-px of the closest hit count
    if (uniq.length > 1) {
      var d0 = uniq[0].d, thr = 16 / cam.scale;
      uniq = uniq.filter(function (o, i) { return i === 0 || (o.d - d0) < thr; });
    }
    return uniq.map(function (o) { return o.n; });
  }
  function zoomAt(px, py, k) {
    var w0 = toWorld(px, py);
    cam.scale = Math.max(0.25, Math.min(4.5, cam.scale * k));
    var w1 = toWorld(px, py);
    cam.x += w0.x - w1.x; cam.y += w0.y - w1.y;
  }
  // V49: shared popover for long-press quick actions + overlapping-node chooser
  var gpop = null;
  function killPop() { if (gpop && gpop.parentNode) gpop.parentNode.removeChild(gpop); gpop = null; }
  function popOut(e) {
    if (!gpop) return;
    if (!gpop.contains(e.target)) killPop();
    else setTimeout(function () { document.addEventListener("pointerdown", popOut, { once: true, capture: true }); }, 0);
  }
  function popAt(x, y) {
    killPop();
    gpop = document.createElement("div"); gpop.className = "gpop";
    document.body.appendChild(gpop);
    gpop.style.left = Math.max(8, Math.min(x, window.innerWidth - 196)) + "px";
    gpop.style.top = Math.max(60, Math.min(y, window.innerHeight - 210)) + "px";
    setTimeout(function () { document.addEventListener("pointerdown", popOut, { once: true, capture: true }); }, 0);
    return gpop;
  }
  function showQuickActions(n, x, y) {
    var p = popAt(x, y);
    p.innerHTML = '<div class="gpop-t">' + n.name + '</div>' +
      '<button type="button" data-a="play">\u25B6 PLAY</button>' +
      '<button type="button" data-a="cmp">\u21C4 COMPARE</button>' +
      '<button type="button" data-a="mrph">\u25C8 MORPH</button>';
    p.addEventListener("click", function (e2) {
      var b = e2.target.closest && e2.target.closest("button"); if (!b) return;
      var a = b.dataset.a; killPop();
      if (a === "play") select(n);
      else if (a === "cmp") openCompareWith(n);
      else openMorphWith(n);
    });
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e3) {}
  }
  function showNodeChooser(list, x, y) {
    var p = popAt(x, y);
    p.innerHTML = '<div class="gpop-t">Select genre</div>' + list.map(function (n, i) {
      return '<button type="button" data-i="' + i + '"><i style="background:' + colourOf(n) + '"></i>' + n.name + '</button>';
    }).join("");
    p.addEventListener("click", function (e2) {
      var b = e2.target.closest && e2.target.closest("button"); if (!b) return;
      var n = list[parseInt(b.dataset.i, 10) || 0]; killPop(); select(n);
    });
  }
  var dragging = false, dragNode = null, moved = false, last = null;
  var lpTimer = 0, lpFired = false, downX = 0, downY = 0, lastTap = null;
  function movedFar(e) { return Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8; }
  // V46: multi-touch pinch-zoom / two-finger pan
  var pointers = {}, pinch = null;
  function pinchDist() { var k = Object.keys(pointers), a = pointers[k[0]], b = pointers[k[1]]; return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  function pinchMid() { var k = Object.keys(pointers), a = pointers[k[0]], b = pointers[k[1]]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  graph.addEventListener("pointerdown", function (e) {
    if (trans) return;
    if (!IS_TOUCH && (e.pointerType === "touch" || e.pointerType === "pen")) {
      IS_TOUCH = true; // desktop-site / DeX mode lies in media queries; the event tells the truth
      try { document.documentElement.setAttribute("data-touch", "1"); } catch (e0) {}
    }
    try { graph.setPointerCapture(e.pointerId); } catch (e1) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    last = { x: e.clientX, y: e.clientY }; moved = false;
    downX = e.clientX; downY = e.clientY; lpFired = false;
    clearTimeout(lpTimer);
    if (IS_TOUCH && Object.keys(pointers).length === 1) {
      lpTimer = setTimeout(function () {
        if (pinch || moved) return;
        var lpN = viewMode !== "graph" ? sceneNodeAt(downX, downY) : nodeAt(downX, downY);
        if (lpN) { lpFired = true; showQuickActions(lpN, downX, downY); }
      }, 550);
    }
    if (Object.keys(pointers).length === 2) {
      // second finger -> enter pinch; cancel any single-finger drag/node-grab
      if (dragNode) { dragNode.fixed = false; dragNode = null; }
      dragging = false; dnaPending = null; graph.classList.remove("grabbing");
      pinch = { d: pinchDist(), scale: cam.scale, pmid: pinchMid() };
      return;
    }
    if (viewMode !== "graph") { dnaPending = sceneNodeAt(e.clientX, e.clientY); dragging = true; graph.classList.add("grabbing"); if (viewMode === "orbit") { orbitVel = 0; orbitDragAng = orbitScreenAngle(e.clientX, e.clientY); orbitTouchedAt = performance.now(); } return; }
    var n = nodeAt(e.clientX, e.clientY);
    if (n) { dragNode = n; n.fixed = true; } else { dragging = true; graph.classList.add("grabbing"); }
  });
  graph.addEventListener("pointermove", function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch && Object.keys(pointers).length >= 2) {
      var mid = pinchMid();
      // two-finger pan by midpoint movement
      cam.x -= (mid.x - pinch.pmid.x) / cam.scale; cam.y -= (mid.y - pinch.pmid.y) / cam.scale;
      pinch.pmid = mid;
      // zoom anchored under the midpoint
      var w0 = toWorld(mid.x, mid.y), nd = pinchDist();
      if (nd > 0 && pinch.d > 0) cam.scale = Math.max(0.25, Math.min(4.5, pinch.scale * (nd / pinch.d)));
      var w1 = toWorld(mid.x, mid.y);
      cam.x += w0.x - w1.x; cam.y += w0.y - w1.y;
      interactingUntil = performance.now() + 350; clearTimeout(lpTimer); moved = true; return;
    }
    if (viewMode !== "graph") {
      if (dragging) {
        if (viewMode === "orbit") { var _oa = orbitScreenAngle(e.clientX, e.clientY), _od = _oa - orbitDragAng; if (_od > Math.PI) _od -= 6.2832; else if (_od < -Math.PI) _od += 6.2832; _od = Math.max(-0.35, Math.min(0.35, _od)); orbitRot += _od; orbitVel = _od; orbitDragAng = _oa; orbitTouchedAt = performance.now(); }
        else { cam.x -= (e.clientX - last.x) / cam.scale; cam.y -= (e.clientY - last.y) / cam.scale; last = { x: e.clientX, y: e.clientY }; }
        interactingUntil = performance.now() + 350; if (movedFar(e)) { moved = true; dnaPending = null; clearTimeout(lpTimer); }
      }
      else { var hd = sceneNodeAt(e.clientX, e.clientY); if (hd !== hover) { hover = hd; graph.style.cursor = hd ? "pointer" : "grab"; } }
      return;
    }
    if (dragNode) {
      var w = toWorld(e.clientX, e.clientY); dragNode.x = w.x; dragNode.y = w.y; dragNode.vx = dragNode.vy = 0;
      if (movedFar(e)) { moved = true; clearTimeout(lpTimer); }
      reheat(0.5); return;
    }
    if (dragging) {
      cam.x -= (e.clientX - last.x) / cam.scale; cam.y -= (e.clientY - last.y) / cam.scale;
      last = { x: e.clientX, y: e.clientY }; interactingUntil = performance.now() + 350;
      if (movedFar(e)) { moved = true; clearTimeout(lpTimer); }
      return;
    }
    var h = nodeAt(e.clientX, e.clientY);
    if (h !== hover) { hover = h; graph.style.cursor = h ? "pointer" : "grab"; }
  });
  function endPointer(e) {
    if (e && e.pointerId != null) delete pointers[e.pointerId];
    clearTimeout(lpTimer);
    if (pinch) {
      // still pinching until fewer than two fingers remain; a lifted finger ends the gesture cleanly
      if (Object.keys(pointers).length < 2) { pinch = null; moved = true; }
      var rk = Object.keys(pointers)[0];
      if (rk) last = { x: pointers[rk].x, y: pointers[rk].y };
      dragging = false; dragNode = null; graph.classList.remove("grabbing"); return;
    }
    if (lpFired) { // a long-press already acted; swallow this tap
      lpFired = false; dnaPending = null;
      if (dragNode) dragNode.fixed = false;
      dragNode = null; dragging = false; graph.classList.remove("grabbing"); return;
    }
    // double-tap zoom on touch (spec 06): second quick tap zooms toward the point
    if (IS_TOUCH && e && !moved && e.type === "pointerup") {
      var nowT = performance.now();
      if (lastTap && nowT - lastTap.t < 320 && Math.abs(e.clientX - lastTap.x) < 30 && Math.abs(e.clientY - lastTap.y) < 30) {
        lastTap = null;
        if (viewMode !== "dna") zoomAt(e.clientX, e.clientY, 1.6);
        dnaPending = null;
        if (dragNode) dragNode.fixed = false;
        dragNode = null; dragging = false; graph.classList.remove("grabbing"); return;
      }
      lastTap = { t: nowT, x: e.clientX, y: e.clientY };
    }
    if (viewMode !== "graph") { if (dnaPending && !moved) select(dnaPending); dnaPending = null; dragging = false; graph.classList.remove("grabbing"); return; }
    if (dragNode && !moved) {
      if (IS_TOUCH && e) {
        var cands = nodesAt(e.clientX, e.clientY);
        if (cands.length > 1) showNodeChooser(cands.slice(0, 5), e.clientX, e.clientY);
        else select(dragNode);
      } else select(dragNode);
    }
    if (dragNode) dragNode.fixed = false;
    dragNode = null; dragging = false; graph.classList.remove("grabbing");
  }
  graph.addEventListener("pointerup", endPointer);
  graph.addEventListener("pointercancel", endPointer);
  graph.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (trans) return;
    var w0 = toWorld(e.clientX, e.clientY);
    var k = Math.exp(-e.deltaY * 0.0014);
    cam.scale = Math.max(0.25, Math.min(4.5, cam.scale * k));
    var w1 = toWorld(e.clientX, e.clientY);
    cam.x += w0.x - w1.x; cam.y += w0.y - w1.y;
  }, { passive: false });

  // centre view on a node (smooth)
  function centerOn(n, targetScale) {
    var ts = targetScale || Math.max(1.1, cam.scale);
    var tx = n.x, ty = n.y;
    if (panel.classList.contains("open")) {
      var lm = MX ? MX.layoutMode : "desktop", pr = panel.getBoundingClientRect();
      if (lm === "phone-portrait" || lm === "tablet-portrait") ty = n.y + (pr.height / 2) / ts; // sheet at bottom -> lift node
      else tx = n.x + (pr.width / 2) / ts; // right pane -> shift node into the left/visible area
    }
    var sx0 = cam.x, sy0 = cam.y, ss = cam.scale, t = 0;
    (function step() {
      t += 0.08; var e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      cam.x = sx0 + (tx - sx0) * e; cam.y = sy0 + (ty - sy0) * e; cam.scale = ss + (ts - ss) * e;
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

  function segKey(name) { return (name || "").toLowerCase().replace("/main", "").split(" ")[0]; }
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
      h += '<div class="seg" data-seg="' + segKey(s[0]) + '"><div class="knot"></div>' +
        '<div class="lab">' + esc(s[0]) + '</div>' +
        '<div class="bars">' + esc(s[1] || "–") + '</div>' +
        '<div class="feel">' + esc(s[2] || "") + '</div></div>';
    });
    return h + "</div>";
  }

  // horizontal arrangement timeline: Intro → Build → Drop → Breakdown → Outro,
  // segment widths proportional to bar-counts, brightness peaking at the drop.
  function firstInt(s) { var m = (s || "").match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
  function chordCell(d) {
    var raw = (d["Chord Progression"] || "").trim();
    if (!raw) return "";
    var main = raw.split("(")[0].trim();
    var mode = (raw.match(/\(([^)]+)\)/) || [])[1] || "";
    return '<div class="arrchords" title="' + esc(raw) + '"><span class="ck">Chords</span>' +
      '<span class="cv">' + esc(main) + '</span>' + (mode ? '<span class="cm">' + esc(mode) + '</span>' : '') + '</div>';
  }
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
      html += '<div class="arrseg" data-seg="' + segKey(s.name) + '" style="flex:' + grow + ';--o:' + s.o + '" title="' +
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
    if (pl) { var _ph = pl.offsetHeight || 56; h += (_ph > 130 ? 60 : _ph); } // guard: dock height is fixed (--playerh), never fed back
    if (tb && !tb.hidden) h += (tb.offsetHeight || 0) + 6;
    document.documentElement.style.setProperty("--dockh", (h + 8) + "px");
  }
  if (tbClose) tbClose.addEventListener("click", function () { tracksBar.hidden = true; updateDock(); });
  function renderTracks(n) {
    if (!tracksBar || !n || !n.d) return;
    var d = n.d, html = "";
    for (var k = 1; k <= 5; k++) { var tt = d["Top Track " + k]; if (tt && tt.trim()) html += '<button class="tb-t" data-track="' + esc(tt) + '"><span class="tp">\u25B6</span>' + esc(tt) + "</button>"; }
    if (!html) { tracksBar.hidden = true; updateDock(); return; }
    tbGenre.textContent = n.name;
    tbList.innerHTML = '<div class="tb-move">' + html + html + '</div>';   // V59: duplicated content = seamless ticker loop
    tracksBar.hidden = false;
    if (tbList && !tbList._holdWired) {                                    // pause the ticker while touched/hovered so tracks are clickable
      tbList._holdWired = true;
      tbList.addEventListener("pointerdown", function () { tbList.classList.add("hold"); });
      tbList.addEventListener("pointerup", function () { tbList.classList.remove("hold"); });
      tbList.addEventListener("pointercancel", function () { tbList.classList.remove("hold"); });
      tbList.addEventListener("pointerleave", function () { tbList.classList.remove("hold"); });
    }
    Array.prototype.forEach.call(tbList.querySelectorAll(".tb-t"), function (b) { b.addEventListener("click", function () { openPreview(b.dataset.track); }); });
    var _mv = tbList.querySelector(".tb-move");
    if (_mv) { var _half = _mv.scrollWidth / 2; _mv.style.animationDuration = Math.max(8, _half / 70).toFixed(1) + "s"; } // ~70px/s, TV-ticker mid speed
    updateDock();
  }

  // ---- V32: Producer drum grid + DJ compatible-genre finder ----
  function camelotNbr(code) { var m = (code || "").match(/(\d+)\s*([ABab])/); if (!m) return []; var n = parseInt(m[1], 10), L = m[2].toUpperCase(); return [(((n + 10) % 12) + 1) + L, ((n % 12) + 1) + L, n + (L === "A" ? "B" : "A")]; }
  var ROM_MIN = ["i", "ii", "III", "iv", "v", "VI", "VII"], ROM_MAJ = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
  function profRomans(p) { var prog = (p.chordProg && p.chordProg.length) ? p.chordProg : [0, 5, 3, 6]; var m = (p.scale === "major") ? ROM_MAJ : ROM_MIN; return prog.map(function (d) { return m[(((d % 7) + 7) % 7)]; }); }
  function chordPlayerHTML(p) { var r = profRomans(p); if (!r.length) return ""; return '<div class="cplay" id="cplay"><button class="cplaybtn">\u25B6 sequence</button><div class="cpills">' + r.map(function (x, i) { return '<button class="cpill" data-i="' + i + '">' + x + '</button>'; }).join("") + '</div></div>'; }
  function drumGridHTML(p) {
    var rows = [["Kick", p.kickPattern], ["Snare", p.clapPattern], ["Hats", p.closedHatPattern], ["Open", p.openHatPattern], ["Perc", p.percPattern], ["Bass", p.bassPattern]];
    var h = '<div class="drum" id="drumGrid">';
    rows.forEach(function (r) {
      h += '<div class="drow"><span class="dlab">' + r[0] + '</span><div class="dcells">';
      for (var i = 0; i < 16; i++) h += '<i class="' + (r[1] && r[1][i] ? "on" : "") + (i % 4 === 0 ? " beat" : "") + '" data-step="' + i + '"></i>';
      h += '</div></div>';
    });
    return h + '</div>';
  }
  function updateDrumPlayhead() {
    var grid = document.getElementById("drumGrid"); if (!grid) return;
    var rs = (window.BeatGenomeAudio && window.BeatGenomeAudio.getReactiveState) ? window.BeatGenomeAudio.getReactiveState() : null;
    var step = (rs && rs.playing) ? (rs.step16 | 0) : -1;
    if (step === grid._ls) return; grid._ls = step;
    var cells = grid.querySelectorAll("i");
    for (var i = 0; i < cells.length; i++) cells[i].classList.toggle("play", parseInt(cells[i].getAttribute("data-step"), 10) === step);
  }
  function orbitMove(fromCam, toCam) {                                  // V80: Camelot move type between two keys
    var a = (fromCam || "").match(/(\d+)\s*([ABab])/), b = (toCam || "").match(/(\d+)\s*([ABab])/); if (!a || !b) return null;
    var an = ((parseInt(a[1], 10) - 1) % 12) + 1, al = a[2].toUpperCase(), bn = ((parseInt(b[1], 10) - 1) % 12) + 1, bl = b[2].toUpperCase();
    if (an === bn && al === bl) return "perfect";
    if (an === bn && al !== bl) return "mood";
    if (al === bl) { var d = (bn - an + 12) % 12; if (d === 1 || d === 11) return "smooth"; if (d === 2 || d === 10) return "energy"; }
    return null;
  }
  function orbitEnergyKeys(cam) { var m = (cam || "").match(/(\d+)\s*([ABab])/); if (!m) return []; var n = ((parseInt(m[1], 10) - 1) % 12) + 1, L = m[2].toUpperCase(); return [(((n + 1) % 12) + 1) + L, (((n + 9) % 12) + 1) + L]; }
  var MOVECOL = { perfect: "#C6F000", smooth: "#2FE6FF", mood: "#FF3D9A", energy: "#FFC24B" };
  var MOVELBL = { perfect: "PERFECT BLEND", smooth: "SMOOTH MOVE", mood: "MOOD SWITCH", energy: "ENERGY MOVE" };
  function keyRel(x, y) { if (!x || !y) return "energy blend"; if (x === y) return "same key"; var px = x.match(/(\d+)([ABab])/), py = y.match(/(\d+)([ABab])/); if (!px || !py) return "energy blend"; var nx = +px[1], lx = px[2].toUpperCase(), ny = +py[1], ly = py[2].toUpperCase(); if (nx === ny && lx !== ly) return "relative"; if (lx === ly && (Math.abs(nx - ny) === 1 || Math.abs(nx - ny) === 11)) return "adjacent"; return "energy blend"; }
  function compatibleGenres(node) {
    if (!node) return [];
    var bpm = node.bpm || 124, cam = node.camelot || "", en = node.energy || 5, ok = {}; ok[cam] = 1;
    camelotNbr(cam).forEach(function (k) { ok[k] = 1; });
    var res = [];
    for (var i = 0; i < nodes.length; i++) {
      var m = nodes[i]; if (m === node || m.level !== "Genre") continue;
      var db = Math.abs((m.bpm || 124) - bpm), keyOk = !!ok[m.camelot];
      if (db <= Math.max(6, bpm * 0.06) || keyOk) res.push({ n: m, db: db, dbs: (m.bpm || 124) - bpm, keyOk: keyOk, rel: keyRel(cam, m.camelot), de: (m.energy || 5) - en, score: (keyOk ? 3 : 0) + Math.max(0, 4 - db / 2) });
    }
    res.sort(function (a, b) { return b.score - a.score; });
    return res.slice(0, 6);
  }
  function compHTML(list) {
    return '<div class="comp">' + list.map(function (c) {
      var diff = (c.keyOk && c.db <= 3) ? "easy" : (c.keyOk || c.db <= 5) ? "medium" : "hard";
      var eq = diff === "easy" ? "swap bass on the phrase" : diff === "medium" ? "long blend, EQ out lows" : "ride FX/echo, mind the key";
      var des = c.de > 0 ? "+" + c.de : "" + c.de, bs = (c.dbs > 0 ? "+" : "") + c.dbs;
      return '<button class="crow" data-id="' + c.n.id + '">' +
        '<div class="crow1"><span class="cdot" style="background:' + colourOf(c.n) + '"></span><span class="cname">' + esc(c.n.name) + '</span>' +
        '<span class="cbpm">' + (c.n.bpm || "-") + '</span><span class="ckey">' + esc(c.n.camelot || "-") + '</span>' +
        '<span class="cdiff ' + diff + '">' + diff + '</span></div>' +
        '<div class="cwhy">' + c.rel + ' - ' + bs + ' BPM - energy ' + des + ' - EQ: ' + eq + ' - phrase 32</div></button>';
    }).join("") + '</div>';
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

    var prof2 = null; try { prof2 = window.BeatGenomeProfiles ? window.BeatGenomeProfiles.buildAudioProfile(n.d) : null; } catch (e) {}
    if (prof2 && prof2.kickPattern) body += '<div class="sec"><h3>Drum Pattern (16-step)</h3>' + drumGridHTML(prof2) + '</div>';
    if (prof2 && prof2.chordProg) body += '<div class="sec"><h3>Chord Player</h3>' + chordPlayerHTML(prof2) + '</div>';
    var comp = compatibleGenres(n);
    if (comp.length) body += '<div class="sec"><h3>Compatible Mixes (DJ)</h3>' + compHTML(comp) + '</div>';
    document.getElementById("pBody").innerHTML = body;
    // wire chips
    Array.prototype.forEach.call(document.querySelectorAll("#pBody .chip"), function (c) {
      if (c.dataset.id) c.addEventListener("click", function () { select(byId[c.dataset.id]); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#pBody .crow"), function (b) {
      b.addEventListener("click", function () { var t = byId[b.getAttribute("data-id")]; if (t) select(t); });
    });
    (function () {
      var cplay = document.getElementById("cplay"); if (!cplay) return;
      var A = window.BeatGenomeAudio;
      Array.prototype.forEach.call(cplay.querySelectorAll(".cpill"), function (b) { b.addEventListener("click", function () { if (A && A.strumChord) A.strumChord(parseInt(b.getAttribute("data-i"), 10)); }); });
      var seq = cplay.querySelector(".cplaybtn"), pills = cplay.querySelectorAll(".cpill"), iv = Math.round(60000 / (n.bpm || 124));
      if (seq) seq.addEventListener("click", function () { for (var i = 0; i < pills.length; i++) { (function (k) { setTimeout(function () { if (A && A.strumChord) A.strumChord(k); pills[k].classList.add("seqon"); setTimeout(function () { pills[k].classList.remove("seqon"); }, iv * 0.8); }, k * iv); })(i); } });
    })();
    renderTracks(n);
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); document.body.classList.add("panel-open");
    pScopeOn = true; sizePanelScope();
    placePanelWindow(); startAutoScroll();
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
  function closePanel() { stopAutoScroll(); panel.classList.remove("open"); panel.classList.remove("tall"); panel.setAttribute("aria-hidden", "true"); document.body.classList.remove("panel-open"); pScopeOn = false; selected = null; }
  document.getElementById("panelClose").addEventListener("click", closePanel);
  (function () {
    var pb = document.getElementById("pBody");
    if (!pb) return;
    function hl(key, on) { Array.prototype.forEach.call(pb.querySelectorAll('[data-seg="' + key + '"]'), function (el) { el.classList.toggle("seg-hl", on); }); }
    pb.addEventListener("mouseover", function (e) { var s = e.target.closest ? e.target.closest("[data-seg]") : null; if (s) hl(s.getAttribute("data-seg"), true); });
    pb.addEventListener("mouseout", function (e) { var s = e.target.closest ? e.target.closest("[data-seg]") : null; if (s) hl(s.getAttribute("data-seg"), false); });
  })();

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
          var art = (hit.artworkUrl100 || "").replace("100x100bb", "600x600bb");
          var cdBpm = (panelNode && panelNode.bpm) ? panelNode.bpm : 120;
          player.innerHTML =
            '<div class="pvcd" style="--cdspin:' + (240 / cdBpm).toFixed(2) + 's">' + (art ? '<img src="' + art + '" alt="">' : "") + '<span class="pvhole"></span></div>' +
            '<div class="pvctrls"><button class="pvplay" aria-label="Play or pause">\u23F8</button><div class="pvbar"><i></i></div><span class="pvtime">0:00 / 0:30</span></div>' +
            '<div class="pvnote">30-sec preview \u00b7 Apple Music \u00b7 tap or spin the disc to seek</div>' +
            '<audio src="' + hit.previewUrl + '" autoplay></audio>';
          previewAudio = player.querySelector("audio");
          (function () {
            var cd = player.querySelector(".pvcd"), pb = player.querySelector(".pvplay"),
                bar = player.querySelector(".pvbar"), fill = player.querySelector(".pvbar i"), tm = player.querySelector(".pvtime");
            function fmt(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ":" + ("0" + Math.floor(s % 60)).slice(-2); }
            function sync() { var pl = previewAudio && !previewAudio.paused; if (cd) cd.classList.toggle("spinning", pl); if (pb) pb.textContent = pl ? "\u23F8" : "\u25B6"; }
            if (pb) pb.addEventListener("click", function () { if (!previewAudio) return; if (previewAudio.paused) previewAudio.play(); else previewAudio.pause(); });
            if (bar) bar.addEventListener("click", function (e) { if (!previewAudio) return; var rc = bar.getBoundingClientRect(); previewAudio.currentTime = (e.clientX - rc.left) / rc.width * (previewAudio.duration || 30); });
            // V57: CD jog-wheel - tap left/right to rewind/forward 5s, drag around the disc to scrub like a turntable
            if (cd) {
              cd.style.touchAction = "none";
              var scr = null;
              var cdAngle = function (ev) { var rc = cd.getBoundingClientRect(); return Math.atan2(ev.clientY - (rc.top + rc.height / 2), ev.clientX - (rc.left + rc.width / 2)); };
              var cdEnd = function (ev) {
                if (!scr) return;
                scratchStop();
                var ux = (ev.clientX == null ? scr.x : ev.clientX), uy = (ev.clientY == null ? scr.y : ev.clientY);
                var mv = Math.abs(ux - scr.x) + Math.abs(uy - scr.y);
                if (mv < 8 && previewAudio) {
                  var rc = cd.getBoundingClientRect(), dur = previewAudio.duration || 30, left = (scr.x - rc.left) < rc.width / 2;
                  previewAudio.currentTime = Math.max(0, Math.min(dur, (previewAudio.currentTime || 0) + (left ? -5 : 5)));
                  cd.classList.remove("cue-l", "cue-r"); void cd.offsetWidth; cd.classList.add(left ? "cue-l" : "cue-r");
                  setTimeout(function () { cd.classList.remove("cue-l", "cue-r"); }, 420);
                }
                if (scr.wasPlaying && previewAudio && previewAudio.paused) { var pp = previewAudio.play(); if (pp && pp.catch) pp.catch(function () {}); }
                cd.classList.remove("scrubbing"); cd.style.removeProperty("--cdrot"); scr = null;
              };
              cd.addEventListener("pointerdown", function (ev) {
                if (!previewAudio) return;
                try { cd.setPointerCapture(ev.pointerId); } catch (e0) {}
                scr = { a: cdAngle(ev), x: ev.clientX, y: ev.clientY, rot: 0, wasPlaying: !previewAudio.paused, paused: false };
                cd.classList.add("scrubbing"); scratchGrab(); ev.preventDefault();
              });
              cd.addEventListener("pointermove", function (ev) {
                if (!scr || !previewAudio) return;
                var a = cdAngle(ev), da = a - scr.a;
                if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
                scr.a = a; scr.rot += da;
                var mv = Math.abs(ev.clientX - scr.x) + Math.abs(ev.clientY - scr.y);
                if (mv > 8 && !scr.paused) { scr.paused = true; if (!previewAudio.paused) previewAudio.pause(); }
                var dur = previewAudio.duration || 30;
                previewAudio.currentTime = Math.max(0, Math.min(dur, (previewAudio.currentTime || 0) + (da / (2 * Math.PI)) * 9)); // one full turn ~= 9s
                cd.style.setProperty("--cdrot", scr.rot.toFixed(3) + "rad");
                if (mv > 8) scratchUpdate(da);   // vinyl-scratch SFX follows the spin
              });
              cd.addEventListener("pointerup", cdEnd);
              cd.addEventListener("pointercancel", cdEnd);
            }
            if (previewAudio) {
              previewAudio.addEventListener("play", sync);
              previewAudio.addEventListener("pause", sync);
              previewAudio.addEventListener("ended", sync);
              previewAudio.addEventListener("timeupdate", function () {
                var d = previewAudio.duration || 30, c = previewAudio.currentTime || 0;
                if (fill) fill.style.width = (c / d * 100) + "%";
                if (tm) tm.textContent = fmt(c) + " / " + fmt(d);
              });
              var pr = previewAudio.play(); if (pr && pr.catch) pr.catch(function () {});
              setTimeout(sync, 80);
            }
          })();
        } else {
          player.innerHTML = '<div class="pvnote">No preview found \u2014 try Open in Spotify.</div>';
        }
      })
      .catch(function () { player.innerHTML = '<div class="pvnote">Preview unavailable \u2014 try Open in Spotify.</div>'; });
  }

  function select(n) {
    if (!n) return; selected = n; selectAnim = (performance.now() - t0) / 1000;
    if (IS_TOUCH && MX && MX.layoutMode && MX.layoutMode.indexOf("phone") === 0 && !userSetFocus) focusMode = "related"; // spec 04 - phone default
    try { if (IS_TOUCH && document.activeElement === searchIn) searchIn.blur(); } catch (e2) {}
    syncFocusChips();
    if (viewMode === "graph") splash(n.x, n.y, colourOf(n));
    openPanel(n);
    if (viewMode === "graph") centerOn(n);
    if (window.BeatGenomeOnSelect) { try { window.BeatGenomeOnSelect(n); } catch (e) {} }
  }

  // ---- search ----
  var resIdx = -1, resList = [];
  function runSearch() {
    query = searchIn.value.trim().toLowerCase();
    if (!query) { results.classList.remove("show"); matchSet = null; searchIn.setAttribute("aria-expanded", "false"); return; }
    resList = nodes.filter(function (n) {
      return n.name.toLowerCase().indexOf(query) >= 0 || n.family.toLowerCase().indexOf(query) >= 0;
    }).slice(0, 40);
    matchSet = {}; matchFromCtl = false; resList.forEach(function (n) { matchSet[n.id] = 1; });
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

  // ---- V89: Guide Lab infographics (visual hero per guide) ----
  function giWedge(cx, cy, r0, r1, a0, a1, fill, attrs) {
    var P = function (r, a) { return (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1); };
    var lg = (a1 - a0) > Math.PI ? 1 : 0;
    return '<path d="M' + P(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 ' + lg + ' 1 ' + P(r1, a1) + ' L' + P(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 ' + lg + ' 0 ' + P(r0, a0) + ' Z" fill="' + fill + '"' + (attrs || "") + '/>';
  }
  function guideHero(name) {
    if (name === "Harmonic Mixing & Camelot") {
      var cx = 150, cy = 150, rIn = 56, rA = 90, rB = 122, sv = '<svg viewBox="0 0 300 300" width="100%" style="max-width:270px;display:block;margin:2px auto 0" aria-hidden="true">';
      for (var k = 1; k <= 12; k++) {
        var a0 = ((k - 1) / 12) * 6.2832 - 1.5708 - 0.2618, a1 = a0 + 0.5236, hue = ((k - 1) / 12) * 360, am = (a0 + a1) / 2;
        var wtip = k + 'A ' + (MINKEY[k] || "") + ' (minor)  ·  ' + k + 'B ' + (MAJKEY[k] || "") + ' (major)';
        sv += '<g data-tip="' + wtip + '" style="cursor:pointer">';
        sv += giWedge(cx, cy, rIn + 4, rB, a0 + 0.02, a1 - 0.02, "hsla(" + hue + ",72%,55%,0.16)");
        sv += '<text x="' + (cx + Math.cos(am) * (rB - 9)).toFixed(0) + '" y="' + (cy + Math.sin(am) * (rB - 9) + 4).toFixed(0) + '" fill="hsl(' + hue + ',82%,70%)" font-family="Space Mono,monospace" font-size="12" font-weight="700" text-anchor="middle">' + k + '</text>';
        sv += '<text x="' + (cx + Math.cos(am) * (rA - 14)).toFixed(0) + '" y="' + (cy + Math.sin(am) * (rA - 14) + 3).toFixed(0) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">' + (MINKEY[k] || "") + '</text>';
        sv += '</g>';
      }
      sv += '<circle cx="150" cy="150" r="' + rA + '" fill="none" stroke="rgba(150,200,255,0.22)"/><circle cx="150" cy="150" r="' + rB + '" fill="none" stroke="rgba(255,200,80,0.22)"/>';
      sv += '<circle cx="150" cy="150" r="' + rIn + '" fill="rgba(255,205,90,0.12)" stroke="rgba(255,200,90,0.4)"/>';
      sv += '<text x="150" y="147" fill="rgba(28,18,4,0.92)" font-family="Space Grotesk,sans-serif" font-size="10.5" font-weight="700" text-anchor="middle">MIX IN</text><text x="150" y="159" fill="rgba(28,18,4,0.92)" font-family="Space Grotesk,sans-serif" font-size="10.5" font-weight="700" text-anchor="middle">HARMONY</text></svg>';
      var lg = '<div class="gi-legend">' +
        '<span class="gi-chip"><i class="gi-dot" style="background:#C6F000"></i>Perfect — same key</span>' +
        '<span class="gi-chip"><i class="gi-dot" style="background:#2FE6FF"></i>Smooth — ±1 number</span>' +
        '<span class="gi-chip"><i class="gi-dot" style="background:#FF3D9A"></i>Mood — A↔B</span>' +
        '<span class="gi-chip"><i class="gi-dot" style="background:#FFC24B"></i>Energy — +2 (advanced)</span></div>';
      return '<div class="gi"><div class="gi-title">The Camelot wheel</div><div class="gi-card">' + sv + lg + '<p class="gi-note">Inner ring = minor (A), outer = major (B). From any key: stay, step ±1, or flip A↔B — never jump across.</p></div></div>';
    }
    if (name === "Set Building — Energy Arc") {
      var W = 560, H = 190, pl = 10, pb = 26, pt = 12,
        pts = [[0, 2], [0.13, 3], [0.27, 5], [0.42, 7.5], [0.54, 9], [0.68, 9], [0.78, 8], [0.9, 4], [1, 3]],
        Xf = function (f) { return (pl + f * (W - pl - 8)).toFixed(1); }, Yf = function (e) { return (H - pb - (e / 10) * (H - pb - pt)).toFixed(1); },
        d = "M" + Xf(pts[0][0]) + " " + Yf(pts[0][1]);
      for (var i = 1; i < pts.length; i++) d += " L" + Xf(pts[i][0]) + " " + Yf(pts[i][1]);
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true"><defs><linearGradient id="giEg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.32"/><stop offset="1" stop-color="#8A63FF" stop-opacity="0.02"/></linearGradient></defs>';
      for (var e = 2; e <= 10; e += 2) svg += '<line x1="' + pl + '" y1="' + Yf(e) + '" x2="' + (W - 8) + '" y2="' + Yf(e) + '" stroke="rgba(255,255,255,0.05)"/>';
      svg += '<path d="' + d + ' L' + Xf(1) + ' ' + Yf(0) + ' L' + Xf(0) + ' ' + Yf(0) + ' Z" fill="url(#giEg)"/>';
      svg += '<path d="' + d + '" fill="none" stroke="#FF3D9A" stroke-width="2.5" stroke-linejoin="round"/>';
      var labs = [["Warm-up", 0.08], ["Build", 0.32], ["Peak", 0.58], ["Plateau", 0.72], ["Wind-down", 0.92]];
      labs.forEach(function (l) { svg += '<text x="' + Xf(l[1]) + '" y="' + (H - 8) + '" fill="rgba(236,236,244,0.6)" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">' + l[0] + '</text>'; });
      var ez = [["Warm-up", 0, 0.2, "Energy 1–4 · 110–122 BPM · set the mood"], ["Build", 0.2, 0.45, "Energy 4–6 · 120–126 BPM · lift the groove"], ["Peak", 0.45, 0.68, "Energy 7–9 · 126–140 BPM · main room"], ["Plateau", 0.68, 0.8, "Hold the peak · read the floor"], ["Wind-down", 0.8, 1, "Energy 3–5 · release, land the plane"]];
      ez.forEach(function (z) { svg += '<rect x="' + Xf(z[1]) + '" y="' + pt + '" width="' + (Xf(z[2]) - Xf(z[1])).toFixed(1) + '" height="' + (H - pb - pt) + '" fill="transparent" pointer-events="all" data-tip="' + z[0] + ' — ' + z[3] + '" style="cursor:pointer"/>'; });
      svg += '</svg>';
      var stg = [["Warm-up", "110–122 BPM", 3, "Set the mood, don't peak too soon."], ["Build", "120–126 BPM", 5, "Lift steadily, introduce groove."], ["Peak", "126–140 BPM", 9, "Main room, maximum floor."], ["Hard peak", "140+ BPM", 10, "Bursts only — not for long."], ["Wind-down", "back to 3–5", 4, "Release the tension, land the plane."]];
      var cards = '<div class="gi-stages">';
      stg.forEach(function (s) { cards += '<div class="gi-stage" data-tip="' + s[0] + ' · energy ' + s[2] + '/10 · ' + s[1] + '"><h5>' + s[0] + '</h5><div class="bpm">' + s[1] + '</div><div class="gi-meter"><i style="width:' + (s[2] * 10) + '%"></i></div><p>' + s[3] + '</p></div>'; });
      cards += '</div>';
      return '<div class="gi"><div class="gi-title">The energy arc</div><div class="gi-card">' + svg + '</div>' + cards + '</div>';
    }
    if (name === "FX & Loop Settings") {
      var chain = ["LOOP|16 → ½ bar|Loop length — 16 bars to extend a blend, ½ bar to build tension", "BEAT DIV|1/1 → 1/8|Beat division — 1/1 spacious tails to 1/8 fast rolls (BPM-synced)", "EFFECT|Echo / Roll|Echo / Reverb to wash out, Roll to build tension", "DEPTH|20 → 100%|Wet/dry mix — 20% subtle colour to 100% effect takes over", "RELEASE|on beat 1|Release the effect on the downbeat so it lands in time"], ch = '<div class="gi-chain">';
      chain.forEach(function (n, i) { var p = n.split("|"); ch += (i ? '<span class="gi-arrow">→</span>' : "") + '<span class="gi-node" data-tip="' + p[2] + '"><b>' + p[0] + '</b>' + p[1] + '</span>'; });
      ch += '</div>';
      var bands = [["20–40% · subtle colour", 35, "#2FE6FF", "Sits under the mix — keeps the groove intact"], ["50–70% · obvious wash", 60, "#FFC24B", "Obvious wash — use for transitions & breakdowns"], ["80–100% · effect takes over", 92, "#FF3D9A", "Effect takes over — drop slams, tape-stops, risers"]], bh = '<div class="gi-title" style="margin-top:16px">Depth (wet / dry)</div>';
      bands.forEach(function (b) { bh += '<div class="gi-band" data-tip="' + b[3] + '"><span>' + b[0] + '</span><div class="gi-meter"><i style="width:' + b[1] + '%;background:' + b[2] + '"></i></div></div>'; });
      return '<div class="gi"><div class="gi-title">Signal chain</div><div class="gi-card">' + ch + bh + '</div></div>';
    }
    if (name === "Live Performance Playbook") {
      var W = 560, H = 66, wf = "";
      for (var j = 0; j < 70; j++) { var hh = (8 + (Math.sin(j * 0.55) * 0.5 + 0.5) * (j > 18 && j < 44 ? 34 : 15)).toFixed(0); wf += '<rect x="' + (j * 8 + 2) + '" y="' + ((H - hh) / 2).toFixed(0) + '" width="4" height="' + hh + '" rx="1" fill="rgba(150,150,185,0.28)"/>'; }
      var cues = [[0.05, "A", "Mix in", "#5CE68A", "start of the first usable phrase (16–32 bar intro)"], [0.3, "B", "Impact", "#FF4D4D", "first drop / main section — your double-drop reference"], [0.62, "C", "Escape", "#4C8CFF", "breakdown — the blend-out zone & escape hatch"], [0.9, "D", "Mix out", "#FF9A3C", "start of the outro / last clean phrase"]], cm = "";
      cues.forEach(function (c) { var x = (c[0] * W).toFixed(0); cm += '<g data-tip="Cue ' + c[1] + ' — ' + c[2] + ': ' + c[4] + '" style="cursor:pointer"><rect x="' + (x - 10) + '" y="0" width="20" height="' + H + '" fill="transparent" pointer-events="all"/><line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="' + c[3] + '" stroke-width="2"/><circle cx="' + x + '" cy="9" r="8" fill="' + c[3] + '"/><text x="' + x + '" y="12.5" fill="#08080F" font-family="Space Mono,monospace" font-size="9" font-weight="700" text-anchor="middle">' + c[1] + '</text></g>'; });
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">' + wf + cm + '</svg>';
      var leg = '<div class="gi-legend">';
      cues.forEach(function (c) { leg += '<span class="gi-chip"><i class="gi-dot" style="background:' + c[3] + '"></i>' + c[1] + ' — ' + c[2] + '</span>'; });
      leg += '</div>';
      return '<div class="gi"><div class="gi-title">Cue-point map (set A–D on every track)</div><div class="gi-card">' + svg + leg + '<p class="gi-note">Intro → first drop → breakdown → outro. Colour-code cues the same across your library for muscle memory in the booth.</p></div></div>';
    }
    if (name === "Sources & Method") {
      var rows = [["Genre / subgenre taxonomy", "src", "Sourced", "Beatport label-delivery"], ["Origin / era", "src", "Sourced", "documented genre history"], ["Representative artists / tracks", "can", "Canonical", "expert + web-verified"], ["BPM ranges", "con", "Convention", "common DJ references"], ["Common keys / Camelot", "con", "Convention", "genre tonal tendency"], ["Production / arrangement norms", "con", "Convention", "standard conventions"]], mx = '<table class="gi-matrix"><tr><td style="color:var(--fog);font-family:\'Space Mono\';font-size:10px">DATA</td><td style="color:var(--fog);font-family:\'Space Mono\';font-size:10px">BASIS</td><td style="color:var(--fog);font-family:\'Space Mono\';font-size:10px">FROM</td></tr>';
      rows.forEach(function (r) { mx += '<tr><td>' + r[0] + '</td><td><span class="gi-badge gi-b-' + r[1] + '">' + r[2] + '</span></td><td style="color:var(--fog);font-size:11.5px">' + r[3] + '</td></tr>'; });
      mx += '</table>';
      return '<div class="gi"><div class="gi-title">Data-confidence matrix</div><div class="gi-card">' + mx + '<p class="gi-note"><span class="gi-badge gi-b-src">Sourced</span> external refs · <span class="gi-badge gi-b-can">Canonical</span> expert-verified · <span class="gi-badge gi-b-con">Convention</span> production norms, not measured.</p></div></div>';
    }
    return "";
  }
  // ---- V90: per-section guide diagrams + colourised body ----
  function injectAfterH2(html, needle, frag) {
    var idx = html.indexOf(needle); if (idx < 0) return html + frag;
    var close = html.indexOf("</h2>", idx); if (close < 0) return html + frag;
    close += 5; return html.slice(0, close) + frag + html.slice(close);
  }
  function gdBar(pct, col) { return '<i style="height:' + pct + '%;background:' + col + '"></i>'; }
  function guideDiagrams(name) {
    var D = [];
    if (name === "Harmonic Mixing & Camelot") {
      D.push(["compatible-move rules",
        '<div class="gi"><div class="gi-title">Compatible moves from 8A</div><div class="gi-card gd-moves">' +
        '<div class="gd-hub">8A<span>YOU ARE HERE</span></div><div class="gd-mv">' +
        '<div class="gd-arm" data-tip="Same Camelot code — identical key, guaranteed clean blend" style="--ac:#C6F000"><b>→ 8A</b>Same key · perfect blend</div>' +
        '<div class="gd-arm" data-tip="One step around the wheel — the classic energy-preserving move" style="--ac:#2FE6FF"><b>→ 7A / 9A</b>±1 step · energy-preserving</div>' +
        '<div class="gd-arm" data-tip="Same number, flip the letter — relative major/minor, shifts mood" style="--ac:#FF3D9A"><b>→ 8B</b>Flip A↔B · mood shift</div>' +
        '<div class="gd-arm" data-tip="+7 on the wheel — jumps a perfect 5th, lifts energy; use sparingly" style="--ac:#FFC24B"><b>→ 3A</b>+7 · energy boost (sparingly)</div>' +
        '</div></div></div>']);
      var W = 560, H = 116, pad = 22, lo = 60, hi = 180, bx = function (b) { return (pad + (b - lo) / (hi - lo) * (W - 2 * pad)).toFixed(1); }, yb = 74;
      var ticks = [[70, "70", "Trap ½", "70 BPM — trap / half-time; sits under a 140 track"], [124, "124", "House", "124 BPM — house / tech-house core tempo"], [140, "140", "Dubstep", "140 BPM — dubstep; its half-time feel reads as 70"], [174, "174", "DnB", "174 BPM — drum & bass; half-time reads as 87"]], sv = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">';
      sv += '<line x1="' + pad + '" y1="' + yb + '" x2="' + (W - pad) + '" y2="' + yb + '" stroke="rgba(255,255,255,0.18)"/>';
      function arc(b1, b2, lab, col, ch, ly) { var x1 = +bx(b1), x2 = +bx(b2), mx = (x1 + x2) / 2; return '<path d="M' + x1 + ' ' + yb + ' Q' + mx + ' ' + ch + ' ' + x2 + ' ' + yb + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-dasharray="4 3"/><text x="' + mx + '" y="' + ly + '" fill="' + col + '" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">' + lab + '</text>'; }
      sv += arc(70, 140, "double-time ×2", "#2FE6FF", 22, 16);
      sv += arc(87, 174, "halftime ×½", "#FFC24B", 46, 42);
      ticks.forEach(function (t) { var x = bx(t[0]); sv += '<g data-tip="' + t[3] + '" style="cursor:pointer"><rect x="' + (x - 18) + '" y="' + (yb - 16) + '" width="36" height="40" fill="transparent" pointer-events="all"/><line x1="' + x + '" y1="' + (yb - 5) + '" x2="' + x + '" y2="' + (yb + 5) + '" stroke="#ECECF4" stroke-width="2"/><text x="' + x + '" y="' + (yb + 20) + '" fill="#ECECF4" font-family="Space Mono,monospace" font-size="10" font-weight="700" text-anchor="middle">' + t[1] + '</text><text x="' + x + '" y="' + (yb + 32) + '" fill="rgba(236,236,244,0.55)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">' + t[2] + '</text></g>'; });
      sv += '<text x="' + bx(87) + '" y="87" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">DnB ½</text></svg>';
      D.push(["Cross-genre", '<div class="gi"><div class="gi-title">BPM bridges (tempo ladder)</div><div class="gi-card">' + sv + '<p class="gi-note">Match keys first, then bridge tempo: small ±4 gaps pitch-ride; big gaps use the halftime / double-time feel (a 70 track sits under a 140, an 87 under a 174).</p></div></div>']);
    }
    if (name === "Set Building — Energy Arc") {
      var steps = [["01", "Pick the arc", "Choose the arc for your slot & room (opening ≠ peak ≠ closing)"], ["02", "Sort Energy+BPM", "Order candidates so they climb, plateau, then ease"], ["03", "Check keys", "Keep neighbours within the Camelot rules; A↔B to shift mood"], ["04", "Plan bridges", "At genre / BPM changes use the CSV Transition Tip"], ["05", "Escape hatches", "Leave a breakdown / beatless exit if a mix isn't landing"]], fl = '<div class="gd-flow">';
      steps.forEach(function (s, i) { fl += (i ? '<span class="gd-fa">→</span>' : "") + '<div class="gd-step" data-tip="' + s[2] + '"><i>' + s[0] + '</i><h6>' + s[1] + '</h6></div>'; });
      fl += '</div>';
      D.push(["How to program it", '<div class="gi"><div class="gi-title">Program flow</div><div class="gi-card">' + fl + '</div></div>']);
      var good = [30, 45, 58, 72, 85].map(function (h) { return gdBar(h, "#7CE88A"); }).join("");
      var bad = gdBar(40, "#FF6A6A") + gdBar(10, "rgba(255,255,255,.08)") + gdBar(10, "rgba(255,255,255,.08)") + gdBar(10, "rgba(255,255,255,.08)") + gdBar(90, "#FF6A6A");
      D.push(["Rules of thumb", '<div class="gi"><div class="gi-title">Move energy ±1–2 at a time</div><div class="gi-card gd-two">' +
        '<div class="gd-ex good" data-tip="Climb one or two energy levels at a time — the floor stays with you"><span class="tag">✓ GRADUAL 3→7</span><div class="gd-seq">' + good + '</div></div>' +
        '<div class="gd-ex bad" data-tip="Jumping 4→9 empties a floor as fast as staying flat does"><span class="tag">✕ JUMP 4→9</span><div class="gd-seq">' + bad + '</div></div></div></div>']);

      var faders = '<div class="gd-faders">' +
        '<div class="gd-fader" data-tip="Tempo (BPM) — plan a target per slot; raise 2–4 at a time"><div class="gd-fval">126</div><div class="gd-ftrk"><i style="height:52%"></i><span class="gd-fknob" style="bottom:52%"></span></div><div class="gd-flbl">TEMPO</div></div>' +
        '<div class="gd-fader" data-tip="Energy (1–10) — emotional intensity; move it ±1–2 at a time"><div class="gd-fval">7</div><div class="gd-ftrk"><i style="height:70%"></i><span class="gd-fknob" style="bottom:70%"></span></div><div class="gd-flbl">ENERGY</div></div>' +
        '<div class="gd-fader" data-tip="Key (Camelot) — not a level; pick harmonically (stay / ±1 / A↔B)"><div class="gd-fval">8A</div><div class="gd-ftrk gd-ftrk-key"><span class="gd-fknob" style="bottom:60%"></span></div><div class="gd-flbl">KEY</div></div></div>';
      D.push(["The classic energy arc", '<div class="gi"><div class="gi-title">The three levers you control</div><div class="gi-card">' + faders + '<p class="gi-note">Every transition moves one or more of these — tempo, energy, key. Plan them per slot before you touch the decks.</p></div></div>']);
      var slots = [["Warm-up", 1, 4, "Ambient, Downtempo, Organic House, Deep House"], ["Build", 4, 6, "House, Nu Disco, Indie Dance, Prog House, Afro House"], ["Peak", 7, 9, "Tech House, Bass House, Trance, Techno, Psy, Big Room"], ["Hard peak", 8, 10, "DnB, Dubstep, Hardstyle, Hardcore"], ["Wind-down", 3, 5, "Melodic / Deep / Organic House, Downtempo"]];
      var hmW = 520, hmLab = 82, hmTop = 18, hmRowH = 26, hmCols = 10, hmCw = (hmW - hmLab - 6) / hmCols, hmH = hmTop + slots.length * hmRowH + 16;
      var hm = '<svg viewBox="0 0 ' + hmW + ' ' + hmH + '" width="100%" style="display:block" aria-hidden="true">';
      for (var hc = 1; hc <= hmCols; hc++) hm += '<text x="' + (hmLab + (hc - 0.5) * hmCw).toFixed(1) + '" y="12" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">' + hc + '</text>';
      slots.forEach(function (s, ri) { var y = hmTop + ri * hmRowH; hm += '<g data-tip="' + s[0] + ' — ' + s[3] + '" style="cursor:pointer">'; hm += '<text x="' + (hmLab - 8) + '" y="' + (y + hmRowH / 2 + 3) + '" fill="#ECECF4" font-family="Space Mono,monospace" font-size="9.5" text-anchor="end">' + s[0] + '</text>'; for (var hc2 = 1; hc2 <= hmCols; hc2++) { var hx = hmLab + (hc2 - 1) * hmCw; var on = hc2 >= s[1] && hc2 <= s[2]; var hue = (140 - (hc2 - 1) / 9 * 140).toFixed(0); hm += '<rect x="' + hx.toFixed(1) + '" y="' + (y + 2) + '" width="' + (hmCw - 2).toFixed(1) + '" height="' + (hmRowH - 4) + '" rx="2" fill="' + (on ? 'hsla(' + hue + ',72%,52%,0.85)' : 'rgba(255,255,255,0.035)') + '"/>'; } hm += '</g>'; });
      hm += '<text x="' + (hmLab + (hmW - hmLab) / 2).toFixed(1) + '" y="' + (hmH - 2) + '" fill="rgba(236,236,244,0.45)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">ENERGY  1  →  10</text></svg>';
      D.push(["Slots, and which genres fit", '<div class="gi"><div class="gi-title">Genre × slot placement map</div><div class="gi-card">' + hm + '<p class="gi-note">Green = low energy, red = high. Each slot lives in an energy band — hover a row for the genres that sit there.</p></div></div>']);
      var bpms = [112, 116, 120, 124, 127, 130, 134, 138], scN = bpms.length, scW = 520, scH = 150, scPl = 34, scPb = 22, scPt = 12, scMin = 108, scMax = 142;
      var scX = function (i) { return (scPl + i / (scN - 1) * (scW - scPl - 12)); }, scY = function (b) { return (scH - scPb - (b - scMin) / (scMax - scMin) * (scH - scPb - scPt)); };
      var sc = '<svg viewBox="0 0 ' + scW + ' ' + scH + '" width="100%" style="display:block" aria-hidden="true">';
      [110, 120, 130, 140].forEach(function (b) { sc += '<line x1="' + scPl + '" y1="' + scY(b).toFixed(1) + '" x2="' + (scW - 12) + '" y2="' + scY(b).toFixed(1) + '" stroke="rgba(255,255,255,0.06)"/><text x="' + (scPl - 6) + '" y="' + (scY(b) + 3).toFixed(1) + '" fill="rgba(236,236,244,0.45)" font-family="Space Mono,monospace" font-size="8" text-anchor="end">' + b + '</text>'; });
      var sp = 'M' + scX(0).toFixed(1) + ' ' + scY(bpms[0]).toFixed(1);
      for (var si = 1; si < scN; si++) sp += ' L' + scX(si).toFixed(1) + ' ' + scY(bpms[si - 1]).toFixed(1) + ' L' + scX(si).toFixed(1) + ' ' + scY(bpms[si]).toFixed(1);
      sc += '<path d="' + sp + '" fill="none" stroke="#2FE6FF" stroke-width="2.5" stroke-linejoin="round"/>';
      for (var sd = 0; sd < scN; sd++) { sc += '<g data-tip="Track ' + (sd + 1) + ' · ' + bpms[sd] + ' BPM' + (sd ? ' (+' + (bpms[sd] - bpms[sd - 1]) + ')' : ' · start') + '" style="cursor:pointer"><rect x="' + (scX(sd) - 10).toFixed(1) + '" y="' + scPt + '" width="20" height="' + (scH - scPb - scPt) + '" fill="transparent" pointer-events="all"/><circle cx="' + scX(sd).toFixed(1) + '" cy="' + scY(bpms[sd]).toFixed(1) + '" r="4" fill="#2FE6FF"/></g><text x="' + scX(sd).toFixed(1) + '" y="' + (scH - 7) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">' + (sd + 1) + '</text>'; }
      sc += '</svg>';
      D.push(["Rules of thumb", '<div class="gi"><div class="gi-title">Tempo staircase — +2–4 BPM per track</div><div class="gi-card">' + sc + '<p class="gi-note">Raise tempo in small steps across the set (unless you use a deliberate half-time / double-time bridge). Hover a step for the jump.</p></div></div>']);

      var raW = 520, raH = 180, raPl = 30, raPb = 24, raPt = 12;
      var raX = function (f) { return (raPl + f * (raW - raPl - 10)).toFixed(1); }, raY = function (e) { return (raH - raPb - (e / 10) * (raH - raPb - raPt)).toFixed(1); };
      var warmPts = [[0, 2], [0.15, 3], [0.3, 4.3], [0.42, 5.4], [0.5, 6]], mainPts = [[0.5, 6], [0.62, 8], [0.72, 9], [0.82, 9], [0.92, 8], [1, 7]];
      function raLine(pts) { var d = 'M' + raX(pts[0][0]) + ' ' + raY(pts[0][1]); for (var i = 1; i < pts.length; i++) d += ' L' + raX(pts[i][0]) + ' ' + raY(pts[i][1]); return d; }
      function raArea(pts) { return raLine(pts) + ' L' + raX(pts[pts.length - 1][0]) + ' ' + raY(0) + ' L' + raX(pts[0][0]) + ' ' + raY(0) + ' Z'; }
      var relay = '<svg viewBox="0 0 ' + raW + ' ' + raH + '" width="100%" style="display:block" aria-hidden="true"><defs><linearGradient id="raC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FE6FF" stop-opacity="0.3"/><stop offset="1" stop-color="#2FE6FF" stop-opacity="0.02"/></linearGradient><linearGradient id="raM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.32"/><stop offset="1" stop-color="#FF3D9A" stop-opacity="0.02"/></linearGradient></defs>';
      [2, 4, 6, 8, 10].forEach(function (e) { relay += '<line x1="' + raPl + '" y1="' + raY(e) + '" x2="' + (raW - 10) + '" y2="' + raY(e) + '" stroke="rgba(255,255,255,0.05)"/><text x="' + (raPl - 5) + '" y="' + (+raY(e) + 3) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="end">' + e + '</text>'; });
      relay += '<path d="' + raArea(warmPts) + '" fill="url(#raC)"/><path d="' + raArea(mainPts) + '" fill="url(#raM)"/>';
      relay += '<path d="' + raLine(warmPts) + '" fill="none" stroke="#2FE6FF" stroke-width="2.5" stroke-linejoin="round" data-tip="Warm-up curve — build 2\u21926 and stop; leave headroom" style="cursor:pointer"/>';
      relay += '<path d="' + raLine(mainPts) + '" fill="none" stroke="#FF3D9A" stroke-width="2.5" stroke-linejoin="round" data-tip="Main curve — take 6\u21929, hold the plateau, then land it" style="cursor:pointer"/>';
      relay += '<line x1="' + raX(0.5) + '" y1="' + raPt + '" x2="' + raX(0.5) + '" y2="' + (raH - raPb) + '" stroke="rgba(198,240,0,0.5)" stroke-dasharray="4 3"/><text x="' + raX(0.5) + '" y="' + (raPt + 1) + '" fill="#C6F000" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">HAND-OFF</text>';
      relay += '<text x="' + raX(0.24) + '" y="' + (raH - 7) + '" fill="#2FE6FF" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">WARM-UP</text><text x="' + raX(0.76) + '" y="' + (raH - 7) + '" fill="#FF3D9A" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">MAIN / PEAK</text>';
      relay += '</svg>';
      var roles = [["WARM-UP DJ", "opener", "#2FE6FF", [["Job", "Fill the room, set the mood, build a foundation"], ["Slot length", "\u2248 3\u20134 hrs \u00b7 60\u201390 min at festivals"], ["Energy", "2\u20136 \u2014 never peak"], ["Tempo", "~110\u2013124 BPM, rising gently"], ["Selection", "Deep, groovy, atmospheric \u2014 save the anthems"], ["Blends", "Long & patient (16\u201332 bars)"], ["Mindset", "Restraint \u2014 leave headroom"], ["Avoid", "Peaking early / dropping the big tracks"]]], ["MAIN DJ", "peak-time \u00b7 headliner", "#FF3D9A", [["Job", "Take the built energy to the peak"], ["Slot length", "\u2248 2\u20133 hrs \u00b7 60\u201390 min at festivals"], ["Energy", "6\u201310 \u2014 big moments"], ["Tempo", "~124\u2013140+ BPM"], ["Selection", "Anthems, drops, recognisable hooks"], ["Blends", "Tighter, punchier, double-drops"], ["Mindset", "Command the room, then land it"], ["Avoid", "Resetting the floor / flat at 10"]]]];
      var rolh = '<div class="gd-roles">';
      roles.forEach(function (r) { rolh += '<div class="gd-role" style="--rlc:' + r[2] + '" data-tip="' + r[0] + ' \u2014 ' + r[3][0][1] + '"><div class="gd-rolehd"><b>' + r[0] + '</b><span>' + r[1] + '</span></div>'; r[3].forEach(function (row) { rolh += '<div class="gd-rolerow"><span class="k">' + row[0] + '</span><span class="v">' + row[1] + '</span></div>'; }); rolh += '</div>'; });
      rolh += '</div>';
      var owW = 520, owH = 200, owPl = 40, owPb = 30, owPt = 14;
      var owX = function (b) { return (owPl + (b - 105) / 40 * (owW - owPl - 14)); }, owY = function (e) { return (owH - owPb - (e - 1) / 9 * (owH - owPb - owPt)); };
      var ow = '<svg viewBox="0 0 ' + owW + ' ' + owH + '" width="100%" style="display:block" aria-hidden="true">';
      [110, 120, 130, 140].forEach(function (b) { ow += '<line x1="' + owX(b).toFixed(1) + '" y1="' + owPt + '" x2="' + owX(b).toFixed(1) + '" y2="' + (owH - owPb) + '" stroke="rgba(255,255,255,0.04)"/><text x="' + owX(b).toFixed(1) + '" y="' + (owH - owPb + 12) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">' + b + '</text>'; });
      [2, 4, 6, 8, 10].forEach(function (e) { ow += '<line x1="' + owPl + '" y1="' + owY(e).toFixed(1) + '" x2="' + (owW - 14) + '" y2="' + owY(e).toFixed(1) + '" stroke="rgba(255,255,255,0.04)"/><text x="' + (owPl - 5) + '" y="' + (owY(e) + 3).toFixed(1) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="end">' + e + '</text>'; });
      ow += '<rect x="' + owX(110).toFixed(1) + '" y="' + owY(6).toFixed(1) + '" width="' + (owX(124) - owX(110)).toFixed(1) + '" height="' + (owY(2) - owY(6)).toFixed(1) + '" rx="4" fill="rgba(47,230,255,0.14)" stroke="#2FE6FF" data-tip="Warm-up window \u2014 energy 2\u20136 \u00b7 110\u2013124 BPM" style="cursor:pointer"/><text x="' + ((owX(110) + owX(124)) / 2).toFixed(1) + '" y="' + owY(4).toFixed(1) + '" fill="#2FE6FF" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">WARM-UP</text>';
      ow += '<rect x="' + owX(124).toFixed(1) + '" y="' + owY(10).toFixed(1) + '" width="' + (owX(140) - owX(124)).toFixed(1) + '" height="' + (owY(6) - owY(10)).toFixed(1) + '" rx="4" fill="rgba(255,61,154,0.14)" stroke="#FF3D9A" data-tip="Main window \u2014 energy 6\u201310 \u00b7 124\u2013140+ BPM" style="cursor:pointer"/><text x="' + ((owX(124) + owX(140)) / 2).toFixed(1) + '" y="' + owY(8.5).toFixed(1) + '" fill="#FF3D9A" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">MAIN</text>';
      ow += '<circle cx="' + owX(124).toFixed(1) + '" cy="' + owY(6).toFixed(1) + '" r="4" fill="#C6F000" data-tip="Hand-off zone \u2014 ~124 BPM, energy 6: where the warm-up passes to the main" style="cursor:pointer"/>';
      ow += '<text x="' + ((owPl + owW - 14) / 2) + '" y="' + (owH - 4) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">BPM \u2192</text><text x="12" y="' + ((owPt + owH - owPb) / 2) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle" transform="rotate(-90 12 ' + ((owPt + owH - owPb) / 2) + ')">ENERGY \u2191</text></svg>';
      function miniE(pts, col) { var W = 210, H = 58, pl = 6, pb = 8, pt = 8, x = function (f) { return (pl + f * (W - pl - 6)).toFixed(1); }, y = function (v) { return (H - pb - v * (H - pb - pt)).toFixed(1); }; var d = 'M' + x(pts[0][0]) + ' ' + y(pts[0][1]); for (var i = 1; i < pts.length; i++) d += ' L' + x(pts[i][0]) + ' ' + y(pts[i][1]); return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;margin-top:6px" aria-hidden="true"><line x1="' + x(0.5) + '" y1="' + pt + '" x2="' + x(0.5) + '" y2="' + (H - pb) + '" stroke="rgba(198,240,0,0.4)" stroke-dasharray="3 3"/><text x="' + x(0.5) + '" y="' + (pt + 1) + '" fill="#C6F000" font-family="Space Mono,monospace" font-size="7" text-anchor="middle">hand-off</text><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/></svg>'; }
      var handoff = '<div class="gd-two"><div class="gd-ex good" data-tip="Match the outgoing energy & BPM — the floor keeps climbing"><span class="tag">\u2713 MATCH THE ENERGY</span>' + miniE([[0, 0.45], [0.35, 0.5], [0.5, 0.55], [0.72, 0.78], [1, 0.9]], "#7CE88A") + '</div><div class="gd-ex bad" data-tip="Resetting to zero on arrival empties the floor"><span class="tag">\u2717 RESET TO ZERO</span>' + miniE([[0, 0.55], [0.5, 0.55], [0.56, 0.15], [1, 0.2]], "#FF6A6A") + '</div></div>';

      var hats = '<div class="gd-hats"><span class="gd-hat" style="--hc:#2FE6FF">WARM-UP</span><span class="gd-hplus">+</span><span class="gd-hat" style="--hc:#FF3D9A">MAIN</span><span class="gd-hplus">+</span><span class="gd-hat" style="--hc:#8A63FF">CLOSER</span><span class="gd-heq">=</span><span class="gd-hyou">YOU \u00b7 all night</span></div>';
      var anW = 520, anH = 190, anPl = 30, anPb = 30, anPt = 12;
      var anX = function (f) { return (anPl + f * (anW - anPl - 10)).toFixed(1); }, anY = function (e) { return (anH - anPb - (e / 10) * (anH - anPb - anPt)).toFixed(1); };
      var anPts = [[0, 2], [0.083, 3], [0.167, 4], [0.25, 6], [0.333, 7], [0.417, 5], [0.5, 7], [0.583, 8], [0.667, 9], [0.75, 9], [0.833, 7], [0.917, 5], [1, 3]];
      var anD = 'M' + anX(anPts[0][0]) + ' ' + anY(anPts[0][1]); for (var ani = 1; ani < anPts.length; ani++) anD += ' L' + anX(anPts[ani][0]) + ' ' + anY(anPts[ani][1]);
      var wave = '<svg viewBox="0 0 ' + anW + ' ' + anH + '" width="100%" style="display:block" aria-hidden="true"><defs><linearGradient id="anG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.28"/><stop offset="1" stop-color="#8A63FF" stop-opacity="0.02"/></linearGradient></defs>';
      [2, 4, 6, 8, 10].forEach(function (e) { wave += '<line x1="' + anPl + '" y1="' + anY(e) + '" x2="' + (anW - 10) + '" y2="' + anY(e) + '" stroke="rgba(255,255,255,0.05)"/><text x="' + (anPl - 5) + '" y="' + (+anY(e) + 3) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="end">' + e + '</text>'; });
      wave += '<path d="' + anD + ' L' + anX(1) + ' ' + anY(0) + ' L' + anX(0) + ' ' + anY(0) + ' Z" fill="url(#anG)"/><path d="' + anD + '" fill="none" stroke="#FF3D9A" stroke-width="2.5" stroke-linejoin="round"/>';
      var anPh = [["Open", 0, 0.14, "Hr 0\u20131 \u00b7 energy 2\u20133 \u00b7 deep & slow, fill the room"], ["Build", 0.14, 0.29, "Hr 1\u20132 \u00b7 energy 3\u20135 \u00b7 introduce groove"], ["Peak 1", 0.29, 0.46, "Hr 2\u20133 \u00b7 energy 6\u20137 \u00b7 first wave, then a breather"], ["Rebuild", 0.46, 0.63, "Hr 3\u20134 \u00b7 energy 6\u20138 \u00b7 climb again"], ["Main peak", 0.63, 0.83, "Hr 4\u20135 \u00b7 energy 8\u20139 \u00b7 the big moment + plateau"], ["Close", 0.83, 1, "Hr 5\u20136 \u00b7 energy 5\u21923 \u00b7 comedown, land it"]];
      anPh.forEach(function (p) { wave += '<rect x="' + anX(p[1]) + '" y="' + anPt + '" width="' + (anX(p[2]) - anX(p[1])).toFixed(1) + '" height="' + (anH - anPb - anPt) + '" fill="transparent" pointer-events="all" data-tip="' + p[0] + ' \u2014 ' + p[3] + '" style="cursor:pointer"/>'; });
      wave += '<text x="' + anX(0.333) + '" y="' + (+anY(7) - 6) + '" fill="#C6F000" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">peak 1</text><text x="' + anX(0.7) + '" y="' + (+anY(9) - 6) + '" fill="#FF3D9A" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">MAIN PEAK</text><text x="' + anX(0.417) + '" y="' + (+anY(5) + 12) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="7" text-anchor="middle">reset</text>';
      [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1].forEach(function (f, i) { wave += '<text x="' + anX(f) + '" y="' + (anH - 10) + '" fill="rgba(236,236,244,0.45)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">' + i + 'h</text>'; });
      wave += '</svg>';
      var hrs = [["Hr 0\u20131", "Open", "2\u20133", "#2FE6FF", "deep, slow, atmospheric"], ["Hr 1\u20132", "Build", "3\u20135", "#2FE6FF", "introduce groove, lift gently"], ["Hr 2\u20133", "First peak", "6\u20137", "#C6F000", "a wave up, then a breather"], ["Hr 3\u20134", "Rebuild", "6\u20138", "#FFC24B", "climb toward the main peak"], ["Hr 4\u20135", "Main peak", "8\u20139", "#FF3D9A", "big-room moment + plateau"], ["Hr 5\u20136", "Comedown", "4\u21923", "#8A63FF", "wind down, land the night"]];
      var hrh = '<div class="gd-hrs">';
      hrs.forEach(function (h) { hrh += '<div class="gd-hrc" style="--hc:' + h[3] + '" data-tip="' + h[0] + ' \u00b7 ' + h[1] + ' \u2014 energy ' + h[2] + ' \u00b7 ' + h[4] + '"><div class="hr">' + h[0] + '</div><b>' + h[1] + '</b><span class="e">energy ' + h[2] + '</span><div class="v">' + h[4] + '</div></div>'; });
      hrh += '</div>';
      D.push(["all-night set", '<div class="gi"><div class="gi-title">One DJ wears all three hats</div><div class="gi-card">' + hats + '</div></div>' +
        '<div class="gi"><div class="gi-title">A 6-hour set moves in waves, not one peak</div><div class="gi-card">' + wave + '</div></div>' +
        '<div class="gi"><div class="gi-title">Hour by hour \u2014 a 6-hour shape</div>' + hrh + '</div>']);

      D.push(["Warm-up DJ vs main DJ", '<div class="gi"><div class="gi-title">The night is a relay \u2014 two energy arcs, one hand-off</div><div class="gi-card">' + relay + '</div></div>' +
        '<div class="gi"><div class="gi-title">Two jobs, side by side</div>' + rolh + '</div>' +
        '<div class="gi"><div class="gi-title">Operating windows \u2014 BPM \u00d7 energy</div><div class="gi-card">' + ow + '</div></div>' +
        '<div class="gi"><div class="gi-title">The hand-off \u2014 match, don\'t reset</div><div class="gi-card gd-two">' + handoff + '</div></div>']);

    }
    if (name === "FX & Loop Settings") {
      var td = '<div class="gd-td">' +
        '<div class="z" data-tip="Short divisions — fast rolls & stutters that build tension into a drop" style="background:rgba(47,230,255,.12);color:#2FE6FF"><b>SHORT</b>1/16 · 1/8 · 1/4<br><span style="color:var(--fog)">rolls → build tension</span></div>' +
        '<div class="z" data-tip="Medium divisions — tight slap / echo for groove & rhythmic movement" style="background:rgba(255,194,75,.12);color:#FFC24B"><b>MEDIUM</b>1/2 · 3/4<br><span style="color:var(--fog)">slap / echo groove</span></div>' +
        '<div class="z" data-tip="Long divisions — spacious tails & wash-outs for transitions & breakdowns" style="background:rgba(255,61,154,.12);color:#FF3D9A"><b>LONG</b>1/1 · 2/1 · 4/1<br><span style="color:var(--fog)">wash-outs / breakdowns</span></div></div>';
      var loops = [["4 bar", 100], ["2 bar", 62], ["1 bar", 38], ["½ bar", 22]], lh = '<div class="gd-loop">';
      loops.forEach(function (l, i) { lh += (i ? '<span class="gd-fa">→</span>' : "") + '<div class="gd-lp" data-tip="' + l[0] + ' loop — halve it each phrase to wind up tension" style="width:' + l[1] + 'px"><b>' + l[0] + '</b></div>'; });
      lh += '<span class="gd-fa">→</span><div class="gd-drop" data-tip="The drop — release the tension you built">DROP</div></div>';
      D.push(["How the three settings work", '<div class="gi"><div class="gi-title">Beat FX time division</div><div class="gi-card">' + td + '</div></div>' +
        '<div class="gi"><div class="gi-title">Loop halving → tension build</div><div class="gi-card">' + lh + '<p class="gi-note">Halve the loop each phrase (4→2→1→½ bar), often with a Beat FX Roll, to wind tension right into the drop.</p></div></div>']);

      var fxcat = [["Echo", "Decaying repeats — wash out or thicken", "1/1 \u00b7 50\u201370%", "#2FE6FF"], ["Delay", "Level-held rhythmic repeats", "1/4\u20131/2 \u00b7 30\u201350%", "#2FE6FF"], ["Reverb", "Space & tail, no distinct repeats", "1/1 \u00b7 50\u2013100%", "#8A63FF"], ["Roll", "Stutter riser — the tension tool", "1/8\u21921/16 \u00b7 50\u2192100%", "#FF3D9A"], ["Ping-Pong", "L\u2194R bounce — adds width", "1/2 \u00b7 40\u201360%", "#8A63FF"], ["Spiral", "Pitch-climbing echo", "1/1 \u00b7 60\u2013100%", "#FF3D9A"], ["Filter", "Sweep lows / highs in or out", "to taste", "#C6F000"], ["Vinyl Brake", "Tape-stop to a halt", "1/8\u20131/4 \u00b7 80\u2013100%", "#FF9A3C"], ["Flanger", "Comb-filter colour sweep", "1/1 \u00b7 30\u201350%", "#8A63FF"]];
      var fxc = '<div class="gd-fxcat">';
      fxcat.forEach(function (f) { fxc += '<div class="gd-fxc" data-tip="' + f[0] + ' \u2014 ' + f[1] + ' \u00b7 typical ' + f[2] + '" style="--fc:' + f[3] + '"><b>' + f[0] + '</b><div class="w">' + f[1] + '</div><div class="s">' + f[2] + '</div></div>'; });
      fxc += '</div>';
      D.push(["Beat FX types", '<div class="gi"><div class="gi-title">Beat FX catalog — reach for the right one</div>' + fxc + '</div>']);
      var kcx = 100, kcy = 92, kr = 52;
      function kpt(a, rad) { var t = a * Math.PI / 180; return [(kcx + rad * Math.sin(t)).toFixed(1), (kcy - rad * Math.cos(t)).toFixed(1)]; }
      var knob = '<svg viewBox="0 0 520 170" width="100%" style="display:block" aria-hidden="true">';
      knob += '<circle cx="' + kcx + '" cy="' + kcy + '" r="' + (kr + 12) + '" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)"/>';
      var la0 = kpt(-135, kr), la1 = kpt(-10, kr);
      knob += '<path d="M' + la0[0] + ' ' + la0[1] + ' A' + kr + ' ' + kr + ' 0 0 1 ' + la1[0] + ' ' + la1[1] + '" fill="none" stroke="#2FE6FF" stroke-width="6" stroke-linecap="round" data-tip="Turn LEFT — low-pass filter: removes highs, darker; the classic take-out" style="cursor:pointer"/>';
      var ra0 = kpt(10, kr), ra1 = kpt(135, kr);
      knob += '<path d="M' + ra0[0] + ' ' + ra0[1] + ' A' + kr + ' ' + kr + ' 0 0 1 ' + ra1[0] + ' ' + ra1[1] + '" fill="none" stroke="#C6F000" stroke-width="6" stroke-linecap="round" data-tip="Turn RIGHT — high-pass filter: removes lows, thinner; clean way to bring a track in" style="cursor:pointer"/>';
      var kp = kpt(0, kr - 6);
      knob += '<line x1="' + kcx + '" y1="' + kcy + '" x2="' + kp[0] + '" y2="' + kp[1] + '" stroke="#ECECF4" stroke-width="2.5" stroke-linecap="round"/><circle cx="' + kcx + '" cy="' + kcy + '" r="5" fill="#ECECF4"/>';
      knob += '<text x="' + kcx + '" y="' + (kcy - kr - 18) + '" fill="rgba(236,236,244,0.7)" font-family="Space Mono,monospace" font-size="8.5" text-anchor="middle">CENTRE = DRY</text>';
      knob += '<text x="' + kcx + '" y="158" fill="rgba(236,236,244,0.6)" font-family="Space Mono,monospace" font-size="8.5" text-anchor="middle">\u25c0 LPF (darker) \u00b7 dry \u00b7 HPF (thinner) \u25b6</text>';
      var modes = [["Dub Echo", "filtered echo that builds", "#8A63FF"], ["Noise", "riser under a build", "#FF9A3C"], ["Sweep", "alt low / high sweep", "#2FE6FF"], ["Crush", "bit-crush / distortion", "#FF3D9A"]];
      var my = 40; modes.forEach(function (m) { knob += '<g data-tip="Colour mode: ' + m[0] + ' \u2014 ' + m[1] + '" style="cursor:pointer"><rect x="250" y="' + (my - 11) + '" width="12" height="12" rx="3" fill="' + m[2] + '"/><text x="270" y="' + (my - 1) + '" fill="#ECECF4" font-family="Space Mono,monospace" font-size="10">' + m[0] + '</text><text x="270" y="' + (my + 11) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8">' + m[1] + '</text></g>'; my += 32; });
      knob += '</svg>';
      D.push(["per-channel knob", '<div class="gi"><div class="gi-title">The Colour knob (per channel)</div><div class="gi-card">' + knob + '<p class="gi-note">Per-channel, so you can HPF the outgoing track thin while the incoming stays full \u2014 a clean hand-off without touching the EQ.</p></div></div>']);
      var scen = [["Smooth 8-bar house blend", "8-bar loop", "Echo", "1/1", "40%", 40, "#7CE88A"], ["Build into a big drop", "4\u2192\u00bd bar", "Roll", "1/8\u21921/16", "50\u2192100%", 100, "#FF6A6A"], ["Wash out & exit", "\u2014", "Echo/Reverb", "1/1", "50\u201370%", 65, "#FFC24B"], ["Slam the drop", "\u2014", "Roll/Reverb", "1/8", "80\u2013100%", 95, "#FF6A6A"], ["Genre switch \u2192 DnB", "halftime", "Reverb+roll", "1/1", "60%", 60, "#FFC24B"], ["Escape a clash", "\u2014", "Echo", "1/1", "60%", 60, "#7CE88A"], ["Tape-stop into trap", "1\u20132 bar", "Vinyl Brake", "1/8", "80\u2013100%", 90, "#FF6A6A"], ["Extend a breakdown", "16-bar loop", "Reverb", "1/1", "50\u201370%", 60, "#7CE88A"]];
      var scc = '<div class="gd-scn">';
      scen.forEach(function (s) { scc += '<div class="gd-scnc" data-tip="' + s[0] + ' \u2014 loop ' + s[1] + ' \u00b7 ' + s[2] + ' ' + s[3] + ' \u00b7 depth ' + s[4] + '"><h6>' + s[0] + '</h6><div class="gd-scnr"><span>LOOP ' + s[1] + '</span><span>' + s[2] + '</span><span>' + s[3] + '</span></div><div class="gd-scnd"><i style="width:' + s[5] + '%;background:' + s[6] + '"></i></div><div class="dl">depth ' + s[4] + '</div></div>'; });
      scc += '</div>';
      
      function rbox(x, y, w, h, title, sub, accent, tip) { return '<g data-tip="' + tip + '" style="cursor:pointer"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" fill="rgba(255,255,255,0.03)" stroke="' + accent + '"/><text x="' + (x + w / 2) + '" y="' + (y + (sub ? 18 : h / 2 + 4)) + '" fill="#ECECF4" font-family="Space Mono,monospace" font-size="9.5" font-weight="700" text-anchor="middle">' + title + '</text>' + (sub ? '<text x="' + (x + w / 2) + '" y="' + (y + 32) + '" fill="' + accent + '" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">' + sub + '</text>' : '') + '</g>'; }
      function rarr(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (x2 - 6) + '" y2="' + y2 + '" stroke="rgba(236,236,244,0.4)" stroke-width="1.5"/><path d="M' + x2 + ' ' + y2 + ' l-7 -4 l0 8 z" fill="rgba(236,236,244,0.55)"/>'; }
      var route = '<svg viewBox="0 0 520 150" width="100%" style="display:block" aria-hidden="true">';
      route += rbox(6, 16, 116, 46, "DECK A", "EQ \u00b7 Colour FX", "#2FE6FF", "Channel A \u2014 EQ then Sound Colour FX (per channel, before the crossfader)");
      route += rbox(6, 84, 116, 46, "DECK B", "EQ \u00b7 Colour FX", "#2FE6FF", "Channel B \u2014 EQ then Sound Colour FX (per channel, before the crossfader)");
      route += rbox(182, 53, 92, 42, "CROSSFADER", "", "rgba(236,236,244,0.35)", "Crossfader \u2014 blends the two channels into one signal");
      route += rbox(318, 53, 122, 42, "MASTER", "Beat FX", "#FF3D9A", "Beat FX \u2014 on the master, after the crossfader; works on the blended output");
      route += rarr(122, 39, 182, 66) + rarr(122, 107, 182, 82) + rarr(274, 74, 318, 74) + rarr(440, 74, 486, 74);
      route += '<text x="500" y="78" fill="#ECECF4" font-family="Space Mono,monospace" font-size="9" font-weight="700" text-anchor="middle">OUT</text>';
      route += '<text x="64" y="140" fill="#2FE6FF" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">per-channel (pre)</text>';
      route += '<text x="379" y="140" fill="#FF3D9A" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">master (post)</text>';
      route += '</svg>';
      var combos = [["Clean hand-off", "HPF", "Echo 1/1", "Thin the outgoing and echo it away; incoming keeps the lows", "#2FE6FF", "#FF3D9A"], ["Riser into the drop", "Noise", "Reverb / Roll", "Noise builds the top, Beat FX builds the tail \u2014 release on the 1", "#FF9A3C", "#FF3D9A"], ["Deep breakdown", "LPF", "Spiral / Reverb", "Dark and wide with no beat clash", "#2FE6FF", "#8A63FF"], ["Dub groove", "Dub Echo", "Delay 1/2", "Rhythmic, spacious stabs", "#8A63FF", "#2FE6FF"], ["Hard slam", "Crush", "Reverb 1/8", "Aggressive impact at 80\u2013100% for hard genres", "#FF3D9A", "#FF6A6A"], ["Filter blend", "Filter sweep", "Echo tail", "Smooth hand-off across the phrase", "#C6F000", "#FF3D9A"]];
      var comboh = '<div class="gd-combo">';
      combos.forEach(function (c) { comboh += '<div class="gd-comboc" data-tip="' + c[0] + ' \u2014 ' + c[1] + ' (Colour) + ' + c[2] + ' (Beat FX): ' + c[3] + '"><h6>' + c[0] + '</h6><div class="gd-comborow"><span class="gd-fxpill" style="color:' + c[4] + ';border-color:' + c[4] + '">' + c[1] + '</span><span class="gd-plus">+</span><span class="gd-fxpill" style="color:' + c[5] + ';border-color:' + c[5] + '">' + c[2] + '</span></div><p>' + c[3] + '</p></div>'; });
      comboh += '</div>';
      function fxCurve(curves, marks) {
        var W = 520, H = 120, pl = 8, pr = 10, pt = 16, pb = 20;
        var cx = function (f) { return (pl + f * (W - pl - pr)).toFixed(1); }, cy = function (v) { return (H - pb - v * (H - pb - pt)).toFixed(1); };
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">';
        [0, 0.5, 1].forEach(function (g) { s += '<line x1="' + pl + '" y1="' + cy(g) + '" x2="' + (W - pr) + '" y2="' + cy(g) + '" stroke="rgba(255,255,255,0.05)"/>'; });
        marks.forEach(function (m) { s += '<line x1="' + cx(m[0]) + '" y1="' + pt + '" x2="' + cx(m[0]) + '" y2="' + (H - pb) + '" stroke="rgba(198,240,0,0.4)" stroke-dasharray="3 3"/><text x="' + cx(m[0]) + '" y="' + (pt - 4) + '" fill="#C6F000" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">' + m[1] + '</text>'; });
        curves.forEach(function (c) { var p = c[2], d = 'M' + cx(p[0][0]) + ' ' + cy(p[0][1]); for (var i = 1; i < p.length; i++) d += ' L' + cx(p[i][0]) + ' ' + cy(p[i][1]); s += '<path d="' + d + '" fill="none" stroke="' + c[1] + '" stroke-width="2" stroke-linejoin="round" data-tip="' + c[0] + '" style="cursor:pointer"/>'; });
        s += '<text x="' + pl + '" y="' + (H - 5) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7.5">transition time \u2192</text>';
        return s + '</svg>';
      }
      var fxc2 = [["Out fader", "#FF3D9A", [[0, 1], [0.55, 1], [0.8, 0]]], ["HPF (Colour)", "#2FE6FF", [[0, 0], [0.3, 0], [0.7, 1], [0.8, 1]]], ["Echo depth (Beat FX)", "#C6F000", [[0, 0], [0.4, 0], [0.55, 0.7], [0.8, 0]]]];
      var fauto = fxCurve(fxc2, [[0.4, "HPF up"], [0.55, "echo feed"], [0.8, "pull fader"]]);
      var flegend = '<div class="gi-legend" style="margin-top:8px">';
      fxc2.forEach(function (c) { flegend += '<span class="gi-chip"><i class="gi-dot" style="background:' + c[1] + '"></i>' + c[0] + '</span>'; });
      flegend += '</div>';
      D.push(["Combining Sound Colour", '<div class="gi"><div class="gi-title">Where each FX sits in the signal path</div><div class="gi-card">' + route + '<p class="gi-note">Colour FX shapes each track <b>before</b> the master (per channel); Beat FX works on the <b>blend</b> after the crossfader \u2014 so Colour decides what the Beat FX chews on.</p></div></div>' +
        '<div class="gi"><div class="gi-title">Combos \u2014 pair a Colour move with a Beat FX</div>' + comboh + '</div>' +
        '<div class="gi"><div class="gi-title">Both at once \u2014 a clean hand-off</div><div class="gi-card">' + fauto + flegend + '<p class="gi-note">HPF the outgoing (Colour) as you feed Echo (Beat FX), then pull the fader \u2014 the track thins, echoes, and clears while the incoming takes over.</p></div></div>']);
      D.push(["Scenarios", '<div class="gi"><div class="gi-title">Scenario recipes — situation \u2192 settings</div>' + scc + '</div>']);

    }
    if (name === "Live Performance Playbook") {
      var W = 520, H = 34, gm = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">';
      gm += '<rect x="0" y="8" width="' + (W * 0.7) + '" height="18" rx="3" fill="rgba(124,232,138,0.35)" data-tip="Green — healthy headroom; most of the signal should live here" style="cursor:pointer"/>';
      gm += '<rect x="' + (W * 0.7) + '" y="8" width="' + (W * 0.16) + '" height="18" fill="rgba(255,194,75,0.4)" data-tip="Target — trim so peaks sit at top of green / bottom of red" style="cursor:pointer"/>';
      gm += '<rect x="' + (W * 0.86) + '" y="8" width="' + (W * 0.14) + '" height="18" rx="3" fill="rgba(255,90,90,0.45)" data-tip="Red — clipping / distortion; keep the master out of here" style="cursor:pointer"/>';
      gm += '<rect x="' + (W * 0.66) + '" y="4" width="' + (W * 0.12) + '" height="26" rx="2" fill="none" stroke="#C6F000" stroke-width="2"/>';
      gm += '<text x="' + (W * 0.72) + '" y="21" fill="#08080F" font-family="Space Mono,monospace" font-size="9" font-weight="700" text-anchor="middle">TARGET</text>';
      gm += '<text x="' + (W * 0.35) + '" y="21" fill="rgba(8,20,10,0.7)" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">GREEN — headroom</text>';
      gm += '<text x="' + (W * 0.93) + '" y="21" fill="#3a0d0d" font-family="Space Mono,monospace" font-size="9" text-anchor="middle">RED</text></svg>';
      D.push(["Live technique quick-hits", '<div class="gi"><div class="gi-title">Gain staging</div><div class="gi-card">' + gm + '<p class="gi-note">Trim each channel so peaks sit at the top of green / bottom of red; keep the master out of the red. Loud ≠ clean.</p></div></div>']);
      var esc = [["Ride a breakdown", "Drop into the incoming Cue C — the beatless section covers the exit.", "#2FE6FF"], ["Echo out", "Beat FX Echo 1/1 @ 50–70% on the outgoing, then pull the fader.", "#C6F000"], ["Loop &amp; reset", "Loop 4 bars on the incoming to re-find the phrase, release on the 1.", "#FFC24B"], ["Cut, don't fight it", "Clashing? A clean cut on the downbeat beats a long bad mix.", "#FF3D9A"]], cc = '<div class="gd-cards">';
      esc.forEach(function (e) { cc += '<div class="gd-esc" data-tip="' + e[0] + ' — ' + e[1] + '" style="border-left:3px solid ' + e[2] + '"><h6 style="color:' + e[2] + '">' + e[0] + '</h6><p>' + e[1] + '</p></div>'; });
      cc += '</div>';
      D.push(["When a mix isn't landing", '<div class="gi"><div class="gi-title">Escape hatches</div>' + cc + '</div>']);

      var pads = [["A", "MIX IN", "#5CE68A", "rgba(92,230,138,.28)", "start of the first usable phrase — bring the track in"], ["B", "IMPACT", "#FF4D4D", "rgba(255,77,77,.28)", "first drop / main section — your double-drop reference"], ["C", "BREAKDOWN", "#4C8CFF", "rgba(76,140,255,.28)", "the blend-out zone & escape hatch"], ["D", "MIX OUT", "#FF9A3C", "rgba(255,154,60,.28)", "start of the outro / last clean phrase"]];
      var pg = '<div class="gd-pads">';
      pads.forEach(function (p) { pg += '<div class="gd-pad" data-tip="Cue ' + p[0] + ' — ' + p[1] + ': ' + p[4] + '" style="border-color:' + p[2] + ';color:' + p[2] + ';box-shadow:inset 0 0 22px ' + p[3] + ',0 0 8px ' + p[3] + '"><b>' + p[0] + '</b><span>' + p[1] + '</span></div>'; });
      pg += '</div>';
      D.push(["Hot-cue convention", '<div class="gi"><div class="gi-title">Hot-cue pad layout — colour-code your whole library</div><div class="gi-card">' + pg + '<p class="gi-note">Same four cues, same four colours on every track — muscle memory beats reading the screen in a dark booth.</p></div></div>']);
      var ptW = 520, ptH = 76, ptPl = 8, ptBars = 32, ptBw = (ptW - ptPl * 2) / ptBars, baseY = 52, phcol = ["#2FE6FF", "#C6F000", "#FFC24B", "#FF3D9A"];
      var pt2 = '<svg viewBox="0 0 ' + ptW + ' ' + ptH + '" width="100%" style="display:block" aria-hidden="true">';
      for (var ph = 0; ph < 4; ph++) { var x0 = ptPl + ph * 8 * ptBw, pw = 8 * ptBw; pt2 += '<g data-tip="Phrase ' + (ph + 1) + ' — bars ' + (ph * 8 + 1) + '–' + (ph * 8 + 8) + ' · mix on the boundary" style="cursor:pointer"><rect x="' + x0.toFixed(1) + '" y="20" width="' + (pw - 2).toFixed(1) + '" height="24" rx="3" fill="' + phcol[ph] + '" opacity="0.18"/><text x="' + (x0 + pw / 2).toFixed(1) + '" y="35" fill="' + phcol[ph] + '" font-family="Space Mono,monospace" font-size="9" font-weight="700" text-anchor="middle">P' + (ph + 1) + '</text></g>'; }
      for (var pb = 0; pb <= ptBars; pb++) { var px = ptPl + pb * ptBw, pbig = (pb % 8 === 0), phh = pbig ? 12 : (pb % 4 === 0 ? 7 : 4); pt2 += '<line x1="' + px.toFixed(1) + '" y1="' + baseY + '" x2="' + px.toFixed(1) + '" y2="' + (baseY - phh) + '" stroke="' + (pbig ? '#ECECF4' : 'rgba(236,236,244,0.4)') + '" stroke-width="' + (pbig ? 1.6 : 1) + '"/>'; if (pbig) pt2 += '<text x="' + px.toFixed(1) + '" y="' + (baseY + 12) + '" fill="rgba(236,236,244,0.6)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">' + pb + '</text>'; }
      pt2 += '<line x1="' + ptPl + '" y1="' + baseY + '" x2="' + (ptW - ptPl) + '" y2="' + baseY + '" stroke="rgba(255,255,255,0.2)"/></svg>';
      D.push(["Live technique quick-hits", '<div class="gi"><div class="gi-title">Phrase counting — mix on 8 / 16 / 32-bar lines</div><div class="gi-card">' + pt2 + '<p class="gi-note">EDM is built in 8-bar phrases. Bring the next track in on a phrase boundary — coming in off-phrase is the most common train-wreck.</p></div></div>']);
      var bsW = 520, bsH = 150, bsPl = 30, bsPb = 22, bsPt = 14;
      var bX = function (f) { return (bsPl + f * (bsW - bsPl - 12)); }, bY = function (v) { return (bsH - bsPb - v * (bsH - bsPb - bsPt)); };
      function bsLine(pts) { var d = 'M' + bX(pts[0][0]).toFixed(1) + ' ' + bY(pts[0][1]).toFixed(1); for (var i = 1; i < pts.length; i++) d += ' L' + bX(pts[i][0]).toFixed(1) + ' ' + bY(pts[i][1]).toFixed(1); return d; }
      var outPts = [[0, 1], [0.35, 1], [0.5, 0.5], [0.6, 0.05], [1, 0.02]], inPts = [[0, 0.02], [0.4, 0.05], [0.5, 0.5], [0.65, 1], [1, 1]];
      var bs = '<svg viewBox="0 0 ' + bsW + ' ' + bsH + '" width="100%" style="display:block" aria-hidden="true">';
      bs += '<line x1="' + bX(0.5).toFixed(1) + '" y1="' + bsPt + '" x2="' + bX(0.5).toFixed(1) + '" y2="' + (bsH - bsPb) + '" stroke="rgba(198,240,0,0.5)" stroke-dasharray="4 3"/><text x="' + bX(0.5).toFixed(1) + '" y="' + (bsPt - 3) + '" fill="#C6F000" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">PHRASE BOUNDARY</text>';
      bs += '<path d="' + bsLine(outPts) + '" fill="none" stroke="#FF3D9A" stroke-width="2.5" data-tip="Outgoing lows — cut them as the phrase turns over" style="cursor:pointer"/>';
      bs += '<path d="' + bsLine(inPts) + '" fill="none" stroke="#2FE6FF" stroke-width="2.5" data-tip="Incoming lows — bring them up only after the outgoing is cut" style="cursor:pointer"/>';
      bs += '<text x="' + bX(0.12).toFixed(1) + '" y="' + (bY(1) - 5).toFixed(1) + '" fill="#FF3D9A" font-family="Space Mono,monospace" font-size="8">OUT lows</text><text x="' + bX(0.72).toFixed(1) + '" y="' + (bY(1) - 5).toFixed(1) + '" fill="#2FE6FF" font-family="Space Mono,monospace" font-size="8">IN lows</text>';
      bs += '<text x="' + bsPl + '" y="' + (bsH - 5) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8">time →</text></svg>';
      D.push(["Live technique quick-hits", '<div class="gi"><div class="gi-title">Bass swap — never run two basslines together</div><div class="gi-card">' + bs + '<p class="gi-note">As the new track comes in, cut the outgoing low EQ and bring in the incoming — trade on the phrase boundary so only one kick / bass owns the low end.</p></div></div>']);

      var anaSecs = [["INTRO", 16, "#2FE6FF", "Long-blend entry — start the incoming here, under the outgoing outro", "blend"], ["BUILD", 16, "#C6F000", "Tension rising — a loop-roll build lives here", ""], ["DROP", 28, "#FF3D9A", "Drop-swap / double-drop entry — match keys first, hit the 1", "swap"], ["BREAKDOWN", 16, "#8A63FF", "Breakdown mix — no kick, layer freely; watch the return of the kick", "layer"], ["DROP", 28, "#FF3D9A", "Second drop — big-moment territory", ""], ["OUTRO", 16, "#FF9A3C", "Mix-out / echo-out — blend or wash the exit here", "exit"]];
      var anaW = 520, anaH = 92, anaGap = 6, anaTot = 0, ai;
      for (ai = 0; ai < anaSecs.length; ai++) anaTot += anaSecs[ai][1];
      var anaX = anaGap, ana = '<svg viewBox="0 0 ' + anaW + ' ' + anaH + '" width="100%" style="display:block" aria-hidden="true">';
      for (ai = 0; ai < anaSecs.length; ai++) { var asg = anaSecs[ai], aw = asg[1] / anaTot * (anaW - anaGap * 2), acx = anaX + aw / 2;
        ana += '<g data-tip="' + asg[0] + ' — ' + asg[3] + '" style="cursor:pointer"><rect x="' + anaX.toFixed(1) + '" y="34" width="' + (aw - 2).toFixed(1) + '" height="34" rx="4" fill="' + asg[2] + '" opacity="0.82"/><text x="' + acx.toFixed(1) + '" y="55" fill="#08080F" font-family="Space Mono,monospace" font-size="8.5" font-weight="700" text-anchor="middle">' + asg[0] + '</text></g>';
        if (asg[4]) ana += '<text x="' + acx.toFixed(1) + '" y="20" fill="' + asg[2] + '" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">▼ ' + asg[4] + '</text>';
        anaX += aw; }
      ana += '<text x="' + (anaW / 2) + '" y="' + (anaH - 6) + '" fill="rgba(236,236,244,0.5)" font-family="Space Mono,monospace" font-size="8" text-anchor="middle">where you enter shapes the whole transition — hover a section</text></svg>';
      var mstyles = [["Long blend", "INTRO › OUTRO", "Beatmatch + gradual bass swap, 16–32 bars", "LOW", "#7CE88A"], ["Breakdown mix", "INTO BREAKDOWN", "Layer over the beatless part; align the return of the kick", "LOW", "#7CE88A"], ["Drop swap", "DROP › DROP", "Phrase-perfect, key-match, hard-cut / bass-swap on the 1", "HIGH", "#FF6A6A"], ["Hard cut", "DOWNBEAT / DROP", "Silence outgoing, drop incoming on beat 1 (± spinback)", "MED", "#FFC24B"], ["FX wash-out", "OVER THE TAIL", "Echo 1/1 50–70% on outgoing, pull fader, fade in", "LOW", "#7CE88A"], ["Loop-roll build", "LOOP › RELEASE", "Halve 4→1→½ bar + roll, release on the 1", "MED", "#FFC24B"]];
      var mcards = '<div class="gd-mix">';
      mstyles.forEach(function (m) { mcards += '<div class="gd-mixc" data-tip="' + m[0] + ' — enter ' + m[1].toLowerCase() + ': ' + m[2] + '"><div class="gd-mixh"><b>' + m[0] + '</b><span class="gd-risk" style="--rc:' + m[4] + '">' + m[3] + '</span></div><div class="gd-mixe">ENTER · ' + m[1] + '</div><p>' + m[2] + '</p></div>'; });
      mcards += '</div>';
      var mxW = 520, mxH = 210, mxPl = 46, mxPb = 30, mxPt = 14;
      var mxPts = [["Long blend", 0.15, 0.15, "#7CE88A"], ["FX wash-out", 0.3, 0.2, "#7CE88A"], ["Breakdown", 0.42, 0.32, "#7CE88A"], ["Hard cut", 0.55, 0.5, "#FFC24B"], ["Loop-roll", 0.7, 0.55, "#FFC24B"], ["Drop swap", 0.9, 0.9, "#FF6A6A"]];
      var mxX = function (v) { return mxPl + v * (mxW - mxPl - 16); }, mxY = function (v) { return mxH - mxPb - v * (mxH - mxPb - mxPt); };
      var mxs = '<svg viewBox="0 0 ' + mxW + ' ' + mxH + '" width="100%" style="display:block" aria-hidden="true">';
      [0, 0.25, 0.5, 0.75, 1].forEach(function (g) { mxs += '<line x1="' + mxX(g).toFixed(1) + '" y1="' + mxPt + '" x2="' + mxX(g).toFixed(1) + '" y2="' + (mxH - mxPb) + '" stroke="rgba(255,255,255,0.05)"/><line x1="' + mxPl + '" y1="' + mxY(g).toFixed(1) + '" x2="' + (mxW - 16) + '" y2="' + mxY(g).toFixed(1) + '" stroke="rgba(255,255,255,0.05)"/>'; });
      mxs += '<text x="' + ((mxPl + mxW - 16) / 2) + '" y="' + (mxH - 8) + '" fill="rgba(236,236,244,0.55)" font-family="Space Mono,monospace" font-size="8.5" text-anchor="middle">ENERGY CHANGE  (flat → spike) →</text>';
      mxs += '<text x="13" y="' + ((mxPt + mxH - mxPb) / 2) + '" fill="rgba(236,236,244,0.55)" font-family="Space Mono,monospace" font-size="8.5" text-anchor="middle" transform="rotate(-90 13 ' + ((mxPt + mxH - mxPb) / 2) + ')">RISK  (low → high) →</text>';
      mxPts.forEach(function (p) { var x = mxX(p[1]), y = mxY(p[2]), right = p[1] > 0.68, lx = right ? (x - 8) : (x + 8), anch = right ? 'end' : 'start'; mxs += '<g data-tip="' + p[0] + ' — energy ' + Math.round(p[1] * 10) + '/10 · risk ' + Math.round(p[2] * 10) + '/10" style="cursor:pointer"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="' + p[3] + '"/><text x="' + lx.toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" fill="#ECECF4" font-family="Space Mono,monospace" font-size="8.5" text-anchor="' + anch + '">' + p[0] + '</text></g>'; });
      mxs += '</svg>';
      function tvx(f) { return (70 + f * 440).toFixed(1); }
      function tvDeck(rows, blend) {
        var H = 20 + rows.length * 30, s = '<svg viewBox="0 0 520 ' + H + '" width="100%" style="display:block" aria-hidden="true">';
        if (blend) { var b0 = +tvx(blend[0]), b1 = +tvx(blend[1]); s += '<rect x="' + b0.toFixed(1) + '" y="2" width="' + (b1 - b0).toFixed(1) + '" height="' + (H - 4) + '" fill="rgba(198,240,0,0.06)" stroke="rgba(198,240,0,0.35)" stroke-dasharray="3 3"/><text x="' + ((b0 + b1) / 2).toFixed(1) + '" y="11" fill="#C6F000" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">BLEND</text>'; }
        rows.forEach(function (r, ri) { var y = 16 + ri * 30; s += '<text x="4" y="' + (y + 14) + '" fill="' + r[1] + '" font-family="Space Mono,monospace" font-size="8.5">' + r[0] + '</text>'; r[2].forEach(function (g) { var x0 = +tvx(g[0]), x1 = +tvx(g[1]); s += '<g data-tip="' + r[0] + ' — ' + g[3] + '" style="cursor:pointer"><rect x="' + x0.toFixed(1) + '" y="' + y + '" width="' + (x1 - x0).toFixed(1) + '" height="20" rx="3" fill="' + g[2] + '"/><text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (y + 13) + '" fill="rgba(236,236,244,0.92)" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">' + g[3] + '</text></g>'; }); });
        return s + '</svg>';
      }
      function tvCurve(curves, marks) {
        var W = 520, H = 110, pl = 70, pr = 10, pt = 16, pb = 20;
        var cx = function (f) { return (pl + f * (W - pl - pr)).toFixed(1); }, cy = function (v) { return (H - pb - v * (H - pb - pt)).toFixed(1); };
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">';
        ["0", "50", "100"].forEach(function (lab, gi) { var g = gi / 2; s += '<line x1="' + pl + '" y1="' + cy(g) + '" x2="' + (W - pr) + '" y2="' + cy(g) + '" stroke="rgba(255,255,255,0.05)"/><text x="' + (pl - 6) + '" y="' + (+cy(g) + 3) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7" text-anchor="end">' + lab + '</text>'; });
        marks.forEach(function (m) { s += '<line x1="' + cx(m[0]) + '" y1="' + pt + '" x2="' + cx(m[0]) + '" y2="' + (H - pb) + '" stroke="rgba(198,240,0,0.4)" stroke-dasharray="3 3"/><text x="' + cx(m[0]) + '" y="' + (pt - 4) + '" fill="#C6F000" font-family="Space Mono,monospace" font-size="7.5" text-anchor="middle">' + m[1] + '</text>'; });
        curves.forEach(function (c) { var p = c[3], d = 'M' + cx(p[0][0]) + ' ' + cy(p[0][1]); for (var i = 1; i < p.length; i++) d += ' L' + cx(p[i][0]) + ' ' + cy(p[i][1]); s += '<path d="' + d + '" fill="none" stroke="' + c[1] + '" stroke-width="2" stroke-linejoin="round"' + (c[2] ? ' stroke-dasharray="4 3"' : '') + ' data-tip="' + c[0] + ' — level over the transition" style="cursor:pointer"/>'; });
        s += '<text x="' + pl + '" y="' + (H - 5) + '" fill="rgba(236,236,244,0.4)" font-family="Space Mono,monospace" font-size="7.5">transition time \u2192</text>';
        return s + '</svg>';
      }
      function tvLegend(cs) { var l = '<div class="gi-legend" style="margin-top:8px">'; cs.forEach(function (c) { l += '<span class="gi-chip"><i class="gi-dot" style="background:' + c[1] + '"></i>' + c[0] + '</span>'; }); return l + '</div>'; }
      var TV = [
        { name: "Long blend", entry: "intro \u203a outro", risk: "LOW", rc: "#7CE88A",
          deck: [["A\u00b7out", "#FF3D9A", [[0, 0.6, "rgba(255,61,154,0.22)", "groove"], [0.6, 0.85, "#FF9A3C", "outro"]]], ["B\u00b7in", "#2FE6FF", [[0.15, 0.55, "rgba(47,230,255,0.7)", "intro"], [0.55, 1, "rgba(198,240,0,0.7)", "drop"]]]],
          blend: [0.15, 0.85],
          curves: [["Out fader", "#FF3D9A", 0, [[0, 1], [0.6, 1], [0.85, 0]]], ["In fader", "#2FE6FF", 0, [[0, 0], [0.15, 0], [0.5, 1], [1, 1]]], ["Low-EQ swap", "#C6F000", 1, [[0, 1], [0.5, 1], [0.62, 0]]]],
          marks: [[0.55, "bass swap"]], cap: "Long 16\u201332 bar overlap \u2014 beatmatch, then trade the lows on a phrase boundary. The safest move." },
        { name: "Breakdown mix", entry: "into the breakdown", risk: "LOW", rc: "#7CE88A",
          deck: [["A\u00b7out", "#FF3D9A", [[0, 0.4, "rgba(255,61,154,0.22)", "groove"], [0.4, 0.7, "#8A63FF", "breakdown"], [0.7, 0.9, "rgba(255,61,154,0.22)", "re-build"]]], ["B\u00b7in", "#2FE6FF", [[0.4, 0.7, "rgba(47,230,255,0.7)", "layer"], [0.7, 1, "rgba(198,240,0,0.7)", "beat in"]]]],
          blend: [0.4, 0.85],
          curves: [["Out fader", "#FF3D9A", 0, [[0, 1], [0.7, 1], [0.9, 0]]], ["In fader", "#2FE6FF", 0, [[0, 0], [0.4, 0.45], [0.7, 1], [1, 1]]], ["In kick", "#C6F000", 0, [[0, 0], [0.7, 0], [0.7, 1], [1, 1]]]],
          marks: [[0.7, "kick return"]], cap: "Enter over the beatless breakdown \u2014 no kick clash, so you can layer. Drop the incoming's beat back in on the re-build." },
        { name: "Drop swap / double-drop", entry: "drop \u203a drop", risk: "HIGH", rc: "#FF6A6A",
          deck: [["A\u00b7out", "#FF3D9A", [[0, 0.45, "rgba(255,61,154,0.22)", "build"], [0.45, 0.55, "#FF3D9A", "DROP"]]], ["B\u00b7in", "#2FE6FF", [[0.33, 0.45, "rgba(47,230,255,0.5)", "build"], [0.45, 1, "#FF3D9A", "DROP"]]]],
          blend: [0.42, 0.56],
          curves: [["Out fader", "#FF3D9A", 0, [[0, 1], [0.5, 1], [0.5, 0]]], ["In fader", "#2FE6FF", 0, [[0, 0], [0.5, 0], [0.5, 1], [1, 1]]]],
          marks: [[0.5, "the 1 \u00b7 drop"]], cap: "Line up both drops on the phrase and swap on the downbeat. Match keys first \u2014 the least forgiving move in the book." },
        { name: "Hard cut / slam", entry: "straight to beat 1", risk: "MED", rc: "#FFC24B",
          deck: [["A\u00b7out", "#FF3D9A", [[0, 0.5, "rgba(255,61,154,0.22)", "groove"]]], ["B\u00b7in", "#2FE6FF", [[0.5, 1, "#FF3D9A", "drop / beat 1"]]]],
          blend: null,
          curves: [["Out fader", "#FF3D9A", 0, [[0, 1], [0.5, 1], [0.5, 0]]], ["In fader", "#2FE6FF", 0, [[0, 0], [0.5, 0], [0.5, 1], [1, 1]]]],
          marks: [[0.5, "cut on downbeat"]], cap: "No blend \u2014 silence the outgoing (or let it end) and drop the incoming on beat 1, often with a spin-back or tape-stop." },
        { name: "FX wash-out", entry: "over the tail", risk: "LOW", rc: "#7CE88A",
          deck: [["A\u00b7out", "#FF3D9A", [[0, 0.5, "rgba(255,61,154,0.22)", "groove"], [0.5, 0.78, "rgba(255,154,60,0.4)", "echo tail"]]], ["B\u00b7in", "#2FE6FF", [[0.6, 1, "rgba(47,230,255,0.7)", "intro"]]]],
          blend: [0.6, 0.78],
          curves: [["Out fader", "#FF3D9A", 0, [[0, 1], [0.5, 1], [0.75, 0]]], ["Echo depth", "#C6F000", 0, [[0, 0], [0.45, 0], [0.6, 0.7], [0.78, 0]]], ["In fader", "#2FE6FF", 0, [[0, 0], [0.6, 0], [0.85, 1], [1, 1]]]],
          marks: [[0.5, "echo 1/1"], [0.74, "pull fader"]], cap: "Echo/reverb the outgoing away and bring the incoming in under the tail, then pull the fader once it's covered." },
        { name: "Loop-roll build", entry: "loop \u203a release", risk: "MED", rc: "#FFC24B",
          deck: [["A\u00b7out", "#FF3D9A", [[0, 0.4, "rgba(255,61,154,0.22)", "groove"], [0.4, 0.5, "#C6F000", "4 bar"], [0.5, 0.58, "#C6F000", "2"], [0.58, 0.64, "#C6F000", "1"], [0.64, 0.7, "#C6F000", "\u00bd"]]], ["B\u00b7in", "#2FE6FF", [[0.7, 1, "#FF3D9A", "drop"]]]],
          blend: [0.68, 0.72],
          curves: [["Roll depth", "#C6F000", 0, [[0, 0], [0.4, 0.3], [0.7, 1], [0.7, 0]]], ["Out fader", "#FF3D9A", 0, [[0, 1], [0.7, 1], [0.7, 0]]], ["In fader", "#2FE6FF", 0, [[0, 0], [0.7, 0], [0.7, 1], [1, 1]]]],
          marks: [[0.7, "release on 1"]], cap: "Loop the outgoing and halve it (4\u21921\u2192\u00bd bar) with a roll to build tension, then release exactly on the 1 into the drop." }
      ];
      var details = '<div class="gi-title" style="margin-top:8px">Each entry, step by step \u2014 deck overlap + control moves</div>';
      TV.forEach(function (t) { details += '<div class="gi"><div class="gd-tvhead"><b>' + t.name + '</b><span class="gd-tment">enter: ' + t.entry + '</span><span class="gd-risk" style="--rc:' + t.rc + '">' + t.risk + '</span></div><div class="gi-card"><div class="gd-sub">Deck overlap</div>' + tvDeck(t.deck, t.blend) + '<div class="gd-sub">Control moves (level %)</div>' + tvCurve(t.curves, t.marks) + tvLegend(t.curves) + '<p class="gi-note">' + t.cap + '</p></div></div>'; });
      D.push(["Mix entry points", '<div class="gi"><div class="gi-title">Song anatomy — where you can enter</div><div class="gi-card">' + ana + '</div></div>' +
        '<div class="gi"><div class="gi-title">Six entry styles &amp; how to manage each</div>' + mcards + '</div>' +
        '<div class="gi"><div class="gi-title">Pick your move — energy vs risk</div><div class="gi-card">' + mxs + '<p class="gi-note">Low-energy entries (long blend, wash-out) forgive loose timing; high-energy entries (drop swap) demand phrase-perfect, key-matched execution.</p></div></div>' + details]);

    }
    if (name === "Sources & Method") {
      var W = 520, H = 30, seg = [["Sourced", 0.18, "#7CE88A", "~8 cols", "Beatport taxonomy + documented history"], ["Canonical", 0.22, "#FFCC55", "~10 cols", "expert + web-verified genre classics"], ["Convention", 0.60, "#B0B0C6", "~27 cols", "production norms, not measured per-track"]], x = 0, bar = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">';
      seg.forEach(function (s) { var w = s[1] * W; bar += '<rect x="' + x.toFixed(1) + '" y="4" width="' + (w - 2).toFixed(1) + '" height="22" rx="3" fill="' + s[2] + '" opacity="0.85" data-tip="' + s[0] + ' — ' + s[4] + ' (' + s[3] + ')" style="cursor:pointer"/><text x="' + (x + w / 2).toFixed(1) + '" y="19" fill="#08080F" font-family="Space Mono,monospace" font-size="9" font-weight="700" text-anchor="middle">' + Math.round(s[1] * 100) + '%</text>'; x += w; });
      bar += '</svg><div class="gi-legend" style="margin-top:10px">';
      seg.forEach(function (s) { bar += '<span class="gi-chip"><i class="gi-dot" style="background:' + s[2] + '"></i>' + s[0] + ' · ' + s[3] + '</span>'; });
      bar += '</div>';
      D.push(["Data basis by column", '<div class="gi"><div class="gi-title">Where the ~45 columns come from</div><div class="gi-card">' + bar + '<p class="gi-note">Most of the dataset is <b>convention</b> (production norms, not measured). Trust per-track values from your DJ software over genre averages.</p></div></div>']);
    }
    return D;
  }
  function guideBody(name) {
    var html = md(DATA.guides[name]);
    guideDiagrams(name).forEach(function (d) { html = injectAfterH2(html, d[0], d[1]); });
    return guideHero(name) + html;
  }
  // ---- guides overlay ----
  (function buildGuides() {
    var tabs = document.getElementById("guideTabs"), body = document.getElementById("guideBody");
    var gTip = document.getElementById("guideTip");
    if (!gTip) { gTip = document.createElement("div"); gTip.id = "guideTip"; document.body.appendChild(gTip); }
    body.addEventListener("mousemove", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
      if (t) { gTip.textContent = t.getAttribute("data-tip"); gTip.style.display = "block";
        var x = e.clientX + 14, y = e.clientY + 16, w = gTip.offsetWidth; if (x + w + 8 > window.innerWidth) x = e.clientX - w - 14;
        gTip.style.left = x + "px"; gTip.style.top = y + "px"; }
      else gTip.style.display = "none";
    });
    body.addEventListener("mouseleave", function () { gTip.style.display = "none"; });
    var names = Object.keys(DATA.guides || {});
    if (!names.length) { document.getElementById("guidesBtn").style.display = "none"; return; }
    names.forEach(function (nm, i) {
      var b = document.createElement("button"); b.textContent = nm; b.className = i === 0 ? "active" : "";
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (x) { x.classList.remove("active"); });
        b.classList.add("active"); body.innerHTML = guideBody(nm); body.parentNode.scrollTop = 0;
      });
      tabs.appendChild(b);
    });
    var x = document.createElement("button"); x.textContent = "✕ close"; x.className = "x";
    x.addEventListener("click", function () { overlay.classList.remove("show"); });
    tabs.appendChild(x);
    body.innerHTML = guideBody(names[0]);
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
      if (/^```/.test(ln)) { if (inCode) { var cj = code.join("\n"); if (!/Outer ring|Warm-up|_{4,}/.test(cj)) out.push("<pre>" + esc(cj) + "</pre>"); code = []; } inCode = !inCode; continue; }
      if (inCode) { code.push(ln); continue; }
      if (/^\s*\|.*\|/.test(ln)) { tbl.push(ln); continue; } else flushTbl();
      if (/^###\s/.test(ln)) out.push("<h3>" + inline(ln.slice(4)) + "</h3>");
      else if (/^##\s/.test(ln)) out.push("<h2>" + inline(ln.slice(3)) + "</h2>");
      else if (/^#\s/.test(ln)) out.push("<h1>" + inline(ln.slice(2)) + "</h1>");
      else if (/^\s*[-*]\s/.test(ln)) {
        if (!out.length || out[out.length - 1].slice(-5) !== "</ul>") out.push("<ul></ul>");
        out[out.length - 1] = out[out.length - 1].replace("</ul>", "<li>" + inline(ln.replace(/^\s*[-*]\s/, "")) + "</li></ul>");
      }
      else if (/^_.+_\s*$/.test(ln)) out.push('<p class="md-note">' + inline(ln.replace(/^_/, "").replace(/_\s*$/, "")) + "</p>");
      else if (/^\s*$/.test(ln)) out.push("");
      else out.push("<p>" + inline(ln) + "</p>");
    }
    flushTbl(); if (inCode) { var cj2 = code.join("\n"); if (!/Outer ring|Warm-up|_{4,}/.test(cj2)) out.push("<pre>" + esc(cj2) + "</pre>"); }
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

  // ---- V46: mirror colour channels into the mobile menu (header swatches are hidden on phones) ----
  (function () {
    var ta = document.getElementById("topActions");
    if (!ta || !chWrap) return;
    var strip = document.createElement("div");
    strip.className = "menu-channels"; strip.setAttribute("role", "group"); strip.setAttribute("aria-label", "Colour channel");
    CHANNELS.forEach(function (ch, i) {
      var c = document.createElement("button");
      c.type = "button";
      c.style.background = "linear-gradient(135deg," + ch.c1 + "," + ch.c2 + ")";
      c.title = ch.name; c.setAttribute("aria-label", "Channel " + ch.name);
      c.addEventListener("click", function (ev) { ev.stopPropagation(); applyChannel(i); });
      strip.appendChild(c);
    });
    ta.insertBefore(strip, ta.firstChild);
    window.__syncMenuChannels = function () {
      var cur = parseInt(store("edm_channel"), 10) || 0;
      Array.prototype.forEach.call(strip.children, function (c, j) { c.setAttribute("aria-pressed", j === cur ? "true" : "false"); });
    };
    window.__syncMenuChannels();
  })();

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

  // ---- view toggle: force-graph <-> DNA timeline ----
  var viewBtn = document.getElementById("viewBtn");
  var sceneFab = document.getElementById("sceneFab");
  var orbitCtl = document.getElementById("orbitCtl"), orbitLeft = document.getElementById("orbitLeft"), orbitRight = document.getElementById("orbitRight");
  var SCENES = ["graph", "dna", "orbit", "metro"], SCENE_LBL = { graph: "⋉ GRAPH", dna: "◇ DNA", orbit: "☉ ORBIT", metro: "☰ METRO" };
  function sceneAfter(m) { return SCENES[(SCENES.indexOf(m) + 1) % SCENES.length]; }
  function updViewBtn() { var lbl = SCENE_LBL[sceneAfter(viewMode)]; if (viewBtn) { viewBtn.textContent = lbl; viewBtn.setAttribute("aria-pressed", viewMode !== "graph" ? "true" : "false"); } if (sceneFab) sceneFab.textContent = lbl; }
  function switchScene(toMode) {
    store("edm_view", toMode);
    var lbl = SCENE_LBL[sceneAfter(toMode)]; if (viewBtn) { viewBtn.textContent = lbl; viewBtn.setAttribute("aria-pressed", toMode !== "graph" ? "true" : "false"); } if (sceneFab) sceneFab.textContent = lbl;
    if (matchFromCtl) { matchSet = null; matchFromCtl = false; } hiIdx.graph = hiIdx.dna = hiIdx.metro = -1;
    updSceneCtl(toMode);
    if (toMode !== viewMode) startSceneMorph(toMode);                  // every scene switch morphs the nodes into place
  }
  if (viewBtn) { updViewBtn(); viewBtn.addEventListener("click", function () { switchScene(sceneAfter(viewMode)); }); }
  if (sceneFab) sceneFab.addEventListener("click", function () { switchScene(sceneAfter(viewMode)); });
  if (orbitLeft) orbitLeft.addEventListener("click", function () { sceneNudge(-1); });
  if (orbitRight) orbitRight.addEventListener("click", function () { sceneNudge(1); });
  updSceneCtl(viewMode);
  document.addEventListener("keydown", function (e) {                    // arrow keys drive the scene control in every scene
    var tg = (document.activeElement || {}).tagName; if (tg === "INPUT" || tg === "TEXTAREA") return;
    if (e.key === "ArrowLeft") { e.preventDefault(); sceneNudge(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); sceneNudge(1); }
  });

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
  // ---- V49: focus-mode chips (ALL | FAMILY | RELATED) in the panel head ----
  function syncFocusChips() {
    var fc = document.getElementById("focusChips"); if (!fc) return;
    Array.prototype.forEach.call(fc.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.m === focusMode ? "true" : "false");
    });
  }
  (function () {
    var head = panel && panel.querySelector(".head"); if (!head) return;
    var fc = document.createElement("div"); fc.className = "focuschips"; fc.id = "focusChips";
    fc.setAttribute("role", "group"); fc.setAttribute("aria-label", "Graph focus mode");
    fc.innerHTML = '<span class="fclab">FOCUS</span>' +
      '<button type="button" data-m="all" aria-pressed="true">ALL</button>' +
      '<button type="button" data-m="family" aria-pressed="false">FAMILY</button>' +
      '<button type="button" data-m="related" aria-pressed="false">RELATED</button>';
    head.appendChild(fc);
    fc.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button"); if (!b) return;
      focusMode = b.dataset.m; userSetFocus = true; syncFocusChips();
    });
    // V49: bottom-sheet drag on phones / portrait tablets - drag the head up = expand, down = collapse/close
    var sy = 0, on = false;
    head.addEventListener("pointerdown", function (e) {
      if (!MX || !/phone|tablet-portrait/.test(MX.layoutMode)) return;
      if (e.target.closest && e.target.closest("button")) return;
      on = true; sy = e.clientY;
    });
    window.addEventListener("pointerup", function (e) {
      if (!on) return; on = false;
      var dy = e.clientY - sy;
      if (dy < -36) panel.classList.add("tall");
      else if (dy > 36) { if (panel.classList.contains("tall")) panel.classList.remove("tall"); else if (typeof closePanel === "function") closePanel(); }
    });
  })();
  // ---- V40: mobile top-bar menu ----
  (function () {
    var menuBtn = document.getElementById("menuBtn"), topbarEl = document.querySelector(".topbar"), topActions = document.getElementById("topActions");
    if (!menuBtn || !topbarEl) return;
    function closeM() { topbarEl.classList.remove("menu-open"); menuBtn.setAttribute("aria-expanded", "false"); }
    menuBtn.addEventListener("click", function (e) { e.stopPropagation(); var open = topbarEl.classList.toggle("menu-open"); menuBtn.setAttribute("aria-expanded", open ? "true" : "false"); });
    if (topActions) topActions.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("button")) closeM(); });
    document.addEventListener("click", function (e) { if (topbarEl.classList.contains("menu-open") && !topbarEl.contains(e.target)) closeM(); });
  })();

  // ---- V33: Mood Explorer (filter genres by feeling) ----
  var MOODS = [
    ["Dark", /dark|hypnotic|industrial|menac|grim|brood|dystop|warehouse/i, 0],
    ["Euphoric", /euphor|uplift|anthem|hands.?up|epic|festival/i, 8],
    ["Driving", /driv|relentless|peak.?time|pump|rolling|propuls|hypnotic/i, 7],
    ["Minimal", /minimal|strip|reduc|micro|dub tech|hypnotic/i, -5],
    ["Organic", /organic|afro|live|percuss|warm|jazz|soul|tribal|amapiano/i, 0],
    ["Festival", /big room|mainstage|festival|anthem|electro house|future house/i, 9],
    ["Underground", /underground|raw|deep|\bdub\b|warehouse|acid/i, 0],
    ["Emotional", /emotion|melanchol|soul|melodic|nostalg|beauti/i, 0]
  ];
  function moodText(n) { var d = n.d || {}; return ((n.name || "") + " " + (n.family || "") + " " + (d["Sound Signature"] || "") + " " + (d["Notes"] || "") + " " + (d["Drum Feel"] || "") + " " + (d["Sound Design / Instrumentation"] || "") + " " + (d["Harmony Approach"] || "")).toLowerCase(); }
  function nodeHasMood(n, i) { var m = MOODS[i], e = n.energy || 5; var byE = m[2] > 0 ? e >= m[2] : m[2] < 0 ? e <= (-m[2]) : false; return m[1].test(moodText(n)) || byE; }
  function applyMood(i) {
    activeMood = (activeMood === i) ? -1 : i;
    if (activeMood < 0) { matchSet = null; }
    else { matchSet = {}; matchFromCtl = false; var any = false; for (var k = 0; k < nodes.length; k++) { if (nodeHasMood(nodes[k], activeMood)) { matchSet[nodes[k].id] = 1; any = true; } } if (!any) matchSet = null; }
    if (moodBar) Array.prototype.forEach.call(moodBar.querySelectorAll(".moodchip"), function (b) { b.setAttribute("aria-pressed", (parseInt(b.getAttribute("data-mood"), 10) === activeMood) ? "true" : "false"); });
    if (searchIn) searchIn.value = ""; if (results) results.classList.remove("show");
    updateMoodPill();
    reheat(0.5);
  }
  var moodPill = null;
  function updateMoodPill() {
    if (activeMood >= 0 && !moodPill) {
      moodPill = document.createElement("button");
      moodPill.type = "button"; moodPill.className = "moodpill";
      moodPill.addEventListener("click", function () { applyMood(activeMood); });
      document.body.appendChild(moodPill);
    }
    if (moodPill) {
      if (activeMood < 0) { if (moodPill.parentNode) moodPill.parentNode.removeChild(moodPill); moodPill = null; }
      else { moodPill.textContent = "MOOD: " + MOODS[activeMood][0].toUpperCase() + "  \u2715"; moodPill.setAttribute("aria-label", "Clear mood filter " + MOODS[activeMood][0]); }
    }
  }
  var moodBar = document.getElementById("moodBar"), moodBtn = document.getElementById("moodBtn"), activeMood = -1;
  if (moodBar && moodBtn) {
    // V63: mood chips as a left->right marquee below the header (like the tracks ticker)
    var moodMove = document.createElement("div"); moodMove.className = "mood-move";
    function _mkMood(m, i) { var b = document.createElement("button"); b.type = "button"; b.className = "moodchip"; b.textContent = m[0]; b.setAttribute("data-mood", i); b.setAttribute("aria-pressed", "false"); return b; }
    MOODS.forEach(function (m, i) { moodMove.appendChild(_mkMood(m, i)); });
    MOODS.forEach(function (m, i) { moodMove.appendChild(_mkMood(m, i)); });   // duplicate => seamless loop
    moodBar.appendChild(moodMove);
    moodBar.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".moodchip"); if (b) applyMood(parseInt(b.getAttribute("data-mood"), 10)); });
    moodBar.addEventListener("pointerdown", function () { moodBar.classList.add("hold"); });     // pause while touched so chips are tappable
    moodBar.addEventListener("pointerup", function () { moodBar.classList.remove("hold"); });
    moodBar.addEventListener("pointercancel", function () { moodBar.classList.remove("hold"); });
    moodBar.addEventListener("pointerleave", function () { moodBar.classList.remove("hold"); });
    moodBtn.addEventListener("click", function () {
      moodBar.hidden = !moodBar.hidden; moodBtn.setAttribute("aria-pressed", moodBar.hidden ? "false" : "true");
      if (!moodBar.hidden) { var hw = moodMove.scrollWidth / 2; moodMove.style.animationDuration = Math.max(10, hw / 60).toFixed(1) + "s"; }  // consistent ~60px/s
    });
  }
  // ---- V34: Compare Mode (two genres side by side + A/B playback) ----
  function themedSelect(items, selIndex, onChange, ariaLabel) {
    var wrap = document.createElement("div"); wrap.className = "tsel"; if (ariaLabel) wrap.setAttribute("aria-label", ariaLabel);
    var cur = selIndex || 0;
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "tsel-btn";
    var lbl = document.createElement("span"), ar = document.createElement("span"); ar.className = "tsel-ar"; ar.textContent = "▾";
    btn.appendChild(lbl); btn.appendChild(ar);
    var list = document.createElement("div"); list.className = "tsel-list"; list.hidden = true;
    function render() { lbl.textContent = items[cur] ? items[cur].name : ""; Array.prototype.forEach.call(list.children, function (o, i) { o.classList.toggle("sel", i === cur); }); }
    items.forEach(function (it, i) { var op = document.createElement("button"); op.type = "button"; op.className = "tsel-opt"; op.textContent = it.name; op.addEventListener("click", function (e) { e.stopPropagation(); cur = i; render(); list.hidden = true; wrap.classList.remove("open"); if (onChange) onChange(items[cur].id, cur); }); list.appendChild(op); });
    btn.addEventListener("click", function (e) { e.stopPropagation(); list.hidden = !list.hidden; wrap.classList.toggle("open", !list.hidden); if (!list.hidden) { var s = list.querySelector(".sel"); if (s) list.scrollTop = Math.max(0, s.offsetTop - 60); } });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) { list.hidden = true; wrap.classList.remove("open"); } });
    wrap.appendChild(btn); wrap.appendChild(list); render();
    return { el: wrap, get value() { return items[cur] ? items[cur].id : null; }, set: function (i) { if (i >= 0 && i < items.length) { cur = i; render(); if (onChange) onChange(items[cur].id, cur); } } };
  }
  var cmpEl = null, cmpA = null, cmpB = null;
  function cmpVal(node, field) { return (node && node.d && node.d[field]) ? node.d[field] : "-"; }
  function renderCompare() {
    if (!cmpEl) return;
    var _cmpChart = "";
    try {
      var _pa = window.BeatGenomeProfiles.buildAudioProfile(cmpA.d), _pb = window.BeatGenomeProfiles.buildAudioProfile(cmpB.d);
      var _tr = [["Energy", "energy"], ["Groove", "groove"], ["Darkness", "darkness"], ["Melody", "melody"], ["Swing", "swing"]];
      _cmpChart = '<div class="cmpchart">' + _tr.map(function (x) {
        var va = Math.round((_pa[x[1]] || 0) * 100), vb = Math.round((_pb[x[1]] || 0) * 100);
        return '<div class="cmptrait"><span class="ctl">' + x[0] + '</span><div class="cbars"><div class="cba" style="width:' + va + '%"></div><div class="cbb" style="width:' + vb + '%"></div></div></div>';
      }).join("") + '</div>';
    } catch (e) { _cmpChart = ""; }
    var rows = [
      ["Family", function (n) { return n ? n.family : "-"; }],
      ["BPM", function (n) { return n ? (cmpVal(n, "Typical BPM") !== "-" ? cmpVal(n, "Typical BPM") : n.bpm) : "-"; }],
      ["Energy", function (n) { return n ? (n.energy || "-") + "/10" : "-"; }],
      ["Camelot / Key", function (n) { return n ? (n.camelot || "-") + " - " + cmpVal(n, "Common Keys") : "-"; }],
      ["Groove / Feel", function (n) { return cmpVal(n, "Drum Feel"); }],
      ["Bass / Sound", function (n) { return cmpVal(n, "Sound Design / Instrumentation"); }],
      ["Chords", function (n) { return cmpVal(n, "Chord Progression"); }],
      ["Arrangement", function (n) { return cmpVal(n, "Track Structure"); }],
      ["Mixes with", function (n) { return cmpVal(n, "Mixes Well With"); }],
      ["Artists", function (n) { return cmpVal(n, "Representative Artists"); }],
      ["Producer notes", function (n) { return cmpVal(n, "Production Techniques"); }]
    ];
    var h = '<div class="cmpgrid"><div class="cmpr cmphdr"><span class="cl"></span><span class="ca">' + esc(cmpA ? cmpA.name : "A") + '</span><span class="cb">' + esc(cmpB ? cmpB.name : "B") + '</span></div>';
    rows.forEach(function (r) { h += '<div class="cmpr"><span class="cl">' + r[0] + '</span><span class="ca">' + esc(String(r[1](cmpA) || "-")) + '</span><span class="cb">' + esc(String(r[1](cmpB) || "-")) + '</span></div>'; });
    cmpEl.querySelector("#cmpBody").innerHTML = _cmpChart + h + '</div>';
  }
  function ensureCompare() {
    if (cmpEl) return;
    cmpEl = document.createElement("div"); cmpEl.className = "overlay cmp"; cmpEl.id = "compareOverlay"; cmpEl.setAttribute("role", "dialog");
    cmpEl.innerHTML = '<div class="cmpsheet"><div class="cmphead"><span>Compare genres</span>' +
      '<div class="cmpplay"><button id="cmpPlayA">▶ A</button><button id="cmpPlayB">▶ B</button><button id="cmpStop">■</button></div>' +
      '<button class="x" id="cmpClose">✕ close</button></div>' +
      '<div class="cmpsel" id="cmpSel"></div>' +
      '<div class="cmpbody" id="cmpBody"></div></div>';
    document.body.appendChild(cmpEl);
    var genres = nodes.filter(function (n) { return n.level === "Genre"; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var items = genres.map(function (g) { return { id: g.id, name: g.name }; });
    var _selWrap = cmpEl.querySelector("#cmpSel");
    var tsA = themedSelect(items, 0, function (id) { cmpA = byId[id]; renderCompare(); }, "Genre A");
    var tsB = themedSelect(items, Math.min(1, items.length - 1), function (id) { cmpB = byId[id]; renderCompare(); }, "Genre B");
    _selWrap.appendChild(tsA.el); _selWrap.appendChild(tsB.el);
    _cmpItems = items; _cmpTsA = tsA;
    function upd() { cmpA = byId[tsA.value]; cmpB = byId[tsB.value]; renderCompare(); }
    cmpEl.querySelector("#cmpPlayA").addEventListener("click", function () { if (cmpA && window.BeatGenomeOnSelect) window.BeatGenomeOnSelect(cmpA); });
    cmpEl.querySelector("#cmpPlayB").addEventListener("click", function () { if (cmpB && window.BeatGenomeOnSelect) window.BeatGenomeOnSelect(cmpB); });
    cmpEl.querySelector("#cmpStop").addEventListener("click", function () { if (window.BeatGenomeAudio) window.BeatGenomeAudio.stop(); });
    cmpEl.querySelector("#cmpClose").addEventListener("click", function () { cmpEl.classList.remove("show"); });
    cmpEl.addEventListener("click", function (e) { if (e.target === cmpEl) cmpEl.classList.remove("show"); });
    upd();
  }
  function openCompare() { ensureCompare(); cmpEl.classList.add("show"); }
  var _cmpItems = null, _cmpTsA = null, _mrphItems = null, _mrphTsA = null;
  function _hubIdFor(n) {
    if (!n) return null;
    if (n.level === "Genre") return n.id;
    for (var k in adj[n.id]) { if (adj[n.id][k] === "child" && byId[k] && byId[k].level === "Genre") return k; }
    return null;
  }
  function openCompareWith(n) {
    openCompare();
    var gid = _hubIdFor(n);
    if (gid && _cmpItems && _cmpTsA) { for (var i = 0; i < _cmpItems.length; i++) { if (_cmpItems[i].id === gid) { _cmpTsA.set(i); break; } } }
  }
  var compareBtn = document.getElementById("compareBtn"); if (compareBtn) compareBtn.addEventListener("click", openCompare);
  // ---- V45: About Me overlay (replaces the Personal Library) ----
  var aboutEl = null;
  function ensureAbout() {
    if (aboutEl) return;
    aboutEl = document.createElement("div"); aboutEl.className = "overlay about"; aboutEl.id = "aboutOverlay"; aboutEl.setAttribute("role", "dialog");
    aboutEl.innerHTML = '<div class="aboutsheet"><div class="cmphead"><span>About Me</span><button class="x" id="aboutClose">✕ close</button></div>' +
      '<div class="aboutbody">' +
      '<div class="aboutpic"><div class="apic-frame"><img src="assets/about-me.jpg?v=101" alt="DJ7 - Wilsonlicioussss" onerror="this.parentNode.classList.add(\'empty\');this.remove()"></div><span class="aname">DJ7 · Wilsonlicioussss</span></div>' +
      '<div class="aboutsec"><h4>★ Things I Love</h4><p>Thoughtful spaces, quiet details, electronic music, new technology and ideas that feel slightly ahead of their time.</p></div>' +
      '<div class="aboutsec"><h4>Always Learning</h4><p>Everything begins with curiosity. I explore how design, data, people and culture connect.</p></div>' +
      '<div class="aboutsec"><h4>I DJ</h4><p>A personal journey through electronic music — from high-energy moments to deeper, melodic and atmospheric sounds.</p></div>' +
      '<div class="aboutsec"><h4>I Produce</h4><p>Exploring rhythm, emotion and the technology behind sound, while creating tools that make electronic music easier to understand.</p></div>' +
      '<div class="aboutsec"><h4>Currently Exploring</h4><p>The spaces I design, the tools I build, the music I listen to and the ideas currently occupying my mind.</p></div>' +
      '<div class="aboutsec"><h4>Come say hi</h4><div class="aboutlinks">' +
        '<a class="alink" href="https://www.instagram.com/wilsonlicioussss/" target="_blank" rel="noopener">Instagram ↗</a>' +
        '<a class="alink" href="https://harbingermsc.blogspot.com/" target="_blank" rel="noopener">Blog ↗</a>' +
      '</div></div>' +
      '</div></div>';
    document.body.appendChild(aboutEl);
    aboutEl.querySelector("#aboutClose").addEventListener("click", function () { aboutEl.classList.remove("show"); });
    aboutEl.addEventListener("click", function (e) { if (e.target === aboutEl) aboutEl.classList.remove("show"); });
  }
  function openAbout() { ensureAbout(); aboutEl.classList.add("show"); }
  var aboutBtn = document.getElementById("aboutBtn"); if (aboutBtn) aboutBtn.addEventListener("click", openAbout);
  // ---- V39: Genre Morph (blend two genres via interpolate; switches on the bar) ----
  var morphEl = null, morphA = null, morphB = null, morphT = 0.5, morphTimer = null;
  function applyMorph() {
    if (!morphEl || !morphA || !morphB || !window.BeatGenomeProfiles) return;
    var pa, pb, pm;
    try { pa = window.BeatGenomeProfiles.buildAudioProfile(morphA.d); pb = window.BeatGenomeProfiles.buildAudioProfile(morphB.d); pm = window.BeatGenomeProfiles.interpolate(pa, pb, morphT); } catch (e) { return; }
    var dom = morphT < 0.5 ? morphA.name : morphB.name;
    morphEl.querySelector("#mrphRead").innerHTML =
      '<div class="mrow"><span>Blend</span><b>' + Math.round((1 - morphT) * 100) + '% ' + esc(morphA.name) + ' / ' + Math.round(morphT * 100) + '% ' + esc(morphB.name) + '</b></div>' +
      '<div class="mrow"><span>BPM</span><b>' + Math.round(pm.bpm) + '</b></div>' +
      '<div class="mrow"><span>Patterns + key</span><b>' + esc(dom) + '</b></div>' +
      '<div class="mrow"><span>Energy</span><b>' + Math.round((pm.energy || 0) * 100) + '%</b></div>';
    if (morphTimer) clearTimeout(morphTimer);
    morphTimer = setTimeout(function () {
      var A = window.BeatGenomeAudio; if (!A) return;
      if (A.enabled) A.playGenre(pm); else A.initialize().then(function (ok) { if (ok) A.playGenre(pm); });
    }, 140);
  }
  function ensureMorph() {
    if (morphEl) return;
    morphEl = document.createElement("div"); morphEl.className = "overlay mrph"; morphEl.id = "morphOverlay"; morphEl.setAttribute("role", "dialog");
    morphEl.innerHTML = '<div class="mrphsheet"><div class="cmphead"><span>Genre Morph</span><div class="cmpplay"><button id="mrphStop">■ stop</button></div><button class="x" id="mrphClose">✕ close</button></div>' +
      '<div class="cmpsel" id="mrphSel"></div>' +
      '<div class="mrphslide"><span id="mrphLa">A</span><input type="range" id="mrphRange" min="0" max="100" value="50" aria-label="Morph blend"><span id="mrphLb">B</span></div>' +
      '<div class="mrphread" id="mrphRead"></div></div>';
    document.body.appendChild(morphEl);
    var genres = nodes.filter(function (n) { return n.level === "Genre"; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var items = genres.map(function (g) { return { id: g.id, name: g.name }; });
    var _mSel = morphEl.querySelector("#mrphSel"), rg = morphEl.querySelector("#mrphRange");
    function onAB() { morphEl.querySelector("#mrphLa").textContent = morphA ? morphA.name : "A"; morphEl.querySelector("#mrphLb").textContent = morphB ? morphB.name : "B"; applyMorph(); }
    var tsA = themedSelect(items, 0, function (id) { morphA = byId[id]; onAB(); }, "Genre A");
    var tsB = themedSelect(items, Math.min(1, items.length - 1), function (id) { morphB = byId[id]; onAB(); }, "Genre B");
    _mSel.appendChild(tsA.el); _mSel.appendChild(tsB.el);
    _mrphItems = items; _mrphTsA = tsA;
    function setAB() { morphA = byId[tsA.value]; morphB = byId[tsB.value]; onAB(); }
    rg.addEventListener("input", function () { morphT = (parseInt(rg.value, 10) || 0) / 100; applyMorph(); });
    morphEl.querySelector("#mrphStop").addEventListener("click", function () { if (window.BeatGenomeAudio) window.BeatGenomeAudio.stop(); });
    morphEl.querySelector("#mrphClose").addEventListener("click", function () { morphEl.classList.remove("show"); });
    morphEl.addEventListener("click", function (e) { if (e.target === morphEl) morphEl.classList.remove("show"); });
    setAB();
  }
  function openMorph() { ensureMorph(); morphEl.classList.add("show"); }
  function openMorphWith(n) {
    openMorph();
    var gid = _hubIdFor(n);
    if (gid && _mrphItems && _mrphTsA) { for (var i = 0; i < _mrphItems.length; i++) { if (_mrphItems[i].id === gid) { _mrphTsA.set(i); break; } } }
  }
  var morphBtn = document.getElementById("morphBtn"); if (morphBtn) morphBtn.addEventListener("click", openMorph);
  // ---- meta line ----
  document.getElementById("metaLine").textContent = "By [DJ7]-[AOC] //Wilsonlicioussss";

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
  buildTimeline();
  buildOrbit();
  buildMetro();
  if (viewMode === "dna") { fitDNA(); } else if (viewMode === "orbit") { fitOrbit(); } else if (viewMode === "metro") { fitMetro(); } else { cam.scale = (MX && MX.initialZoom) || 0.9; cam.x = 0; cam.y = 0; }
  // ---- V49: mobile shell - reset view, one-time touch hint, rotate advice, live layout updates ----
  (function () {
    var rb = document.createElement("button");
    rb.id = "resetView"; rb.className = "resetview"; rb.type = "button"; rb.textContent = "\u2316 FIT";
    rb.setAttribute("aria-label", "Reset view");
    rb.addEventListener("click", function () {
      if (viewMode === "dna") { fitDNA(); return; }
      if (viewMode === "orbit") { fitOrbit(); return; }
      if (viewMode === "metro") { fitMetro(); return; }
      var tz = (MX && MX.initialZoom) || 0.9, sx0 = cam.x, sy0 = cam.y, ss = cam.scale, t = 0;
      (function step() {
        t += 0.09; var e2 = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
        cam.x = sx0 * (1 - e2); cam.y = sy0 * (1 - e2); cam.scale = ss + (tz - ss) * e2;
        if (t < 1) requestAnimationFrame(step);
      })();
    });
    document.body.appendChild(rb);
    if (MX && MX.layoutMode.indexOf("phone") === 0 && !store("bg_hint49")) {
      var tst = document.createElement("div"); tst.className = "bg-toast";
      tst.innerHTML = "<b>Drag</b> to explore \u00B7 <b>Pinch</b> to zoom \u00B7 <b>Tap</b> a genre";
      document.body.appendChild(tst);
      var killT = function () { if (tst.parentNode) tst.parentNode.removeChild(tst); store("bg_hint49", "1"); };
      tst.addEventListener("click", killT); setTimeout(killT, 6000);
    }
    var rot = null;
    function rotCheck(m) {
      var need = m && m.layoutMode === "phone-landscape" && !window.__bgRotOk;
      if (need && !rot) {
        rot = document.createElement("div"); rot.className = "rotbar";
        rot.innerHTML = '<span>BeatGenome is optimised for portrait \u2014 rotate for the best experience.</span><button type="button">CONTINUE</button>';
        rot.querySelector("button").addEventListener("click", function () { window.__bgRotOk = true; rotCheck(MX); });
        document.body.appendChild(rot);
        setTimeout(function () { window.__bgRotOk = true; rotCheck(MX); }, 8000);
      } else if (!need && rot) { rot.parentNode.removeChild(rot); rot = null; }
    }
    rotCheck(MX);
    if (LM) LM.onChange(function (m) {
      MX = m; QUALITY = m.renderQuality; NODE_SCALE = m.nodeScale; LABEL_SCALE = m.typographyScale;
      DPR = Math.max(1, Math.min(2, m.pixelRatio || 1));
      resize(); sizePanelScope(); rotCheck(m);
    });
  })();
  requestAnimationFrame(frame);
  setTimeout(function () { document.getElementById("loading").classList.add("done"); }, Math.max(300, 900 - (performance.now() - loadStart)));

  // expose for quick console poking / tests
  // ---- V54: phone quick-actions folded into the one bottom dock (thumb zone) ----
  (function () {
    (function build() {
      var dock = document.getElementById("bgaudio");
      var player = dock && (dock.querySelector(".bga-player") || dock);
      if (!player) return void setTimeout(build, 120);
      if (player.querySelector(".dock-actions")) return;
      var nav = document.createElement("div");
      nav.className = "dock-actions"; nav.setAttribute("role", "group"); nav.setAttribute("aria-label", "Quick actions");
      nav.innerHTML =
        '<button type="button" class="dock-act" data-a="search" aria-label="Search genres">\u2315</button>' +
        '<button type="button" class="dock-act" data-a="moods" aria-label="Filter by mood">\u25A4</button>' +
        '<button type="button" class="dock-act" data-a="about" aria-label="About BeatGenome">\u039B\u03A9</button>';
      player.appendChild(nav);
      nav.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button"); if (!b) return;
        var a = b.dataset.a;
        if (a === "search") { try { searchIn.focus(); searchIn.select(); } catch (e2) {} }
        else if (a === "moods" && moodBar) { moodBar.hidden = !moodBar.hidden; if (moodBtn) moodBtn.setAttribute("aria-pressed", moodBar.hidden ? "false" : "true"); }
        else if (a === "about" && typeof openAbout === "function") { openAbout(); }
      });
    })();
  })();
  // ---- V58: detail panel as a floating, resizable window (pointer layouts) + slow auto-scroll on open ----
  function _isWindowMode() { return MX && (MX.layoutMode === "desktop" || MX.layoutMode === "tablet-landscape"); }
  var _autoRAF = 0;
  function stopAutoScroll() { if (_autoRAF) cancelAnimationFrame(_autoRAF); _autoRAF = 0; }
  function startAutoScroll() {
    stopAutoScroll();
    if (!_isWindowMode() || reduceMotion) return;          // phones/tablet-portrait use manual drag; respect reduced motion
    var body = document.getElementById("pBody"); if (!body) return;
    body.scrollTop = 0;
    var acc = 0, last = performance.now(), speed = 30;      // px/sec - unhurried reading pace
    _autoRAF = requestAnimationFrame(function step(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 1) { stopAutoScroll(); return; }
      acc += speed * dt; body.scrollTop = acc;
      _autoRAF = requestAnimationFrame(step);
    });
  }
  function placePanelWindow() {
    if (!_isWindowMode()) { panel.style.left = ""; panel.style.top = ""; panel.style.width = ""; panel.style.height = ""; return; }
    if (!panel.style.left) {                                 // first open: dock to the top-right; keep user placement after
      var w = parseInt(getComputedStyle(panel).width, 10) || 400;
      panel.style.left = Math.max(12, window.innerWidth - w - 24) + "px";
      panel.style.top = "78px";
    }
    var r = panel.getBoundingClientRect();
    if (r.left + r.width > window.innerWidth) panel.style.left = Math.max(12, window.innerWidth - r.width - 12) + "px";
    if (r.top < 60) panel.style.top = "60px";
  }
  (function () {
    var head = panel && panel.querySelector(".head"); if (!head) return;
    var body = document.getElementById("pBody");
    if (body) ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (ev) { body.addEventListener(ev, stopAutoScroll, { passive: true }); });
    var dg = null;
    head.addEventListener("pointerdown", function (e) {
      if (!_isWindowMode()) return;                          // window drag only on pointer layouts
      if (e.target.closest && e.target.closest("button")) return;
      var r = panel.getBoundingClientRect();
      dg = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { head.setPointerCapture(e.pointerId); } catch (e0) {}
      head.classList.add("dragging"); e.preventDefault();
    });
    head.addEventListener("pointermove", function (e) {
      if (!dg) return;
      var w = panel.offsetWidth, h = panel.offsetHeight;
      panel.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, e.clientX - dg.dx)) + "px";
      panel.style.top = Math.max(56, Math.min(window.innerHeight - 40, e.clientY - dg.dy)) + "px";
    });
    function endDrag() { dg = null; head.classList.remove("dragging"); }
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);
  })();
  // ---- V64: synthesized vinyl-scratch SFX driven by the CD spin velocity ----
  // (the iTunes preview is cross-origin so it can't be Web-Audio-processed; this is a
  //  turntable-style scratch whose pitch/volume follow how fast/which way you spin.)
  var _scAC = null, _scNoise = null, _scBP = null, _scGain = null, _scIdle = 0;
  function _scEnsure() {
    if (_scAC) return _scAC;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      _scAC = new AC();
      var len = Math.floor(_scAC.sampleRate * 2), buf = _scAC.createBuffer(1, len, _scAC.sampleRate), ch = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.2; } // brown-ish groove noise
      _scNoise = _scAC.createBufferSource(); _scNoise.buffer = buf; _scNoise.loop = true;
      _scBP = _scAC.createBiquadFilter(); _scBP.type = "bandpass"; _scBP.frequency.value = 1200; _scBP.Q.value = 1.3;
      _scGain = _scAC.createGain(); _scGain.gain.value = 0;
      _scNoise.connect(_scBP); _scBP.connect(_scGain); _scGain.connect(_scAC.destination);
      _scNoise.start(0);
    } catch (e) { _scAC = null; }
    return _scAC;
  }
  function scratchUpdate(vel) {                 // vel = signed angular delta of the spin
    var ac = _scEnsure(); if (!ac) return;
    if (ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
    var now = ac.currentTime, sp = Math.abs(vel);
    var mag = Math.min(1, 0.2 + sp * 2.8);                        // baseline 0.2 so even a slow drag hisses
    var rate = Math.max(0.2, Math.min(3.9, 1 + vel * 3.9));       // forward -> up, backward -> down
    try {
      _scGain.gain.setTargetAtTime(mag * 0.46, now, 0.012);       // louder / more present
      _scNoise.playbackRate.setTargetAtTime(rate, now, 0.012);
      _scBP.frequency.setTargetAtTime(650 + mag * 2400 + vel * 900, now, 0.018);
    } catch (e) {}
    clearTimeout(_scIdle); _scIdle = setTimeout(scratchStop, 95);  // fade out if the spin pauses
  }
  function scratchGrab() {                        // brief contact "chirp" the moment the disc is touched (cd selected)
    var ac = _scEnsure(); if (!ac) return;
    if (ac.state === "suspended") { try { ac.resume(); } catch (e) {} } // resume on the touch gesture (iOS-reliable)
    var now = ac.currentTime;
    try {
      _scNoise.playbackRate.setValueAtTime(0.75, now);
      _scBP.frequency.setValueAtTime(950, now);
      _scGain.gain.cancelScheduledValues(now);
      _scGain.gain.setValueAtTime(0.3, now);
      _scGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    } catch (e) {}
  }
  function scratchStop() {
    if (!_scAC || !_scGain) return;
    try { _scGain.gain.setTargetAtTime(0, _scAC.currentTime, 0.05); } catch (e) {}
  }
  // ============================================================
  // V99: FIND YOUR SOUND — genre flavour finder (10-question quiz)
  // ============================================================
  (function () {
    var fvBtn = document.getElementById("flavourBtn");
    if (!fvBtn) return;
    var RX = {
      org: /organic|acoustic|\blive\b|african|latin|percussion|conga|djembe|marimba|balafon|disco|funk|guitar|\bjazz\b|soul|handdrum|hand-drum|vinyl|analog|analogue|\bband\b|horn|\bsax\b|nylon|folk/i,
      syn: /synth|digital|distort|\bsaw\b|reese|\bfm\b|bitcrush|bit-crush|supersaw|hoover|\b303\b|acid|wobble|growl|neuro|subbass|sub-bass|riser|sidechain|preset|square|serum|virus/i,
      euphoric: /euphoric|uplift|anthem|hands|\bepic\b|emotional|melodic|soaring|festival|bright|\bjoy|ecstatic|trance|blissful|celebratory/i,
      dark: /\bdark|menacing|hypnotic|driving|brooding|industrial|moody|warehouse|dystop|sinister|\bcold\b|\braw\b|underground|rumbl|gritty|tunnel|peakhour/i,
      dreamy: /dreamy|lush|ethereal|ambient|spacious|melanchol|\bdeep\b|meditat|floaty|nostalg|\bwarm\b|cosmic|celestial|\bsoft\b|hazy|introspect/i,
      aggressive: /aggress|heavy|\bhard\b|banging|intense|militant|brutal|distort|peak-time|\bslam|relentless|pounding|ferocious|furious|angry/i,
      sexy: /sexy|groovy|bouncy|funky|disco|sultry|rolling|\bswing|shuffl|sensual|smooth|late-night|hips|slinky|seductive/i
    };
    function firstTok(s) { return (s || "").split(/[,;\/]| - /)[0].trim().toLowerCase(); }
    function vocalNum(s) { var t = (s || "").toLowerCase(); if (/med-high/.test(t)) return 0.75; if (/low-med/.test(t)) return 0.25; if (/high/.test(t)) return 1; if (/med/.test(t)) return 0.5; if (/low/.test(t)) return 0; return 0.5; }
    function keyNum(d) { var c = d.Camelot || "", A = (c.match(/\d+A/g) || []).length, B = (c.match(/\d+B/g) || []).length; if (A + B) return B / (A + B); var k = d["Common Keys"] || ""; if (/major/i.test(k) && !/minor/i.test(k)) return 1; if (/minor/i.test(k)) return 0; return 0.5; }
    function drumClass(d) { var t = (d["Drum Feel"] || "").toLowerCase(); if (!t) return "none"; if (/four/.test(t)) return "four"; if (/half/.test(t)) return "halftime"; if (/sync|break|2-step|dembow|bounce|broken|shuffl/.test(t)) return "broken"; if (/beatless|ambient/.test(t)) return "beatless"; return "other"; }
    function placeClass(d) { var t = firstTok(d["DJ Set Placement"]); if (/festival/.test(t)) return "festival"; if (/peak/.test(t)) return "peak"; if (/warm/.test(t)) return "warmup"; if (/after/.test(t)) return "afterhours"; if (/listen|chill|radio/.test(t)) return "listening"; return t ? "other" : "none"; }
    function feat(n) {
      var d = n.d, txt = (d["Sound Signature"] || "") + " " + (d["Sound Design / Instrumentation"] || "") + " " + (d["Drum Programming"] || "");
      var moodTxt = (d["Sound Signature"] || "") + " " + (d["Drop/Main Feel"] || "") + " " + (d["Intro Feel"] || "") + " " + (d["Breakdown Feel"] || "") + " " + n.name;
      var oh = (txt.match(RX.org) || []).length, sh = (txt.match(RX.syn) || []).length;
      var mood = {}; ["euphoric", "dark", "dreamy", "aggressive", "sexy"].forEach(function (m) { mood[m] = (moodTxt.match(RX[m]) || []).length; });
      var mmax = Math.max(1, mood.euphoric, mood.dark, mood.dreamy, mood.aggressive, mood.sexy);
      var pc = placeClass(d), e = +n.energy || 5;
      var hyp = 0.5; if (pc === "afterhours" || pc === "warmup" || pc === "listening") hyp += 0.3; if (pc === "peak" || pc === "festival") hyp -= 0.3; if (e <= 5) hyp += 0.12; if (e >= 8) hyp -= 0.12; hyp = Math.max(0, Math.min(1, hyp));
      var era = 0.5, et = ((d.Era || "") + " " + (d.Origin || "")).toLowerCase(); if (/19\d\d|classic|early|origin of|golden|retro|old-?school/.test(et)) era = 0.15; if (/20[12]\d|modern|current|contemporary|new-?school|recent/.test(et)) era = 0.85;
      return { e: e, bpm: (n.bpmMin && n.bpmMax) ? (n.bpmMin + n.bpmMax) / 2 : (n.bpm || 125), vocal: vocalNum(d["Vocal Density / Layerability"]), key: keyNum(d), drum: drumClass(d), org: (oh + sh) ? oh / (oh + sh) : 0.5, place: pc, hyp: hyp, era: era, mood: mood, mmax: mmax };
    }
    var pool = (window.__GENOME ? window.__GENOME.nodes : nodes).filter(function (n) { return n.d && n.energy != null; });
    pool.forEach(function (n) { n._fv = feat(n); });

    var Q = [
      { t: "How hard do you want it?", a: "energy", o: [["Chilled", 2, "#2FE6FF"], ["Groovy", 5, "#7CE88A"], ["Driving", 7, "#FFC24B"], ["Peak-time", 9, "#FF3D9A"], ["Extreme", 10, "#FF4D4D"]] },
      { t: "What tempo moves you?", a: "bpm", o: [["Slow · 60–110", 92, "#2FE6FF"], ["Groove · 118–124", 122, "#7CE88A"], ["Driving · 124–132", 128, "#FFC24B"], ["Fast · 134–150", 140, "#FF3D9A"], ["Rolling · 160–175", 170, "#FF4D4D"]] },
      { t: "Pick your vibe", a: "mood", o: [["Euphoric ↑", "euphoric", "#FFC24B"], ["Dark & hypnotic", "dark", "#8A63FF"], ["Dreamy & deep", "dreamy", "#2FE6FF"], ["Raw & aggressive", "aggressive", "#FF4D4D"], ["Sexy & groovy", "sexy", "#FF3D9A"]] },
      { t: "Vocals, or instrumental?", a: "vocal", o: [["Vocal-led", 1, "#FF3D9A"], ["Some hooks", 0.5, "#FFC24B"], ["Instrumental", 0, "#2FE6FF"]] },
      { t: "What rhythm feel?", a: "drum", o: [["Four-on-the-floor", "four", "#7CE88A"], ["Broken / syncopated", "broken", "#FFC24B"], ["Halftime / heavy", "halftime", "#8A63FF"], ["Doesn't matter", "any", "#9a9ab0"]] },
      { t: "Sound palette?", a: "org", o: [["Organic / live", 1, "#7CE88A"], ["A bit of both", 0.5, "#FFC24B"], ["Synthetic / digital", 0, "#FF3D9A"]] },
      { t: "Where do you hear it?", a: "setting", o: [["Festival mainstage", "festival", "#FFC24B"], ["Underground warehouse", "peak", "#FF3D9A"], ["Sunset / beach", "warmup", "#7CE88A"], ["Afterhours", "afterhours", "#8A63FF"], ["Home / headphones", "listening", "#2FE6FF"]] },
      { t: "Bright or moody?", a: "key", o: [["Bright / major", 1, "#FFC24B"], ["Moody / minor", 0, "#8A63FF"], ["Either", 0.5, "#9a9ab0"]] },
      { t: "Steady or dynamic?", a: "hyp", o: [["Hypnotic & steady", 1, "#8A63FF"], ["A balance", 0.5, "#FFC24B"], ["Big builds & drops", 0, "#FF3D9A"]] },
      { t: "Sound era?", a: "era", o: [["Timeless classics", 0.15, "#7CE88A"], ["Modern & current", 0.85, "#2FE6FF"], ["Don't care", "any", "#9a9ab0"]] }
    ];

    var W = { energy: 1.4, bpm: 1.2, mood: 1.3, vocal: 1.0, drum: 0.8, org: 1.0, setting: 1.0, key: 0.7, hyp: 0.9, era: 0.5 };
    function relPlace(g, a) { if (g === a) return 1; if ((g === "festival" && a === "peak") || (g === "peak" && a === "festival")) return 0.6; if ((g === "warmup" && a === "listening") || (g === "listening" && a === "warmup")) return 0.55; if (g === "none") return 0.5; return 0.2; }
    function scoreNode(f, A) {
      var s = {};
      s.energy = 1 - Math.abs(f.e - A.energy) / 9;
      s.bpm = 1 - Math.min(Math.abs(f.bpm - A.bpm), 70) / 70;
      s.mood = f.mmax ? (f.mood[A.mood] / f.mmax) : 0.4; if (!f.mood[A.mood]) s.mood = f.mmax > 1 ? 0.12 : 0.4;
      s.vocal = 1 - Math.abs(f.vocal - A.vocal);
      s.drum = A.drum === "any" ? 1 : (f.drum === "none" ? 0.5 : (f.drum === A.drum ? 1 : 0.18));
      s.org = 1 - Math.abs(f.org - A.org);
      s.setting = relPlace(f.place, A.setting);
      s.key = A.key === 0.5 ? 1 : 1 - Math.abs(f.key - A.key);
      s.hyp = 1 - Math.abs(f.hyp - A.hyp);
      s.era = A.era === "any" ? 1 : 1 - Math.abs(f.era - A.era);
      var tot = 0, wt = 0, contrib = [];
      for (var k in W) { tot += s[k] * W[k]; wt += W[k]; contrib.push([k, s[k] * W[k]]); }
      contrib.sort(function (a, b) { return b[1] - a[1]; });
      return { pct: Math.round(tot / wt * 100), why: contrib };
    }
    function whyPhrase(n, axis, A) {
      var f = n._fv;
      if (axis === "energy") return f.e >= 8 ? "peak energy" : f.e >= 6 ? "driving energy" : f.e >= 4 ? "groovy energy" : "chilled energy";
      if (axis === "bpm") return Math.round(f.bpm) + " BPM";
      if (axis === "mood") return A.mood + " mood";
      if (axis === "vocal") return f.vocal >= 0.75 ? "vocal-led" : f.vocal <= 0.25 ? "instrumental" : "some vocals";
      if (axis === "drum") return f.drum === "four" ? "four-on-the-floor" : f.drum === "halftime" ? "halftime" : f.drum === "broken" ? "syncopated" : "its groove";
      if (axis === "org") return f.org >= 0.6 ? "organic feel" : f.org <= 0.4 ? "synthetic feel" : "hybrid feel";
      if (axis === "setting") return f.place !== "none" ? f.place + " placement" : "its setting";
      if (axis === "key") return f.key >= 0.6 ? "bright/major" : f.key <= 0.4 ? "moody/minor" : "its key";
      if (axis === "hyp") return f.hyp >= 0.6 ? "hypnotic & steady" : f.hyp <= 0.4 ? "big builds" : "balanced flow";
      if (axis === "era") return f.era >= 0.6 ? "modern" : "classic";
      return axis;
    }
    var NOUN = { euphoric: "Festival Heart", dark: "Underground Soul", dreamy: "Deep Diver", aggressive: "Hard Head", sexy: "Groove Cat" };
    var MADJ = { euphoric: "Euphoric", dark: "Dark", dreamy: "Dreamy", aggressive: "Raw", sexy: "Sultry" };
    function flavourName(A) { var e = A.energy, ea = e <= 3 ? "mellow" : e <= 5 ? "groovy" : e <= 7 ? "driving" : "high-octane"; return { adj: MADJ[A.mood] + ", " + ea, noun: NOUN[A.mood] || "Selector" }; }
    function artistsOf(n) { var a = n.d["Representative Artists"]; if (a && a.trim()) return a.split(/[,;]/).slice(0, 3).map(function (x) { return x.trim(); }).join(", "); var t = [n.d["Top Track 1"], n.d["Top Track 2"]].filter(Boolean).join(" · "); return t || ""; }

    // ---- radar ----
    function radar(A) {
      var axes = [["Energy", A.energy / 10], ["Tempo", Math.max(0, Math.min(1, (A.bpm - 80) / 95))], ["Vocals", A.vocal], ["Bright", A.key === 0.5 ? 0.5 : A.key], ["Organic", A.org], ["Steady", A.hyp]];
      var cx = 130, cy = 118, R = 84, N = axes.length, s = '<svg viewBox="0 0 260 240" width="100%" style="max-width:260px;display:block;margin:0 auto" aria-hidden="true">';
      function pt(i, r) { var a = -Math.PI / 2 + i / N * 2 * Math.PI; return [(cx + r * Math.cos(a)).toFixed(1), (cy + r * Math.sin(a)).toFixed(1)]; }
      [0.25, 0.5, 0.75, 1].forEach(function (g) { var d = ""; for (var i = 0; i < N; i++) { var p = pt(i, R * g); d += (i ? "L" : "M") + p[0] + " " + p[1] + " "; } s += '<path d="' + d + 'Z" fill="none" stroke="rgba(255,255,255,0.07)"/>'; });
      for (var i = 0; i < N; i++) { var e = pt(i, R); s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="rgba(255,255,255,0.08)"/>'; var l = pt(i, R + 16); s += '<text x="' + l[0] + '" y="' + (+l[1] + 3) + '" fill="rgba(236,236,244,0.6)" font-family="Space Mono,monospace" font-size="8.5" text-anchor="middle">' + axes[i][0] + '</text>'; }
      var d = ""; for (i = 0; i < N; i++) { var p = pt(i, R * Math.max(0.05, axes[i][1])); d += (i ? "L" : "M") + p[0] + " " + p[1] + " "; }
      s += '<path d="' + d + 'Z" fill="rgba(255,61,154,0.18)" stroke="#FF3D9A" stroke-width="2"/>';
      for (i = 0; i < N; i++) { var p2 = pt(i, R * Math.max(0.05, axes[i][1])); s += '<circle cx="' + p2[0] + '" cy="' + p2[1] + '" r="3" fill="#FF3D9A"/>'; }
      return s + "</svg>";
    }

    // ---- overlay ----
    var ov = document.createElement("div"); ov.className = "overlay flav"; ov.id = "flavOverlay"; ov.setAttribute("role", "dialog");
    ov.innerHTML = '<div class="sheet flavsheet"><button class="fv-x" aria-label="Close">✕ close</button><div id="fvBody"></div></div>';
    document.body.appendChild(ov);
    var body = ov.querySelector("#fvBody"), sheet = ov.querySelector(".flavsheet");
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".fv-x").addEventListener("click", close);
    function close() { ov.classList.remove("show"); }
    function open() { A = {}; qi = 0; sheet.style.setProperty("--fv", "#FF3D9A"); renderIntro(); ov.classList.add("show"); }
    fvBtn.addEventListener("click", open);

    var A = {}, qi = 0;
    function renderIntro() {
      body.innerHTML = '<div class="fv-intro"><div class="fv-kick">BeatGenome</div><h2 class="fv-title">Find Your Sound</h2>' +
        '<p class="fv-sub">Ten quick taps. We read your flavour against ' + pool.length + ' genres and hand you your top matches.</p>' +
        '<button class="fv-start">START ▸</button><p class="fv-note">A discovery tool, not a science — trust your ears over the %.</p></div>';
      body.querySelector(".fv-start").addEventListener("click", function () { qi = 0; renderQ(); });
    }
    function renderQ() {
      var q = Q[qi];
      var h = '<div class="fv-prog"><i style="width:' + ((qi) / Q.length * 100) + '%"></i></div><div class="fv-qn">' + (qi + 1) + ' / ' + Q.length + '</div>';
      h += '<h3 class="fv-q">' + q.t + '</h3><div class="fv-opts">';
      q.o.forEach(function (o, idx) { h += '<button class="fv-opt" data-i="' + idx + '" style="--oc:' + o[2] + '"><span class="fv-dot"></span>' + o[0] + '</button>'; });
      h += '</div>' + (qi > 0 ? '<button class="fv-back">‹ back</button>' : '');
      body.innerHTML = h;
      body.parentNode.scrollTop = 0;
      Array.prototype.forEach.call(body.querySelectorAll(".fv-opt"), function (b) {
        b.addEventListener("click", function () { var o = q.o[+b.getAttribute("data-i")]; A[q.a] = o[1]; sheet.style.setProperty("--fv", o[2]); qi++; if (qi >= Q.length) renderResult(); else renderQ(); });
      });
      var bk = body.querySelector(".fv-back"); if (bk) bk.addEventListener("click", function () { qi--; renderQ(); });
    }
    var lastTop = [];
    function renderResult() {
      var ranked = pool.map(function (n) { var r = scoreNode(n._fv, A); return { n: n, pct: r.pct, why: r.why }; }).sort(function (a, b) { return b.pct - a.pct; });
      lastTop = ranked.slice(0, 5);
      var fn = flavourName(A);
      var h = '<div class="fv-prog"><i style="width:100%"></i></div><div class="fv-res">';
      h += '<div class="fv-kick">Your flavour</div><h2 class="fv-flav">' + fn.adj + '</h2><div class="fv-noun">you\'re a ' + fn.noun + '</div>';
      h += radar(A);
      h += '<div class="fv-topttl">Your top 5 genres</div>';
      lastTop.forEach(function (r, i) {
        var a = whyPhrase(r.n, r.why[0][0], A), b = whyPhrase(r.n, r.why[1][0], A);
        var art = artistsOf(r.n);
        h += '<div class="fv-match" data-id="' + r.n.id + '"><div class="fv-rank">' + (i + 1) + '</div><div class="fv-mbody"><div class="fv-mtop"><b>' + r.n.name + '</b><span class="fv-pct">' + r.pct + '%</span></div><div class="fv-why">' + a + ' · ' + b + '</div>' + (art ? '<div class="fv-art">' + art + '</div>' : '') + '</div><button class="fv-goto" title="Show on the map">▸</button></div>';
      });
      h += '<div class="fv-actions"><button class="fv-share">◇ SHARE CARD</button><button class="fv-retake">↺ RETAKE</button></div></div>';
      body.innerHTML = h;
      body.parentNode.scrollTop = 0;
      Array.prototype.forEach.call(body.querySelectorAll(".fv-match"), function (el) {
        el.querySelector(".fv-goto").addEventListener("click", function () { gotoNode(el.getAttribute("data-id")); });
      });
      body.querySelector(".fv-retake").addEventListener("click", function () { A = {}; qi = 0; renderIntro(); });
      body.querySelector(".fv-share").addEventListener("click", function () { shareCard(fn); });
    }
    function gotoNode(id) {
      var n = (window.__GENOME && window.__GENOME.byId) ? window.__GENOME.byId[id] : byId[id];
      if (!n) return; close();
      try { select(n); } catch (e) {}
      try { centerOn(n); } catch (e) {}
    }

    // ---- shareable AOC card (canvas -> PNG) ----
    function shareCard(fn) {
      var W2 = 1080, H2 = 1350, cv = document.createElement("canvas"); cv.width = W2; cv.height = H2; var g = cv.getContext("2d");
      g.fillStyle = "#08080F"; g.fillRect(0, 0, W2, H2);
      var grd = g.createLinearGradient(0, 0, W2, H2); grd.addColorStop(0, "rgba(255,61,154,0.14)"); grd.addColorStop(1, "rgba(138,99,255,0.05)"); g.fillStyle = grd; g.fillRect(0, 0, W2, H2);
      g.textAlign = "center";
      g.fillStyle = "#9a9ab0"; g.font = "600 30px 'Space Mono', monospace"; g.fillText("BEATGENOME · ΛΩ COLLECTIVE", W2 / 2, 120);
      g.fillStyle = "#ECECF4"; g.font = "700 40px 'Space Mono', monospace"; g.fillText("FIND YOUR SOUND", W2 / 2, 185);
      var lg = g.createLinearGradient(120, 0, 960, 0); lg.addColorStop(0, "#FF3D9A"); lg.addColorStop(1, "#8A63FF");
      g.fillStyle = lg; g.font = "800 96px 'Archivo','Space Grotesk',sans-serif"; g.fillText(fn.adj.toUpperCase(), W2 / 2, 330);
      g.fillStyle = "#C6F000"; g.font = "700 44px 'Space Mono', monospace"; g.fillText("you're a " + fn.noun, W2 / 2, 400);
      g.textAlign = "left"; var y = 560;
      g.fillStyle = "#9a9ab0"; g.font = "700 30px 'Space Mono', monospace"; g.fillText("YOUR TOP MATCHES", 120, y - 40);
      lastTop.slice(0, 5).forEach(function (r, i) {
        g.fillStyle = i === 0 ? "#FF3D9A" : "rgba(255,255,255,0.06)"; g.fillRect(120, y - 42, 840, 78); g.strokeStyle = "rgba(255,255,255,0.1)"; g.strokeRect(120, y - 42, 840, 78);
        g.fillStyle = i === 0 ? "#08080F" : "#ECECF4"; g.font = "700 40px 'Archivo','Space Grotesk',sans-serif"; g.fillText((i + 1) + ".  " + r.n.name, 150, y + 10);
        g.textAlign = "right"; g.fillStyle = i === 0 ? "#08080F" : "#C6F000"; g.font = "700 40px 'Space Mono', monospace"; g.fillText(r.pct + "%", 940, y + 10); g.textAlign = "left";
        y += 100;
      });
      g.textAlign = "center"; g.fillStyle = "#6f6f86"; g.font = "500 28px 'Space Mono', monospace"; g.fillText("wilsonliciousssssss.github.io/beatgenome", W2 / 2, H2 - 70);
      try {
        var url = cv.toDataURL("image/png"); var a = document.createElement("a"); a.href = url; a.download = "beatgenome-flavour.png"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (e) { alert("Card generated — long-press / right-click to save."); }
    }
  })();


  // ---- V100: attract-animation calm-on-engagement ----
  (function () {
    var ctas = ["flavourBtn", "guidesBtn", "compareBtn"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var mb = document.getElementById("menuBtn");
    function calmAll() { ctas.forEach(function (e) { e.classList.remove("attract"); }); if (mb) mb.classList.remove("attract"); }
    ctas.forEach(function (e) { e.addEventListener("click", calmAll); });
    if (mb) mb.addEventListener("click", function () { mb.classList.remove("attract"); });
    setTimeout(calmAll, 45000);
  })();
  window.__GENOME = { nodes: nodes, links: links, byId: byId, select: select, centerOn: centerOn, version: "V101" };
})();
