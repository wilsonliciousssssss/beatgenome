# Changelog

## V16 — 2026-07-16
Legend gets out of the way · panel clears the footer · Collective polish.

- **Legend adjusts** — when the info panel opens, the family legend slides left out from under it; the legend, credit and hint now hug the top of the bottom dock and shift as it grows/shrinks.
- **Panel clears the footer** — the detail panel stops above the audio player + tracks bar (via a live `--dockh` variable), so it never overlaps the dock.
- **Collective polish** — channel-gradient hairline under the top bar, node-tinted panel header, softer luminous metric cards, and gradient ticks on section headers.

## V15 — 2026-07-16
Themed scrollbars + panel clears the header.

- **Themed scrollbars** — every scrollbar (detail panel, guides, legend, tracks) now uses the Collective channel colour on the deep-space base instead of the default white/grey.
- **No header overlap** — the detail panel now opens **below** the top bar, so it no longer covers the header controls (search, channels, GUIDES, colour, shuffle).

## V14 — 2026-07-16
Panel close inside a BPM-spinning ring.

- The panel's ✕ close button now sits **centred inside the ring** at the top-right (and no longer overlaps the title), and the **ring spins at the selected genre's BPM** — one rotation per bar, so it's slow for downtempo and fast for DnB.

## V13 — 2026-07-16
Autoplay on click + genre-intentional sound.

- **Autoplay** — clicking any hub or orphan now starts the sound immediately (the click is the gesture that unlocks audio) — no need to press play first. Stop / volume still control it.
- **Intentional per-(sub)genre synthesis** — the engine now reads each genre's own data: scale/mode (Phrygian for psy, Dorian for deep house…), key, chord progression (parsed from the roman numerals), and the instruments named in its sound-design → TB-303 = acid bass, log-drum = amapiano bass, Reese = DnB, supersaw = trance, piano/Rhodes = house keys. Subgenres now sound distinct, not just family clones.

## V12 — 2026-07-16
Bottom-dock fixes.

- **No more overlap** — the player is a fixed 56px bar at the very bottom and the signature-tracks bar sits flush right above it (no gap, no collision).
- **Fills the window** — the dock and tracks bar now span the full window width instead of being centred, so no wasted space on wide screens.
- **Fixed the ✕** — the tracks-bar close button was showing a literal code; it now shows a proper ✕. Corner legend/credit/hint lifted clear of the dock.

## V11 — 2026-07-16
Full-width bottom dock + more distinctive genre sounds.

- **Bottom dock** — the audio player is now a full-width bar pinned to the bottom, and the signature-tracks bar is a full-width **sticky** bar stacked directly above it (same order on mobile — tracks above the player). It follows the window width.
- **More distinctive sound** — supersaw pads/arps for trance & melodic vs square stabs for house, a resonant "acid" bass, deeper sub, and per-style chord envelopes, so genres are easier to tell apart by ear.

## V10 — 2026-07-16
Signature-tracks bar + preview pauses the loop.

- **Tracks in their own container** — signature tracks moved out of the side panel into a dedicated **bottom-centre bar** (genre name + the five tracks as tap-to-preview pills, with a dismiss button).
- **Preview pauses the engine** — opening a signature-track preview now pauses the Tone.js procedural loop and resumes it when you close the preview, so the two never overlap.

## V09 — 2026-07-16
Water-float · reacting player · richer sound · songs everywhere.

- **Floats on water** — hubs and orphans now drift continuously across the screen with a slower, larger, organic motion.
- **Player shows & reacts** — the audio player is always visible, names the genre you clicked, shows its BPM, and has a live meter that jumps to the kick/bass/hats/chords; the play button also enables sound on first press.
- **More genre-accurate sound** — per-genre kick tone, bass voice (sub / reese / acid / dubstep filter-wobble), arpeggiated-vs-stab chords, and safe per-genre distortion.
- **Songs for every genre** — all 40 main genres now carry 5 signature tracks; subgenres inherit their parent's five, so every node (except the DJ-Tools utilities) shows a top-5.

## V08 — 2026-07-15
Interactive procedural audio (Phases 1-3).

