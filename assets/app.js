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
      link.href = "assets/icons/favicon-" + col + "-48.png?v=66";
      document.head.appendChild(link);
    } catch (e) {}
    try {
      var badge = document.querySelector(".badge");
      if (badge) badge.style.backgroundImage = 'url("assets/icons/product-' + col + '-216.png?v=66")';
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
      var nd = nodes[i], r0 = radius(nd);
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
  var viewMode = (store("edm_view") === "dna") ? "dna" : "graph";
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
      gx.strokeStyle = "rgba(198,240,0,0.5)"; gx.lineWidth = 9.6 / cam.scale; gx.stroke();
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
      var r = radius(m) * 1.12 * (1 + 0.22 * mthump);
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
      var r = radius(n) * 1.25 * sc * (1 + 0.22 * nthump);
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
      var dx = n._dx - w.x, dy = n._dy - w.y, d = dx * dx + dy * dy, rr = radius(n) * 1.4 + 8 / cam.scale;
      if (d < rr * rr && d < bd) { bd = d; best = n; }
    }
    return best;
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
      drawMorph(_e, trans.toDNA);
      document.documentElement.style.setProperty("--glitch", (Math.sin(_tt * Math.PI) * 0.5).toFixed(3));
      if (_tt >= 1) { var _wasG = trans.toMode === "graph"; viewMode = trans.toMode; hover = null; trans = null; if (_wasG) reheat(0.6); }
    } else if (viewMode === "dna") { drawDNA(); } else { if (!(QUALITY === "reduced" && alpha <= 0.07 && (_fN % 2))) tick(); draw(); }
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
    var vis = radius(n);
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
        var lpN = viewMode === "dna" ? nodeAtDNA(downX, downY) : nodeAt(downX, downY);
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
    if (viewMode === "dna") { dnaPending = nodeAtDNA(e.clientX, e.clientY); dragging = true; graph.classList.add("grabbing"); return; }
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
    if (viewMode === "dna") {
      if (dragging) { cam.x -= (e.clientX - last.x) / cam.scale; cam.y -= (e.clientY - last.y) / cam.scale; last = { x: e.clientX, y: e.clientY }; interactingUntil = performance.now() + 350; if (movedFar(e)) { moved = true; dnaPending = null; clearTimeout(lpTimer); } }
      else { var hd = nodeAtDNA(e.clientX, e.clientY); if (hd !== hover) { hover = hd; graph.style.cursor = hd ? "pointer" : "grab"; } }
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
    if (viewMode === "dna") { if (dnaPending && !moved) select(dnaPending); dnaPending = null; dragging = false; graph.classList.remove("grabbing"); return; }
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
                cd.classList.add("scrubbing"); ev.preventDefault();
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
  function updViewBtn() { if (!viewBtn) return; viewBtn.textContent = viewMode === "dna" ? "⋉ GRAPH" : "◇ DNA"; viewBtn.setAttribute("aria-pressed", viewMode === "dna" ? "true" : "false"); }
  if (viewBtn) {
    updViewBtn();
    viewBtn.addEventListener("click", function () {
      var toMode = viewMode === "dna" ? "graph" : "dna";
      store("edm_view", toMode);
      viewBtn.textContent = toMode === "dna" ? "⋉ GRAPH" : "◇ DNA"; viewBtn.setAttribute("aria-pressed", toMode === "dna" ? "true" : "false");
      startViewTransition(toMode);
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
    else { matchSet = {}; var any = false; for (var k = 0; k < nodes.length; k++) { if (nodeHasMood(nodes[k], activeMood)) { matchSet[nodes[k].id] = 1; any = true; } } if (!any) matchSet = null; }
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
      '<div class="aboutpic"><div class="apic-frame"><img src="assets/about-me.jpg?v=66" alt="DJ7 - Wilsonlicioussss" onerror="this.parentNode.classList.add(\'empty\');this.remove()"></div><span class="aname">DJ7 · Wilsonlicioussss</span></div>' +
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
  if (viewMode === "dna") { fitDNA(); } else { cam.scale = (MX && MX.initialZoom) || 0.9; cam.x = 0; cam.y = 0; }
  // ---- V49: mobile shell - reset view, one-time touch hint, rotate advice, live layout updates ----
  (function () {
    var rb = document.createElement("button");
    rb.id = "resetView"; rb.className = "resetview"; rb.type = "button"; rb.textContent = "\u2316 FIT";
    rb.setAttribute("aria-label", "Reset view");
    rb.addEventListener("click", function () {
      if (viewMode === "dna") { fitDNA(); return; }
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
    var now = ac.currentTime, mag = Math.min(1, Math.abs(vel) * 2.4);
    var rate = Math.max(0.25, Math.min(3.6, 1 + vel * 3.6));       // forward -> up, backward -> down
    try {
      _scGain.gain.setTargetAtTime(mag * 0.32, now, 0.015);
      _scNoise.playbackRate.setTargetAtTime(rate, now, 0.015);
      _scBP.frequency.setTargetAtTime(700 + mag * 2100 + vel * 700, now, 0.02);
    } catch (e) {}
    clearTimeout(_scIdle); _scIdle = setTimeout(scratchStop, 80);  // fade out if the spin pauses
  }
  function scratchStop() {
    if (!_scAC || !_scGain) return;
    try { _scGain.gain.setTargetAtTime(0, _scAC.currentTime, 0.05); } catch (e) {}
  }
  window.__GENOME = { nodes: nodes, links: links, byId: byId, select: select, version: "V66" };
})();
