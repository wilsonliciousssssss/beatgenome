# Changelog

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
