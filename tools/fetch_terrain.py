#!/usr/bin/env python3
"""Fetch and stitch the Mount Lu terrain used by the flythrough (run once; needs Pillow).

    python3 tools/fetch_terrain.py [--cache DIR]

Sources (credited on the About page):
- Elevation: AWS Open Data "Terrain Tiles" (Terrarium PNG, zoom 12); SRTM / GMTED2010
  terrain data courtesy of the U.S. Geological Survey.
- Imagery: EOxCloudless Sentinel-2 cloudless 2024 (zoom 14) by EOX IT Services GmbH,
  CC BY-NC-SA 4.0 (contains modified Copernicus Sentinel data 2024).

Writes public/terrain/height.png (Terrarium-encoded, lossless), satellite-4096.jpg,
satellite-2048.jpg and terrain.json (bounds and elevation range).
"""

import argparse
import io
import json
import math
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "terrain"

# Zoom-12 tile block around Mount Lu, Jiujiang and the west shore of Poyang Lake.
Z_DEM, X0, X1, Y0, Y1 = 12, 3366, 3369, 1693, 1697   # inclusive
Z_IMG = 14
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
IMG_URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
UA = "bai-juyi-friends student project (one-off fetch)"


def fetch(url, cache):
    path = cache / url.split("://", 1)[1].replace("/", "_")
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    path.write_bytes(r.read())
                break
            except OSError:
                if attempt == 4:
                    raise
                time.sleep(2 * (attempt + 1))
        time.sleep(0.05)
    return Image.open(io.BytesIO(path.read_bytes()))


def tile_lon(x, z):
    return x / 2 ** z * 360 - 180


def tile_lat(y, z):
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** z))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=ROOT / "tools" / ".cache")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    nx, ny = X1 - X0 + 1, Y1 - Y0 + 1
    dem = Image.new("RGB", (nx * 256, ny * 256))
    for x in range(X0, X1 + 1):
        for y in range(Y0, Y1 + 1):
            dem.paste(fetch(DEM_URL.format(z=Z_DEM, x=x, y=y), args.cache).convert("RGB"),
                      ((x - X0) * 256, (y - Y0) * 256))
    dem.save(OUT / "height.png", optimize=True)

    k = 2 ** (Z_IMG - Z_DEM)
    img = Image.new("RGB", (nx * k * 256, ny * k * 256))
    n = 0
    for x in range(X0 * k, (X1 + 1) * k):
        for y in range(Y0 * k, (Y1 + 1) * k):
            img.paste(fetch(IMG_URL.format(z=Z_IMG, x=x, y=y), args.cache).convert("RGB"),
                      ((x - X0 * k) * 256, (y - Y0 * k) * 256))
            n += 1
    print("imagery tiles:", n, "mosaic", img.size)
    for h in (4096, 2048):
        w = round(img.width * h / img.height)
        img.resize((w, h), Image.LANCZOS).save(OUT / ("satellite-%d.jpg" % h), quality=86, optimize=True, progressive=True)

    px = dem.load()
    heights = [px[i, j][0] * 256 + px[i, j][1] + px[i, j][2] / 256 - 32768
               for j in range(dem.height) for i in range(dem.width)]
    lat_c = (tile_lat(Y0, Z_DEM) + tile_lat(Y1 + 1, Z_DEM)) / 2
    tile_m = 40075016.686 * math.cos(math.radians(lat_c)) / 2 ** Z_DEM  # ground metres per tile
    meta = {
        "west": tile_lon(X0, Z_DEM), "east": tile_lon(X1 + 1, Z_DEM),
        "north": tile_lat(Y0, Z_DEM), "south": tile_lat(Y1 + 1, Z_DEM),
        "widthMetres": round(tile_m * nx), "heightMetres": round(tile_m * ny),
        "minElevation": round(min(heights), 1), "maxElevation": round(max(heights), 1),
        "demSize": [dem.width, dem.height],
        "credits": {
            "elevation": "Terrain Tiles (AWS Open Data); SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey",
            "imagery": "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0",
        },
    }
    (OUT / "terrain.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
