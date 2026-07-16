# BeatGenome 🧬🎛️

**By DJ7 — Wilsonlicioussss** · https://harbingermsc.blogspot.com/

**Explore the DNA of electronic music.** From genres and sounds to DJ settings, producer tips, and club culture, BeatGenome is a fun way to understand the rhythm behind the scene — **159 genres and subgenres**, each carrying **57 data points** (BPM, key/Camelot, energy, arrangement, sound-design, DJ mixing intel).

Built as a fun, open toy in the visual language of **Alpha Omega Collective** — deep-space, duotone channels, oscilloscope, spectrum bars and a DNA structure strand. Tap any signature track to hear a 30-second preview.

> Drag to pan · scroll to zoom · click a node · `/` to search · tap the coloured dots to switch channel.

## What's inside

- **Graph view** — every genre is a node, coloured by family; links show parent→subgenre, "fuses into", and DJ "mixes well with".
- **Oscilloscope + spectrum bars** — a live waveform whose tempo and amplitude follow the genre you're hovering (frequency ∝ BPM, height ∝ energy). *Synthesized from the data — there is no audio playback.*
- **DNA structure strand** — each genre's arrangement (Intro → Build → Drop → Breakdown → Outro) as a helix of bar-counts and section "feel".
- **Interactive audio** — opt-in "Enable Sound" plays a short procedural loop that reflects each genre's BPM, energy, patterns and mood (Tone.js, no samples); the graph pulses to the beat. Fully optional.
- **Channels** — six Collective colour channels (Plasma, Ion, Flux, Solar, Nova, Mint) recolour the whole page live.
- **Guides** — five DJ/producer how-to guides (harmonic mixing, set building, FX & loops, live playbook, sources) built in.

## Run it locally

No build step, no server, no dependencies. **Just open `index.html`** in any modern browser (double-click it). Fonts load from Google Fonts when online; everything else is self-contained.

## Rebuild the data (only if you edit the CSV)

The site reads `assets/data.js`, which is generated from the CSV + guides. If you change `edm_genres_subgenres_detailed.csv` or a guide, regenerate it:

```bash
python build_data.py          # writes assets/data.js
python tests/test_data.py     # 11 integrity checks (optional but recommended)
```

Requires Python 3 (standard library only — no `pip install`).

## Publish it free on GitHub Pages

**Easiest (web upload):**
1. Create a new **public** repo on GitHub (e.g. `edm-genome`).
2. Upload the whole contents of this `DJ Project` folder (so `index.html` sits at the repo root). You can drag-and-drop files in the GitHub web UI.
3. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `/root` → Save**.
4. Wait ~1 minute. Your site is live at `https://<your-username>.github.io/edm-genome/`.

**With git:**
```bash
git init && git add . && git commit -m "BeatGenome"
git branch -M main
git remote add origin https://github.com/<you>/edm-genome.git
git push -u origin main
# then enable Pages in Settings as above
```

## Files

```
DJ Project/
├── index.html                 the app shell
├── assets/
│   ├── styles.css             Alpha Omega Collective theme
│   ├── app.js                 graph sim, oscilloscope, panel, search, guides
│   └── data.js                GENERATED — genres + links + guides (from the CSV)
├── build_data.py              CSV + guides → data.js
├── tests/test_data.py         data-integrity checks
├── edm_genres_subgenres_detailed.csv   the source dataset (57 columns)
├── edm_top_tracks_by_genre.csv
├── edm_genres_subgenres.csv
└── *.md                       the five DJ/producer guides + this README
```

## Notes & honesty

- The dataset is **hybrid**: genre taxonomy is Beatport-derived; BPM/key/structure are expert/convention estimates; artists/tracks are canonical picks, **not** a live chart. See `edm_dataset_sources_and_method.md`.
- No analytics, no tracking, no cookies. Colour-channel choice is remembered in `localStorage` only.
- Dependencies: **none** (vanilla JS + Canvas). Fonts via Google Fonts CDN, with system fallbacks offline.

Made with Alpha Omega Collective — *freedom in colour, discipline in structure.*

## Engineering terminology (per BeatGenome Terminology Guide)

Primary implementation object: the **Genre Profile** (`assets/audio-profiles.js` -> `buildAudioProfile`).

- **Musical Characteristics** - BPM, energy, groove, rhythm style, melody, harmony, arrangement style.
- **Audio Profile** - tempo, swing, kick pattern, hat density, bass style, chord style, reverb, delay, filter, distortion.
- **Visual Behaviour** - node pulse, background motion, glow, beat synchronisation, animation speed, connection highlight.
- **DJ Information** - transition advice, compatible genres, BPM compatibility, harmonic (Camelot) compatibility, energy progression, mixing notes.
- **Producer Information** - kick style, bass style, chord style, arrangement, FX chain, stereo image, mixing notes, sound design tips.

"DNA" is kept only as the marketing name of the timeline/helix view; avoid it as an engineering term. "BeatGenome" is the product name only.
