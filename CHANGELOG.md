# Changelog

## V45 - 2026-07-16
Library becomes About Me.

- **About Me** - the top-bar LIBRARY button is now ABOUT, opening a personal page: a profile-picture area plus five sections (Things I Love, Always Learning, I DJ, I Produce, Currently Exploring). The per-genre library tags were retired with it.
- **Your photo** - drop a picture at `assets/about-me.jpg` to replace the placeholder (your uploaded photo was visible in chat but not saved as a file here).

## V44 - 2026-07-16
Morph always runs.

- **Fix: GRAPH<->DNA morph** was skipped whenever the system had "reduce motion" enabled (it fell back to an instant switch). Now the morph always animates; under reduced-motion it uses a shorter duration and drops the backbone glitch jitter so it stays gentle.

## V43 - 2026-07-16
Morphing GRAPH <-> DNA transition.

- **Nodes glide, backbone glitches in** - toggling to DNA now animates the hubs and orphans gliding from their graph positions to their timeline locations over ~1.1s, while the phosphate backbone (and base pairs) glitch into place - a jittery, electric form-up that settles into the firm helix. Toggling back reverses it. Reduced-motion still switches instantly.

## V42 - 2026-07-16
Full drum grid.

- **Perc lane** - the 16-step drum grid now shows the Percussion voice too, so every step the engine triggers (kick, snare, hats, open, perc, bass) is visible and in sync with the live playhead.

## V41 - 2026-07-16
Themed dropdowns.

- **In-theme genre pickers** - Compare Mode and Genre Morph now use a custom dropdown (dark list, channel-colour hover/selected, scrollable) instead of the browser's default select popup, so the blue system highlight is gone.

## V40 - 2026-07-16
Mobile top-bar menu.

- **Tidy controls on small screens** - the secondary top-bar buttons now collapse into a menu on narrow screens; on desktop they stay inline. Regenerated the GitHub Pages package from this build.

## V39 - 2026-07-16
Genre Morph.

- **Blend two genres** - a MORPH button opens a slider between any two genres; drag it and the procedural audio blends (BPM, energy, groove, FX interpolate smoothly; drum/chord patterns and key snap at the midpoint), switching on the bar. A readout shows the live blend, BPM and which genre's patterns are driving.

## V38 - 2026-07-16
Producer Playground.

- **Bass lane** - the 16-step drum grid now includes a Bass row, so you can see the bass movement alongside the kit.
- **Chord player** - a Chord Player block plays the genre's progression: click a roman-numeral to strum it, or hit sequence to hear the whole progression at tempo.

## V37 - 2026-07-16
DJ transition detail + Compare bar chart.

- **Why a transition works** - each Compatible Mix now shows the key relationship (same/relative/adjacent), BPM and energy delta, an EQ tip and phrase length under the row.
- **Compare bars** - Compare Mode gains an A/B bar chart of energy, groove, darkness, melody and swing above the table.

## V36 - 2026-07-16
Animated GRAPH <-> DNA transition.

- **View transition** - toggling between the force graph and the DNA timeline now animates: the camera zooms/pans between the two framings over ~0.55s, and the switch is covered by an electric dip (dim + travelling cyan scan-lines + a glitch spike). Falls back to instant under reduced-motion.

## V35 - 2026-07-16
Personal Library.

- **Tag your genres** - each genre panel now has Favourite / Want to Learn / I DJ / I Produce toggles, saved in your browser.
- **Library + recommendations** - a LIBRARY button opens your tagged genres grouped by list, plus a "Recommended for you" section built from genres that mix well with your favourites and DJ picks.

## V34 - 2026-07-16
Compare Mode.

- **Two genres side by side** - a COMPARE button opens a panel with two genre pickers and a side-by-side table (family, BPM, energy, Camelot/key, groove, bass, chords, arrangement, mixes-with, artists, producer notes), plus A/B playback buttons.

## V33 - 2026-07-16
Mood Explorer.

