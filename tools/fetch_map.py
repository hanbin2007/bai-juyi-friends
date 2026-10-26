#!/usr/bin/env python3
"""Fetch the coastline, main rivers and lakes drawn on the timeline's map sheets (run once).

    python3 tools/fetch_map.py [--cache DIR]

Source (credited on the About page): Natural Earth 1:50m vector data (public domain),
https://www.naturalearthdata.com, via the natural-earth-vector repository on GitHub.
These are modern coastlines and river courses, shown for orientation only.

Writes public/map/china.json: {"coast": [{"n": name, "p": [[lon, lat], ...]}, ...], "rivers": [...], "lakes": [...]}
"""

import argparse
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "map" / "china.json"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
LAYERS = {"coast": "ne_50m_coastline.geojson", "rivers": "ne_50m_rivers_lake_centerlines.geojson", "lakes": "ne_50m_lakes.geojson"}
BOX = (100.0, 125.0, 21.0, 41.5)   # west, east, south, north
TOLERANCE = 0.025                    # degrees, for line simplification
UA = "bai-juyi-friends student project (one-off fetch)"


def fetch(name, cache):
    path = cache / name
    if not path.exists():
        req = urllib.request.Request(BASE + name, headers={"User-Agent": UA})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    path.write_bytes(r.read())
                break
            except OSError:
                if attempt == 4:
                    raise
                time.sleep(2 * (attempt + 1))
    return json.loads(path.read_text(encoding="utf-8"))


def inside(p):
    return BOX[0] <= p[0] <= BOX[1] and BOX[2] <= p[1] <= BOX[3]


def clip(line):
    """Split a line into the runs that lie inside the box."""
    runs, run = [], []
    for p in line:
        if inside(p):
            run.append(p)
        elif run:
            runs.append(run)
            run = []
    if run:
        runs.append(run)
    return [r for r in runs if len(r) > 1]


def simplify(points, tol):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    (x0, y0), (x1, y1) = points[0], points[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
    best, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = abs(dy * points[i][0] - dx * points[i][1] + x1 * y0 - y1 * x0) / norm
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [points[0], points[-1]]
    return simplify(points[:idx + 1], tol)[:-1] + simplify(points[idx:], tol)


def simplify_any(points, tol):
    """Douglas-Peucker for open lines and closed rings. A ring's ends coincide, so every distance to the
    chord would be zero: split it at the vertex farthest from the start and simplify each half. A ring that
    would shrink below three distinct vertices is kept as it was."""
    if len(points) < 4 or points[0] != points[-1]:
        return simplify(points, tol)
    x0, y0 = points[0]
    far = max(range(len(points)), key=lambda i: (points[i][0] - x0) ** 2 + (points[i][1] - y0) ** 2)
    ring = simplify(points[:far + 1], tol)[:-1] + simplify(points[far:], tol)
    return ring if len({tuple(p) for p in ring}) >= 3 else points


def lines(feature):
    g = feature["geometry"]
    if g is None:
        return []
    if g["type"] == "LineString":
        return [g["coordinates"]]
    if g["type"] == "MultiLineString":
        return g["coordinates"]
    if g["type"] == "Polygon":
        return g["coordinates"][:1]
    if g["type"] == "MultiPolygon":
        return [poly[0] for poly in g["coordinates"]]
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=ROOT / "tools" / ".cache")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    out = {}
    for key, name in LAYERS.items():
        result, names = [], set()
        for f in fetch(name, args.cache)["features"]:
            props = f.get("properties", {})
            if key == "rivers" and (props.get("scalerank") or 9) > 7:
                continue
            for line in lines(f):
                for run in clip([[round(x, 3), round(y, 3)] for x, y, *_ in line]):
                    run = simplify_any(run, TOLERANCE)
                    if len({tuple(p) for p in run}) > 1:
                        name = props.get("name") or props.get("name_en") or ""
                        result.append({"n": name, "p": run})
                        names.add(name)
        out[key] = result
        print("%s: %d lines (%s)" % (key, len(result), ", ".join(sorted(n for n in names if n))[:300]))
    out["credits"] = "Natural Earth 1:50m (public domain); modern coastline and river courses"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Wrote %s (%d bytes)" % (OUT, OUT.stat().st_size))


if __name__ == "__main__":
    main()
