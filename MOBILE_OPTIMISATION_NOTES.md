# Mobile & Tablet Optimisation — Implementation Notes (V49)

Implements `BeatGenome_Mobile_Tablet_Optimisation_Package_02`. The graph remains the product;
nothing was replaced with lists or cards; desktop behaviour is preserved (all scale variables = 1 on desktop).

## Baseline audit (BG-MOB-001, before changes)

- DPR already capped at 2; resize preserved camera/selection; no debounced metrics.
- Initial zoom was a fixed 0.9 on every device.
- Labels: hubs > 0.5 zoom, everything > 1.7 — no density modes, no pan suppression.
- Hit test: radius + 6px, not touch-aware. No overlap chooser, no long-press, no double-tap.
- V46 already shipped: pinch-zoom/two-finger pan, phone bottom-sheet panel, 44px coarse-pointer
  targets, safe-area insets, compact header, ⋯ menu, full-width bottom modals.
- Viewport meta blocked browser zoom (user-scalable=no) — spec violation, now removed.
- Tests 11/11 (data) + 11/11 (audio profiles) green before and after.

## What V49 adds (ticket map)

- **BG-MOB-002/017** `assets/layout-manager.js` — central Layout & Scale Manager. 7 capability-based
  responsive classes, layoutMode (phone-portrait/phone-landscape/tablet-portrait/tablet-landscape/desktop),
  separate ui/graph/node/type/hit/panel/spacing/animation scales (spec matrix), short-height adjustment,
  label density, render quality, DPR cap, per-device initial zoom, CSS vars (`--ui-scale`…), `data-layout`/
  `data-class`/`data-touch` attributes, debounced (150 ms) resize/orientation recalc, `degrade()` hook.
  Phone landscape is explicitly never classified as tablet.
- **BG-MOB-003** viewport meta no longer blocks browser zoom; dvh used for sheet heights; state
  (camera, selection, mode) survives resize/orientation — metrics update without re-layout.
- **BG-MOB-004** initial zoom per device (0.62 phone portrait → 0.90 desktop); node radius × nodeScale;
  base link width floored via graphScale.
- **BG-MOB-005** adaptive label density (low/medium/high per device): hubs at >0.5 zoom, full labels at
  2.2/1.9/1.7 by density; labels suppressed while panning/pinching (350 ms settle); selected/hovered always
  labelled; font floor 10 px, hubs 12 px, selected 13 px (× typography scale).
- **BG-MOB-006** bottom sheet is now draggable: peek (52dvh) ⇄ tall (88dvh) by dragging the head; drag down
  from peek closes. One-time phone hint ("Drag · Pinch · Tap", localStorage). Phone search closes the
  keyboard on selection.
- **BG-MOB-007** non-blocking phone-landscape advisory bar with CONTINUE (session-scoped), never shown on tablets.
- **BG-MOB-008** tablet portrait: panel becomes a lower sheet (graph keeps ~60%), draggable like the phone sheet.
- **BG-MOB-009** tablet landscape: existing right panel retained (graph stays interactive beside it; camera
  already centres the selected node via `centerOn`).
- **BG-MOB-010** 8 px tap-vs-drag threshold; 550 ms long-press quick actions (▶ PLAY / ⇄ COMPARE / ◈ MORPH,
  presets genre A via a new themedSelect setter; subgenres map to their parent hub); double-tap zooms ×1.6
  toward the tap; pinch/drag cancel taps and long-presses; pointercancel handled.
- **BG-MOB-011** touch hit radius = max(visual + 10 px, 22 px) without visual enlargement; when several nodes
  share the touch zone a "Select genre" chooser lists the nearest 5.
- **BG-MOB-012** focus mode ALL | FAMILY | RELATED (chips in the panel head): non-relevant nodes fade to 0.18,
  links two-pass fade, positions untouched, physics untouched; phone defaults to RELATED on selection until
  the user picks a mode; exits instantly via ALL.
- **BG-MOB-013** phone search: header input flexes full-width (V46); selection blurs the keyboard and
  returns to the graph. (Dedicated overlay with recents deemed unnecessary — noted as a limitation.)
- **BG-MOB-014** render quality high/balanced/reduced from cores/memory/pointer; live FPS sampling downgrades
  to reduced below ~28 FPS; reduced mode kills node glow (shadowBlur), halves settled simulation rate, caps
  ripples at 3; hidden tab idles the render loop (300 ms polls).
- **BG-MOB-015** browser zoom unblocked; :focus-visible outlines on primary controls; reduced-motion already
  respected (V44) and now also zeroes the animation scale; 44 px+ coarse targets (V46).

## Decisions

- Phone "bottom navigation" (spec 04 layer 2): the existing full-width player dock + header search + ⋯ menu
  already provide PLAY/SEARCH/menu; adding a fourth bar would crowd a 360 px screen. Kept the existing trio.
- Focus chips live in the panel head — present in the phone sheet, tablet sheet and desktop panel alike.
- Compare/Morph long-press presets map subgenres to their parent genre (Compare/Morph lists are hub-level).

## Known limitations (spec-honest)

- **No live device testing** — everything is code-verified only (no Chrome/device farm in this environment).
  The QA checklist device matrix (360×800 … 1280×800) still needs a human pass.
- Search has no recents/suggestions overlay; audio engine polyphony/reverb untouched on mobile (Tone.js
  defaults); inertia panning not implemented (optional in spec); haptics only on long-press where supported.
- Focus chips remain visible in DNA view though focus fade applies to the graph view only.

## QA checklist status

Code-verified: desktop regression (scales=1, no behaviour change paths), scaling, touch gesture logic,
focus mode, perf gating, safe areas, accessibility hooks. Needs device pass: real FPS, gesture feel,
keyboard/screen-reader sweep, the seven target viewport sizes.