- **Filter by feeling** - a new MOOD button opens a filter bar (Dark, Euphoric, Driving, Minimal, Organic, Festival, Underground, Emotional). Pick a mood and the graph/timeline highlights the genres that fit and dims the rest; pick again to clear.

## V32 - 2026-07-16
Producer drum grid + DJ compatible-genre finder.

- **Drum Pattern (16-step)** - a genre's info panel now shows its kick/snare/hat/open-hat pattern on a 16-step grid, straight from the audio profile, with a live playhead that follows the beat while sound plays.
- **Compatible Mixes (DJ)** - the panel ranks other genres you can mix into: BPM-close and/or harmonically compatible (Camelot), each tagged easy/medium/hard, click to jump.
- **Terminology** - README aligned to the Genre Profile / Musical Characteristics / Audio Profile / Visual Behaviour / DJ Information / Producer Information vocabulary.

## V31 — 2026-07-16
Camelot key box in the footer.

- **Camelot box** — the bottom player now leads (far left, beside the chords) with a Camelot box: the current genre's Camelot code (e.g. 8A), its key (A min), and the three harmonic-mixing neighbours (7A · 9A · 8B) for quick key matching.

## V30 — 2026-07-16
Electric base pairs are now marching dotted lines.

- **Dotted electric wave** — each DNA base pair is now a thin dotted line whose dots travel along it (paced by the nearest genre's BPM), keeping the cyan glow, jitter and flicker of the electric effect.

## V29 — 2026-07-16
Bolder backbones, and DNA nodes that bounce.

- **Defined backbones** — the two DNA strands are now 3× thicker (and brighter), reading as solid rails.
- **Nodes bounce to their BPM** — in the DNA view, the genres (hubs) and floating subgenres (orphans) now pulse to their own native tempo, just like the force-graph nodes do.

## V28 — 2026-07-16
Electric base pairs, and a new byline.

- **Electric wave** — the DNA base-pair waveforms now arc like electricity: cyan glow, per-frame jitter and flicker, so the rungs crackle between the firm backbones.
- **Renamed** — the browser tab and header byline now read "BeatGenome By [DJ7]-[AOC] //Wilsonlicioussss".

## V27 — 2026-07-16
Base pairs are now audio waveforms.

- **Waveform base pairs** — each A-T rung between the DNA backbones is now drawn as a small oscilloscope-style waveform (tapered at both ends so it still meets the strands), rippling to the nearest genre's BPM. The firm, thick backbones stay put.

## V26 — 2026-07-16
Thicker backbones, bigger wave.

- **Firmer backbones** — the two DNA strands are now drawn noticeably thicker (and a touch brighter), reading as solid sugar-phosphate rails.
- **Stronger ripple** — the base-pair wave amplitude is increased, so the A-T rungs sway more dramatically as the helix turns to the nearest genre's BPM.

## V25 — 2026-07-16
Firm backbones — only the base pairs ripple.

- **Rigid sugar-phosphate backbones** — the two DNA strands (and the genres riding them) are firm again; the travelling wave was removed from them.
- **Base pairs wave** — each base-pair rung now bows in a travelling wave (still paced by the nearest genre's BPM), so the ripple lives in the A-T rungs while the helix holds its shape.

## V24 — 2026-07-16
Fixed structure labels, stronger highlight, and a living DNA.

- **No more clipped labels** — the arrangement structure rows (Intro / Build / Drop / Breakdown / Outro) no longer sit under the knot; a V21 spacing regression is fixed.
- **Background highlight** — hovering a structure row (or its matching arrangement segment) now fills the row with the genre's colour, a left accent bar and a lit knot.
- **The DNA breathes** — in the DNA view, the base pairs and strands ripple in a travelling wave whose speed follows the BPM of the main genre nearest the centre of your view, so panning toward a faster genre makes the helix pulse faster.

## V23 — 2026-07-16
Live, interactive chord box in the footer.

- **Chords move to the footer** — a box at the far left of the bottom player now shows the current genre's chord progression as roman numerals, and the chord that Tone.js is playing lights up in real time, bar by bar. (Removed from the info panel's arrangement.)
- **Click to strum** — tapping a chord pill plays that chord over the loop, so the box is playable.
- **Cleaner progressions** — tightened the chord parser so prose words in the data (e.g. "emotive", "vamps") are no longer misread as extra chords, which also cleans up the engine's harmony.

## V22 — 2026-07-16
Chord progression sits beside the arrangement.

- **Chords before the bars** — a genre's info panel now shows its chord progression (roman-numeral movement, in the genre's colour) at the far left of the Intro / Build / Drop / Breakdown / Outro arrangement bar, so harmony and structure read together.

