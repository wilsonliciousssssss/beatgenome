# DJ Harmonic Mixing & Camelot Guide

_Companion to `edm_genres_subgenres_detailed.csv` (see the Common Keys / Camelot columns). Updated 2026-07-15._

Harmonic mixing = blending tracks whose keys are musically compatible, so transitions sound smooth instead of clashing. DJ software (Rekordbox, Serato, Traktor, Mixed In Key) labels every track with a **Camelot code**: a number 1–12 + a letter (**A = minor, B = major**).

## The Camelot wheel

```
        12B  1B
   11B          2B          Outer ring = MAJOR keys (B)
 10B              3B        Inner ring = MINOR keys (A)
 9B                4B
   8B            5B
      7B  6B
```

| Camelot | Key (minor A / major B) |  | Camelot | Key |
|---|---|---|---|---|
| 1A / 1B | A♭ min / B maj | | 7A / 7B | D min / F maj |
| 2A / 2B | E♭ min / F♯ maj | | 8A / 8B | A min / C maj |
| 3A / 3B | B♭ min / D♭ maj | | 9A / 9B | E min / G maj |
| 4A / 4B | F min / A♭ maj | | 10A / 10B | B min / D maj |
| 5A / 5B | C min / E♭ maj | | 11A / 11B | F♯ min / A maj |
| 6A / 6B | G min / B♭ maj | | 12A / 12B | D♭ min / E maj |

## The compatible-move rules

From any track's Camelot code, these blends are safe:

- **Same code** (8A → 8A) — identical key, perfect blend.
- **±1 on the wheel** (8A → 7A or 9A) — adjacent, one step around; the classic energy-preserving move.
- **Switch letter, same number** (8A → 8B) — relative major/minor; changes mood (darker↔brighter) without clashing.
- **+7 / "energy boost"** (8A → 3A) — jumps a perfect 5th; lifts energy, use sparingly.
- **±2 or +3 letter jumps** — riskier; works if one track is on a breakdown/beatless section.

Rule of thumb: **stay on the same number and creep ±1** for seamless sets; use the relative major/minor (A↔B) to shift emotional tone.

## Using it with the genre CSV

The CSV's **Camelot** column gives each genre's *typical* codes (e.g. Trance 8A/11A, Nu Disco 8B/9B). That tells you which genres naturally sit in compatible key territory — but always trust the **per-track** Camelot from your DJ software over the genre average, since individual tracks vary.

## Cross-genre / cross-BPM bridges (the "Mixes Well With" + "Transition Tip" columns)

- **Small BPM gap (±4)** — pitch-ride and blend normally (house 124 ↔ tech house 126).
- **Medium gap** — ride pitch + EQ trade over a long phrase; the CSV's Transition Tip gives the per-genre move (bass swap, echo-out, loop roll).
- **Big gap (halftime/double-time)** — a 140 dubstep track reads as 70 against a 70/140 trap or 174 DnB; use the halftime feel to bridge tempos. House (124) → DnB (174) works via a percussive tool track or a double-time transition.
- **Double-drop** (mainly DnB/dubstep) — line up two drops on the phrase for a big moment; match keys first.
