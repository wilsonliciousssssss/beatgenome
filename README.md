# BeatGenome 🧬🎛️

**Explore the DNA of electronic music.**
By DJ7 · Wilsonlicioussss

Hey — I'm Wilson, and this is BeatGenome: a little universe I built for anyone who's ever fallen down a rabbit hole of electronic music and wondered how it all connects.

Techno, house, trance, drum & bass, dubstep, ambient… there are hundreds of genres and subgenres out there, each with its own tempo, mood and story. BeatGenome maps them out so you can *see* the family tree, *hear* how each one feels, and *understand* what makes it tick — whether you're a curious listener, a bedroom producer, or a DJ hunting for your next mix.

It's free, it runs right in your browser, and there's nothing to install. Open it and start exploring.

## What you can do

**🌌 Explore the map.** Every genre is a glowing node in a living graph, grouped into families and linked by how they relate — parent to subgenre, what fuses into what, and which genres mix well together. Drag to move around, scroll or pinch to zoom, tap any node to open it.

**🔎 Search anything.** Looking for "melodic techno" or "future bass"? Search and jump straight to it.

**🎧 Hear how it feels.** Turn on sound and BeatGenome plays a short, living loop for each genre — its tempo, groove, drums, bassline and chords, all generated on the fly (no copyrighted samples). The whole map pulses to the beat.

**🧬 See the structure.** Switch to the timeline view and each genre unfolds like a strand of DNA — its typical arrangement from intro to build to drop to breakdown, laid out as bars and "feel."

**🎚️ Get the DJ intel.** For every genre: ideal BPM, the key in Camelot notation, which genres blend well, transition tips, and the FX moves the pros reach for.

**🎹 Peek behind the production.** Drum patterns, basslines, chord progressions, sound-design notes and mix targets — the building blocks behind each sound, with little players so you can actually hear the ideas.

**⚖️ Compare & morph.** Put two genres side by side to see how they differ — or slide between them and hear one slowly morph into the other.

**🎭 Filter by mood.** Feeling dark? Euphoric? Dreamy? Filter the whole map by the vibe you're chasing.

**🎨 Make it yours.** Six colour "channels" repaint the entire experience — pick the one that matches your mood.

**📱 Take it anywhere.** Built for phones and tablets too — pinch to zoom, tap a genre and its details slide up from the bottom while the sound keeps playing.

**📚 Learn the craft.** Built-in guides cover harmonic mixing, building a set, FX & loops, a live playbook, and where the data comes from.

## A note on honesty

I built this to be fun and genuinely useful, not to pretend it's the last word. The genre map is grounded in real taxonomy; the tempos, keys and structures are informed estimates and conventions; the artists and tracks are classic picks to point you somewhere good — not a live chart. And there's no tracking, no ads, no cookies: your colour choice is the only thing saved, and it never leaves your device.

## About me

I'm Wilson — **DJ7 · Wilsonlicioussss**. I love thoughtful design, quiet details, electronic music and ideas that feel a little ahead of their time. Everything I make starts with curiosity — how design, data, people and culture connect — and BeatGenome is one of those experiments: a way to make the music I love easier to understand and explore. There's a bit more about me inside the app, under **About**.

Come say hi → https://harbingermsc.blogspot.com/

---

### For the curious — running & hosting it yourself

BeatGenome is a single, self-contained web app: vanilla JavaScript and HTML5 Canvas, no frameworks, no build step.

- **Run it:** open `index.html` in any modern browser.
- **Host it free:** upload this folder to a public GitHub repo (with `index.html` at the root) and switch on **Settings → Pages → Deploy from a branch**. Your site goes live at `https://<your-username>.github.io/<repo>/`.
- **Under the hood:** the app reads `assets/data.js` (generated from the source CSV by `python build_data.py`); optional sound is procedural via Tone.js — no audio files.

Made with **Alpha Omega Collective** — *freedom in colour, discipline in structure.*
