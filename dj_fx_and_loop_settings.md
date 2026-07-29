# DJ FX & Loop Settings — Quick Reference

_Companion to `edm_genres_subgenres_detailed.csv` (columns: Sound Colour FX, Beat FX, Transition Loop (bars), Beat FX Setting (beat), Beat FX Depth (%)). Pioneer DJM/CDJ terminology. Updated 2026-07-15._

## How the three settings work

**Beat FX Setting (beat) — the time division.**
On a DJM mixer, Beat FX time is a fraction of a beat, **auto-synced to the track's detected BPM**. You don't dial a millisecond value — you pick a musical division and the mixer calculates the time from BPM:

- **Short (1/16, 1/8, 1/4)** → fast rolls/stutters → build tension into a drop.
- **Medium (1/2, 3/4)** → tight slap/echo → groove and rhythmic movement.
- **Long (1/1, 2/1, 4/1)** → spacious tails and wash-outs → transitions and breakdowns.

Because it's BPM-synced, the *same* setting sounds right whether the track is 124 or 174 — the effect scales with tempo. Keep the two tracks' **BPM within ±4** for clean beat-matched FX; for big tempo jumps use a halftime/double-time bridge (see `dj_harmonic_mixing_guide.md`).

**Beat FX Depth (%) — the LEVEL/DEPTH knob (wet/dry).**
How much effect you hear over the dry signal:

- **20–40%** → sits *under* the mix, subtle colour, keeps the groove intact.
- **50–70%** → obvious wash — use for transitions and breakdowns.
- **80–100%** → the effect *takes over* — drop slams, tape-stops, full risers.

**Transition Loop (bars) — extend or build.**
Loops are set in beats/bars on the CDJ (4 beats = 1 bar):

- **4–16 bar loops** → hold the outgoing track's intro/outro to *extend a blend* (longer for techno/house, shorter for bass genres).
- **1–2 bar loops, then halve** (2 → 1 → 1/2 bar) → *build tension* into a drop, often paired with a Beat FX Roll.

## Beat FX types — what each one does

Beat FX sit on the mixer's master (post-crossfader) and are all tempo-synced. The ones you'll actually reach for:

- **Echo** — decaying repeats; the workhorse. Long (1/1–2/1) to wash a track out, short (1/8) to thicken. Feed it, then pull the fader — the tail covers the gap.
- **Delay** — like Echo but the repeats hold their level; tighter and more rhythmic. Good for dub stabs and 1/4–1/2 grooves.
- **Reverb** — space and tail with no distinct repeats. 1/1 at 50–70% to smear a breakdown; 100% for a wash-out into silence.
- **Roll (Beat Roll)** — captures a slice of audio and repeats it. Halve the division (1/4 → 1/8 → 1/16) to build a stutter riser into a drop. The tension tool.
- **Ping-Pong** — echo that bounces L↔R; adds width to breakdowns without muddying the centre.
- **Spiral / Helix** — echo whose pitch and feedback climb; hold to build, kill on the 1 to slam.
- **Filter (LPF/HPF)** — sweeps the lows or highs out; the cleanest way to bring a track in or take it out.
- **Vinyl Brake / Tape Stop** — slows the track to a halt like a stopped record; 1/8–1/4 for a tape-stop into a trap or big-room drop.
- **Flanger / Phaser** — sweeping comb-filter colour over long risers; use sparingly.

Rule: **one effect at a time.** Stacking FX turns a mix to mud faster than anything else.

## Sound Colour FX — the per-channel knob

Separate from Beat FX: the **Colour** knob sits on each channel (centre = off) and shapes the sound before the effect ever hits.

- **Filter** (default) — turn **left** for a low-pass (darker, removes highs), **right** for a high-pass (thinner, removes lows). The single most-used move for bringing tracks in and out.
- **Dub Echo** — filtered echo that builds as you turn it; great for breakdowns.
- **Noise** — white/pink noise that rises with the knob; layer under a build for a riser.
- **Sweep** — a low/high sweep with a different curve to Filter.
- **Crush** — bit-crush and distortion for aggressive genres.

Because it's per-channel you can HPF the *outgoing* track thin while the *incoming* stays full — a clean hand-off without touching the EQ.

## General quick-reference

| Goal | Loop | Beat FX | Beat setting | Depth |
|---|---|---|---|---|
| Extend / blend | 4–16 bars | Echo / Reverb | 1/1–2/1 | 30–50% |
| Build tension | 2→1→½ bar | Roll | 1/4 → 1/16 | 50 → 100% |
| Wash-out / exit | — | Reverb / Echo | 1/1 | 50–70% |
| Slam the drop | — | Roll / Reverb | 1/8 | 80–100% |
| Edit / stutter / tape-stop | 1–2 bars | Vinyl Brake / Roll | 1/8 | 60–100% |

## Reading it per genre

The CSV gives genre-specific starting points. For example:

- **Techno** — 8–16 bar loops for hypnotic blends; Echo/Spiral at 1/1, ~40–60% (100% to slam).
- **Tech House** — 4-bar loop / 1-bar roll; Roll 1/8–1/4, 30–50% (80% on the build).
- **Trance** — blend across the 8–16 bar breakdown; Reverb + Echo 1/1, 40–70% washes.
- **Dubstep / DnB** — 1–2 bar roll into the drop; Roll 1/8–1/16, up to 100%.
- **Trap / Hip-Hop** — 2–4 bar loops; Vinyl Brake tape-stop into the drop, Reverb 50–100%.

These are starting points — trust your ears and the specific track over the genre default.


## Scenarios — FX recipes for common situations

Pick the situation, dial the recipe, then trust your ears:

1. **Smooth 8-bar house blend** — 8-bar loop on the outgoing outro · Echo 1/1 @ 40% · bass-swap on the phrase. Low drama, long overlap.
2. **Build tension into a big drop** — loop 4 → 2 → 1 → ½ bar · Roll 1/8 → 1/16 · depth 50 → 100% · kill on the 1.
3. **Wash out and exit** — no loop · Echo or Reverb 1/1 @ 50–70% on the outgoing · pull the fader under the tail.
4. **Slam the drop** — no loop · Roll or Reverb 1/8 @ 80–100% · cut the outgoing on the downbeat.
5. **Genre switch (house → DnB)** — halftime bridge · Reverb 1/1 @ 60% wash · loop-roll the incoming intro, release on the 1.
6. **Escape a clashing mix** — Echo 1/1 @ 60% on the outgoing · pull the fader · re-enter on the next phrase.
7. **Tape-stop into trap** — Vinyl Brake 1/8 on the outgoing · Reverb 80% · drop the incoming on beat 1.
8. **Extend a short breakdown** — 16-bar loop on the beatless section · Reverb 50–70% · hold until the incoming is ready.
