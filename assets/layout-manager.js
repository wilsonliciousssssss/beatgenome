/* ============================================================
   BeatGenome — layout-manager.js (V49)
   Central Layout & Scale Manager (spec 11_SCREEN_SCALE_MANAGER).
   One source of truth for responsive class, layout mode and the
   separate UI / graph / node / type / hit / panel / spacing /
   animation scales. No device-brand detection — capability only.
   ============================================================ */
(function (root) {
  "use strict";
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  // scale matrix per responsive class (spec starting framework)
  var MATRIX = {
    "compact-phone":  { ui: 0.82, graph: 0.72, node: 0.90, type: 0.86, hit: 1.40, panel: 0.90, spacing: 0.80, anim: 0.65 },
    "standard-phone": { ui: 0.86, graph: 0.76, node: 0.92, type: 0.88, hit: 1.38, panel: 0.92, spacing: 0.84, anim: 0.70 },
    "large-phone":    { ui: 0.89, graph: 0.80, node: 0.94, type: 0.90, hit: 1.35, panel: 0.94, spacing: 0.88, anim: 0.72 },
    "compact-tablet": { ui: 0.93, graph: 0.85, node: 0.96, type: 0.94, hit: 1.25, panel: 0.96, spacing: 0.92, anim: 0.80 },
    "standard-tablet":{ ui: 0.97, graph: 0.91, node: 0.98, type: 0.97, hit: 1.18, panel: 0.98, spacing: 0.96, anim: 0.88 },
    "large-tablet":   { ui: 1.00, graph: 0.96, node: 1.00, type: 1.00, hit: 1.12, panel: 1.00, spacing: 1.00, anim: 0.94 },
    "desktop":        { ui: 1.00, graph: 1.00, node: 1.00, type: 1.00, hit: 1.00, panel: 1.00, spacing: 1.00, anim: 1.00 }
  };
  // device-appropriate initial zoom for the graph (spec 03 §7)
  var INIT_ZOOM = {
    "phone-portrait": 0.62, "phone-landscape": 0.60,
    "tablet-portrait": 0.74, "tablet-landscape": 0.82,
    "desktop": 0.90
  };

  function classify(w) {
    if (w <= 375) return "compact-phone";
    if (w <= 430) return "standard-phone";
    if (w <= 599) return "large-phone";
    if (w <= 767) return "compact-tablet";
    if (w <= 899) return "standard-tablet";
    if (w <= 1199) return "large-tablet";
    return "desktop";
  }

  function compute() {
    var w = window.innerWidth, h = window.innerHeight;
    var coarse = false, hoverNone = false, reduced = false;
    try {
      coarse = matchMedia("(pointer: coarse)").matches;
      hoverNone = matchMedia("(hover: none)").matches;
      reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}
    var touchPoints = navigator.maxTouchPoints || 0;
    var isTouch = coarse || hoverNone || touchPoints > 0;
    var portrait = h >= w;
    var cls = classify(w);
    // phone landscape must NOT be misclassified as tablet (spec 11 §3):
    // wide-but-short touch viewports are phones on their side.
    var phoneClass = /phone/.test(cls);
    var layoutMode;
    if (!isTouch && w >= 1200) layoutMode = "desktop";
    else if (phoneClass) layoutMode = portrait ? "phone-portrait" : "phone-landscape";
    else if (isTouch && !portrait && h < 520 && Math.min(w, h) < 600) { layoutMode = "phone-landscape"; cls = "large-phone"; }
    else if (/tablet/.test(cls)) layoutMode = portrait ? "tablet-portrait" : "tablet-landscape";
    else layoutMode = "desktop";
    var m0 = MATRIX[cls] || MATRIX.desktop;
    var shortV = h < 700, veryShort = h < 520;
    var spacing = m0.spacing * (veryShort ? 0.82 : shortV ? 0.92 : 1);
    var panel = m0.panel * (veryShort ? 0.88 : shortV ? 0.95 : 1);
    var anim = reduced ? 0 : m0.anim * (veryShort ? 0.8 : 1);
    // render quality: capability first, FPS sampling may downgrade later
    var mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
    var quality = (mem <= 2 || cores <= 3) ? "reduced" : (isTouch ? "balanced" : "high");
    var density = /phone/.test(layoutMode) ? "low" : /tablet/.test(layoutMode) ? "medium" : "high";
    return {
      responsiveClass: cls,
      layoutMode: layoutMode,
      isTouch: isTouch,
      coarsePointer: coarse,
      reducedMotion: reduced,
      shortViewport: shortV,
      uiScale: m0.ui,
      graphScale: m0.graph,
      nodeScale: m0.node,
      typographyScale: m0.type,
      hitAreaScale: m0.hit,
      panelScale: panel,
      spacingScale: spacing,
      animationScale: anim,
      labelDensity: density,
      renderQuality: quality,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      initialZoom: INIT_ZOOM[layoutMode] || 0.9,
      width: w, height: h
    };
  }

  function applyCSS(m) {
    var r = document.documentElement;
    r.style.setProperty("--ui-scale", m.uiScale);
    r.style.setProperty("--type-scale", m.typographyScale);
    r.style.setProperty("--panel-scale", m.panelScale);
    r.style.setProperty("--spacing-scale", m.spacingScale);
    r.style.setProperty("--hit-scale", m.hitAreaScale);
    r.style.setProperty("--anim-scale", m.animationScale);
    r.setAttribute("data-layout", m.layoutMode);
    r.setAttribute("data-class", m.responsiveClass);
    r.setAttribute("data-touch", m.isTouch ? "1" : "0");
  }

  var current = compute();
  applyCSS(current);
  var subs = [], deb = 0;
  function refresh() {
    var next = compute();
    // preserve a runtime FPS downgrade: never upgrade quality on mere resize
    if (current && current.renderQuality === "reduced") next.renderQuality = "reduced";
    current = next;
    applyCSS(current);
    for (var i = 0; i < subs.length; i++) { try { subs[i](current); } catch (e) {} }
  }
  function queue() { clearTimeout(deb); deb = setTimeout(refresh, 150); } // debounced (spec 03 §10)
  window.addEventListener("resize", queue);
  window.addEventListener("orientationchange", queue);
  try { matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", queue); } catch (e) {}

  root.BeatGenomeLayout = {
    metrics: function () { return current; },
    onChange: function (cb) { if (typeof cb === "function") subs.push(cb); },
    degrade: function () { if (current.renderQuality !== "reduced") { current.renderQuality = "reduced"; applyCSS(current); } }
  };
})(typeof window !== "undefined" ? window : this);