## V21 — 2026-07-16
Linked arrangement rows, and a floating-by-year DNA.

- **Arrangement hover-link** — in a genre's panel, hovering a segment in the arrangement bar now highlights its matching structure row (and vice-versa), so Intro / Build / Drop / Breakdown / Outro line up at a glance.
- **DNA: subgenres float by year** — every subgenre is now shown, floating at its own year rather than hidden until you open its parent; the view stays a clean constellation.
- **Links on hover** — hovering a subgenre reveals a dashed link to its main genre with a "↳ name" tag so you always know where it belongs; hovering a main genre lights up and links all of its subgenres.

## V20 — 2026-07-16
Sharp UI, a turning DNA timeline, and a beat-synced glitch.

- **DNA timeline view** — a new GRAPH ⇄ DNA toggle in the top bar. Genres arrange left→right by origin year on a horizontal double-helix that turns continuously (speed follows the playing genre's BPM), with decade markers; click a genre to fan out its subgenres and open the panel. The force graph is untouched — it's a second view.
- **Sharp everything** — removed rounded corners across the UI and info panel (Collective Rev-02); only the vinyl preview disc stays round, and the channel dots are now square.
- **BEATGENOME** — the wordmark is now all-caps.
- **Beat glitch** — a cyan/magenta RGB-split glitch pulses on the ΛΩ mark, the wordmark and the panel header on each bar at the current tempo (subtle when nothing's playing; off under reduced-motion).

## V19 — 2026-07-16
Family-glyph graph + framed hubs, and the chord progression brought forward.

- **Symbols by family** — each genre family now draws as its own sharp glyph (square, diamond, plus, x-box, ring, triangle, box-dot, asterisk), so clusters read apart by shape as well as colour.
- **Distinct hubs** — main-genre hubs get a bold square outline frame plus a cyan/magenta ΛΩ glitch split and a square beat-ring, so they stand clear of their subgenres.
- **Cleaner cyber field** — faint lime connections on deep space (the image-1 feel); the force-graph logic, physics, clicks and zoom are unchanged.
- **Chords you can hear** — raised the chord level and velocities so each genre's per-bar progression sits forward in the mix instead of buried.

## V18 — 2026-07-16
Alpha Omega Collective brand pass + a real browser-tab icon.

- **ΛΩ mark, for real** — the topbar badge is now the pixel-glitch ΛΩ mark from your logo (not a gradient "ΑΩ"), recoloured to the active channel.
- **Channel-reactive tab icon** — the favicon is the ΛΩ mark and swaps colour with the channel switcher (magenta / cobalt / lime / orange / teal); added apple-touch icon, theme-color and a social og:image too.
- **Lime signature** — the Collective's #C6F000 signature now marks the active channel dot, the hint keys, the loading wordmark and the "Alpha Omega Collective" line — constant across every channel.

## V17 — 2026-07-16
Song preview becomes a spinning CD with a themed, genre-coloured player.

- **CD / vinyl artwork** — the preview cover is now a circle with a centre spindle; it spins while the track plays and stops when paused.
- **Spin follows the BPM** — one rotation per bar at the selected genre's tempo (faster genre = faster spin).
- **Themed player** — the default browser audio bar is replaced by a custom play/pause button, progress bar and time readout, all coloured by the genre (family colour, or Camelot-key colour when KEY mode is on), matching the graph.

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
