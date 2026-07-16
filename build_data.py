#!/usr/bin/env python3
"""
build_data.py  —  EDM GENOME data pipeline.

Reads the genre CSV and the markdown guides that sit next to this script and
emits a single self-contained assets/data.js (window.DJDATA = {...}).

Embedding the data (instead of fetching the CSV at runtime) means the site
works three ways with zero server: double-clicked locally, on GitHub Pages,
and offline. Run this whenever the CSV or a guide changes:

    python build_data.py
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "edm_genres_subgenres_detailed.csv")
TOP = os.path.join(HERE, "edm_top_tracks_by_genre.csv")
ASSETS = os.path.join(HERE, "assets")
GUIDES = [
    "dj_harmonic_mixing_guide.md",
    "dj_set_building_guide.md",
    "dj_fx_and_loop_settings.md",
    "dj_live_performance_playbook.md",
    "edm_dataset_sources_and_method.md",
]

def norm(s):
    """Loose key for matching genre names across free-text columns."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def parse_int(s):
    m = re.search(r"\d+", s or "")
    return int(m.group()) if m else None

def main():
    if not os.path.exists(CSV):
        sys.exit(f"ERROR: cannot find {CSV}")
    with open(CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("ERROR: CSV has no rows")

    # --- unique ids (a couple of names repeat across families) ---
    seen, id_of = {}, {}
    for r in rows:
        name = r["Genre / Subgenre"].strip()
        key = norm(name)
        if key in seen:
            key = norm(name + r["Parent Genre"])
        seen[key] = True
        id_of[id(r)] = key
        r["_id"] = key

    # name/family -> id lookup for building links from free text
    lookup = {}
    for r in rows:
        lookup.setdefault(norm(r["Genre / Subgenre"]), r["_id"])
        lookup.setdefault(norm(r["Parent Genre"]), None)  # family, resolved below
    # resolve family names to their Genre-level node where one exists
    fam_node = {}
    for r in rows:
        if r["Level"] == "Genre":
            fam_node[norm(r["Parent Genre"])] = r["_id"]
    for k, v in list(lookup.items()):
        if v is None:
            lookup[k] = fam_node.get(k)

    # --- families + a distinct colour per family ---
    families = []
    for r in rows:
        if r["Parent Genre"] not in families:
            families.append(r["Parent Genre"])
    fam_colour = {}
    n = len(families)
    for i, fam in enumerate(families):
        hue = round(i * 360 / n)
        fam_colour[fam] = f"hsl({hue}, 85%, 62%)"

    # --- inherit top tracks: subgenres with no songs borrow their parent genre's ---
    def _n(x): return re.sub(r"[^a-z0-9]", "", (x or "").lower())
    main_top = {}
    for r in rows:
        if r.get("Level") == "Genre" and (r.get("Top Track 1") or "").strip():
            main_top[_n(r.get("Parent Genre"))] = [r.get("Top Track %d" % i, "") for i in range(1, 6)]
    for r in rows:
        if not (r.get("Top Track 1") or "").strip():
            src = main_top.get(_n(r.get("Parent Genre")))
            if src:
                for i in range(1, 6):
                    r["Top Track %d" % i] = src[i - 1]

    # --- nodes ---
    nodes = []
    for r in rows:
        data = {k: v for k, v in r.items() if not k.startswith("_")}
        nodes.append({
            "id": r["_id"],
            "name": r["Genre / Subgenre"].strip(),
            "family": r["Parent Genre"].strip(),
            "level": r["Level"].strip(),
            "bpm": parse_int(r.get("Typical BPM")) or parse_int(r.get("BPM Min")) or 124,
            "bpmMin": parse_int(r.get("BPM Min")),
            "bpmMax": parse_int(r.get("BPM Max")),
            "energy": parse_int(r.get("Energy (1-10)")) or 5,
            "camelot": (r.get("Camelot") or "").split(",")[0].strip(),
            "colour": fam_colour[r["Parent Genre"]],
            "d": data,
        })

    # --- links ---
    links, seen_links = [], set()
    def add(s, t, kind):
        if not s or not t or s == t:
            return
        k = tuple(sorted((s, t))) + (kind,)
        if k in seen_links:
            return
        seen_links.add(k)
        links.append({"s": s, "t": t, "k": kind})

    for r in rows:
        sid = r["_id"]
        # child -> parent family node
        if r["Level"] == "Subgenre":
            add(sid, fam_node.get(norm(r["Parent Genre"])), "child")
        # related / fuses-into
        for part in re.split(r"[,/]", r.get("Fuses Into / Related", "") or ""):
            tid = lookup.get(norm(part))
            add(sid, tid, "related")
        # mixes well with (DJ compatibility)
        for part in re.split(r"[,/]", r.get("Mixes Well With", "") or ""):
            tid = lookup.get(norm(part))
            add(sid, tid, "mix")

    # --- guides (embed raw markdown) ---
    guides = {}
    titles = {
        "dj_harmonic_mixing_guide.md": "Harmonic Mixing & Camelot",
        "dj_set_building_guide.md": "Set Building — Energy Arc",
        "dj_fx_and_loop_settings.md": "FX & Loop Settings",
        "dj_live_performance_playbook.md": "Live Performance Playbook",
        "edm_dataset_sources_and_method.md": "Sources & Method",
    }
    for fn in GUIDES:
        p = os.path.join(HERE, fn)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                guides[titles.get(fn, fn)] = f.read()

    payload = {
        "meta": {
            "genres": sum(1 for n in nodes if n["level"] == "Genre"),
            "subgenres": sum(1 for n in nodes if n["level"] == "Subgenre"),
            "total": len(nodes),
            "links": len(links),
            "columns": len(rows[0]) - 1,
        },
        "families": [{"name": f, "colour": fam_colour[f]} for f in families],
        "nodes": nodes,
        "links": links,
        "guides": guides,
    }

    os.makedirs(ASSETS, exist_ok=True)
    out = os.path.join(ASSETS, "data.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED by build_data.py — do not edit by hand. */\n")
        f.write("window.DJDATA = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    kb = os.path.getsize(out) // 1024
    print(f"OK  nodes={len(nodes)}  links={len(links)}  families={n}  guides={len(guides)}")
    print(f"    wrote {out} ({kb} KB)")

if __name__ == "__main__":
    main()