- **Hear a genre** — an opt-in "Enable Sound" control starts a Tone.js engine; selecting any genre plays a short, original, procedurally-synthesized loop shaped by its BPM, energy, darkness, groove, patterns, key and space. No samples, no copyrighted audio.
- **Beat-reactive graph** — the selected node pulses to the kick and glows with the chords (respects prefers-reduced-motion).
- **Compact player** — play/pause, stop, volume (persisted), active-genre readout; keyboard + mobile friendly.
- **Safe & optional** — new modules (`audio-profiles/engine/ui.js`); the graph works fully if Tone.js is blocked. Deterministic profiles with unit tests. A/B compare + morph (Phases 4-5) are the next round.

## V07 — 2026-07-15
Song previews.

- **Tap a signature track to preview it** — a popup plays a 30-second preview (anonymous, nothing to install) with cover art, plus an "Open in Spotify" button.
- Spotify's own /embed player is wired in for any track that carries a Spotify ID (drops in later); until then previews come from Apple's public preview API, which gives the same anonymous 30-sec behaviour.

## V06 — 2026-07-15
Rebrand to BeatGenome.

- The app is now **Alpha Omega Collective — BeatGenome**, tagline "Explore the DNA of electronic music."
- Updated the title, header wordmark, loading screen, error copy and page metadata (description + social preview) to the new brand and blurb.

## V05 — 2026-07-15
Water splash + reorganised, more-visual panel. Author credit added.

- **Splash physics** — clicking a hub drops a stone in the pond: a ripple radiates out and physically nudges every other node (hubs *and* orphans), which then settle back.
- **Panel reorder** — the DJ mix fields (mixes-well-with, transition tip, blend length, colour/beat FX, loop, beat/depth, mix-in/out, double-drop) now sit **right after Structure**.
- **More visual** — Beat FX Depth shows a meter, vocal-density / double-drop show level pips, blend/loop/beat settings show as pills.
- **Credit** — DJ7 · Wilsonlicioussss (https://harbingermsc.blogspot.com/) on the page, loader, and metadata.

## V04 — 2026-07-15
Harmonic colour + tactile select.

- **Camelot colouring** — a new top-bar toggle (◐ FAMILY / ◑ KEY) recolours every node by its Camelot key on the harmonic-mixing wheel; the legend switches to the 12 key hues. Choice is remembered.
- **Select bounce** — clicking a hub gives it a springy pop, and the detail panel now slides in with a bounce.

## V03 — 2026-07-15
Living graph.

- **Hubs ripple to their BPM** — every genre node pulses on the beat and the genre-level hubs emit an expanding ring at their own tempo (slow for downtempo, fast for DnB).
- **The points now float** — a continuous gentle drift keeps the whole field breathing/moving instead of settling static.

## V02 — 2026-07-15
Info-panel visual upgrade.

- Panel oscilloscope now locks to each genre's **native BPM**, with an amplitude pulse on every beat and a playhead sweeping once per bar.
- Spectrum **bars behind the panel oscilloscope** are now prominent and beat-reactive (they jump on the beat).
- New **arrangement bar** in the panel: Intro -> Build -> Drop -> Breakdown -> Outro, segment widths proportional to bar-counts, brightness peaking at the drop; hover shows bars + feel.

## V01 — 2026-07-15
First working build of **EDM GENOME**.

- Force-directed genre graph (159 nodes, 586 links) rendered on canvas — pan, zoom, drag, hover, click.
- Node detail panel: metrics, energy bars, DNA arrangement strand, produce/mix sections, signature tracks, clickable "mixes-well-with" / "fuses-into" chips.
- Live oscilloscope + spectrum bars (top band + panel), synthesized from each genre's BPM/energy.
- Alpha Omega Collective theme with six live colour channels (persisted in localStorage).
- Search (keyboard-navigable) with graph highlight/dim; family legend; random "◎" jump.
- Built-in Guides overlay rendering the five DJ/producer markdown guides.
- `build_data.py` pipeline (CSV + guides → `assets/data.js`) and `tests/test_data.py` (11 checks).
- Six-state handling: loading animation, populated, empty-search, and data-load error state.

Known issues (non-blocking, carried from the release gate):
- `innerHTML` used to render panel/guides — all interpolated text passes through an HTML escaper and the data is first-party (the CSV), so the injection surface is controlled.
- One intentional empty `catch` guards `localStorage` when unavailable (private mode / `file://`).
- No `package.json` / `requirements.txt` — by design: zero runtime dependencies; the build script uses only the Python standard library.
- Visuals are generated from the data; there is no audio playback.
