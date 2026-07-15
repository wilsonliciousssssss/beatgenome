# EDM Genre Dataset — Sources & Method

_Companion to `edm_genres_subgenres_detailed.csv` (45 columns) and `edm_top_tracks_by_genre.csv`. Updated 2026-07-15._

This dataset is **hybrid**: some columns are sourced from authoritative references, others are expert/convention estimates. This note says which is which, so no value is mistaken for something it isn't.

## Data basis by column

**Sourced (external references)**

- **Genre / Subgenre, Parent Genre, Level** — Beatport official label-delivery taxonomy (updated Apr 2026), fetched from Beatport Greenroom support. This is the structural spine.
- **Beatport / 1001Tracklists / BPM Supreme / DJcity** (source flags) — each platform's own published genre list. Beatport, BPM Supreme, 1001Tracklists fetched directly; **DJcity is JavaScript-rendered so its flags are indicative** (from DJcity articles + search), not an exhaustive scrape.
- **Origin / Era** — well-documented genre history (widely corroborated).

**Canonical (expert + web-verified, NOT a live chart)**

- **Representative Artists, Landmark Track, Top Track 1–5** — genre-defining classics chosen for recognisability and stable consensus. These are **not** today's Beatport/streaming chart. Uncertain picks were dropped rather than guessed; ~a third of obscure subgenres are intentionally blank here. Currently populated for 32 genres.
- **Key Labels, Peak / Momentum (yrs)** — expert read, with trend direction informed by Beatport's 2024–25 commentary.

**Expert / convention (production norms, not measured)**

- **BPM Min / Max / Typical** — typical genre ranges, cross-checked against common DJ references. Not measured per-track.
- **Common Keys / Camelot** — the genre's *tonal tendency* (most club EDM is minor), a mixing starting point — not a per-track key.
- **Drum Feel, DJ Set Placement, Intro/Build/Drop/Breakdown/Outro (bars), Typical Length, Phrasing, the five Feel columns, Track Structure** — standard arrangement conventions.
- **Sound Signature, Sound Design / Instrumentation, Drum Programming, Harmony Approach, Production Techniques** — established production conventions per genre.

## What would make it "more real" (upgrade path)

- **Spotify connector** (found in registry, not yet connected) — verify track titles/artists/years, popularity, and build playlists. Note: Spotify's audio-features endpoint (real BPM/key/energy) is closed to new apps, so per-track measured tempo/key is not reliably available this way.
- **Beatport Genre Top 100** (via web) — real *current* top tracks per genre and release/label metadata. This is the source to use if you want a live "top now" instead of canonical classics.
- **Discogs / MusicBrainz** — authoritative artist, label and release metadata to firm up Key Labels and Representative Artists.

## Governance rule (same as the QS vault)

If we add more data, each new value should carry its basis (sourced vs estimate) and, where sourced, a date. Estimates are useful defaults; they should never be presented as measured facts.
