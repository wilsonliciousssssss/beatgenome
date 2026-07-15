#!/usr/bin/env python3
"""
Integrity tests for the EDM GENOME data pipeline.
Run:  python tests/test_data.py   (exit 0 = all pass)

Pins the known-good shape of assets/data.js so a future CSV edit that breaks
the site (dangling links, missing columns, empty guides) fails here in seconds
instead of on the live page.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_JS = os.path.join(ROOT, "assets", "data.js")

REQUIRED_COLUMNS = [
    "Genre / Subgenre", "Parent Genre", "Level", "Typical BPM", "Camelot",
    "Energy (1-10)", "Track Structure", "Sound Design / Instrumentation",
    "Mixes Well With", "Sound Colour FX", "Beat FX", "Top Track 1",
]

def load():
    with open(DATA_JS, encoding="utf-8") as f:
        txt = f.read()
    m = re.search(r"window\.DJDATA\s*=\s*(\{.*\});", txt, re.S)
    assert m, "data.js does not contain window.DJDATA = {...};"
    return json.loads(m.group(1))

def main():
    if not os.path.exists(DATA_JS):
        print("FAIL: assets/data.js missing — run `python build_data.py` first"); return 1
    d = load()
    checks, failed = [], 0
    def ok(name, cond):
        nonlocal failed
        checks.append((name, cond))
        if not cond: failed += 1
        print(("PASS " if cond else "FAIL ") + name)

    nodes, links = d["nodes"], d["links"]
    ids = {n["id"] for n in nodes}

    ok("has 159 nodes", len(nodes) == 159)
    ok("40 genres + 119 subgenres", d["meta"]["genres"] == 40 and d["meta"]["subgenres"] == 119)
    ok("every node has name/family/colour", all(n.get("name") and n.get("family") and n.get("colour") for n in nodes))
    ok("no dangling links", all(l["s"] in ids and l["t"] in ids for l in links))
    ok("links are non-trivial (>200)", len(links) > 200)
    ok("families present (30+)", len(d["families"]) >= 30)
    ok("5 guides embedded, non-empty", len(d["guides"]) == 5 and all(v.strip() for v in d["guides"].values()))
    ok("bpm parsed to int on every node", all(isinstance(n["bpm"], int) for n in nodes))
    ok("energy within 0..10", all(0 <= n["energy"] <= 10 for n in nodes))
    # required columns exist in the embedded row data
    sample = nodes[0]["d"]
    ok("required columns present", all(c in sample for c in REQUIRED_COLUMNS))
    # ids unique
    ok("node ids unique", len(ids) == len(nodes))

    print("\n%d/%d checks passed" % (len(checks) - failed, len(checks)))
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
