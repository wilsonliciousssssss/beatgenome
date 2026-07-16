# BeatGenome — Interactive Audio Enhancement (V08)

Implements Phases 1–3 of the enhancement package (foundation, genre profiles, beat-reactive graph). A/B compare (Phase 4) and morph (Phase 5) are deliberately deferred to a follow-up.

## Files ADDED (new modules — removable)
- `assets/audio-profiles.js` — pure logic: `buildAudioProfile(genreData)` → deterministic, clamped, normalized profile (BPM parse, score normalize, keyword classify, family defaults + overrides, seeded 16-step patterns, `interpolate()` for the future morph). No Tone.js, no DOM.
- `assets/audio-engine.js` — `window.BeatGenomeAudio`: gesture-gated `initialize()`, instruments built once (kick/snare/hats/perc/bass/chords/lead), 16-step `Tone.Transport` scheduler, master limiter + conservative gain, crossfade, reactive state, tab-visibility pause/resume, `destroy()`. Works as a no-op if Tone.js is missing.
- `assets/audio-ui.js` — compact player + "Enable Sound"; sets `window.BeatGenomeOnSelect`. Shows a small "Interactive sound unavailable" note if unsupported.
- `tests/test_audio_profiles.js` — 11 checks (determinism, ranges 0–1, valid BPM, pattern lengths, fallback, no NaN, interpolation).

## Files MODIFIED (small, reversible)
- `index.html` — added Tone.js CDN (pinned 14.8.49) + the three audio `<script>` tags after `app.js`.
- `assets/app.js` — six one-line hooks: read reactive state each frame, pulse/glow the selected node (reduced-motion aware), decay the state, and call `window.BeatGenomeOnSelect` on selection. All guarded by `if (window.BeatGenomeAudio…)`.
- `assets/styles.css` — `.bgaudio` player styles.

## Preserved
Canvas graph, layout, controls, colour channels, Camelot mode, data fields, detail panel, search, guides, track-preview popup, splash/ripple/float, static GitHub-Pages deployment, `build_data.py` workflow.

## Tests
- `python tests/test_data.py` → 11/11 (unchanged data).
- `node tests/test_audio_profiles.js` → 11/11.
- `node --check` clean on all JS.
- Release gate (secrets): PASS.

## NOT browser-tested here
The Chrome extension isn't connected in this environment, so audio playback and the beat-reactive visuals were **not** verified in a live browser. Please open `index.html`, click **Enable Sound**, then select genres and confirm: sound starts only after the click; House vs Techno vs DnB vs Ambient sound clearly different; the selected node pulses; stop/volume work; and blocking the Tone.js CDN still leaves the full graph usable.

## Known limitations
- Audio is a teaching abstraction, not a reproduction of any track.
- Family-level profiles + ~18 overrides; other genres use a sensible family fallback.
- A/B compare and morph not yet implemented.
- Halftime feel is represented via `rhythmicFeel`, not by falsifying displayed BPM.

## Rollback
Remove the four audio `<script>` tags from `index.html`, delete the three `assets/audio-*.js` files, and revert the six guarded hooks in `app.js` (and the `.bgaudio` CSS). The original app then runs unchanged.
