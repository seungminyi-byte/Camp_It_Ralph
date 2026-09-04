"""Build the terrain grid (slope + land/water share) from Mapzen Terrain Tiles (skadi HGT).

Source: AWS Open Data "Terrain Tiles" — https://registry.opendata.aws/terrain-tiles/
  skadi/{N|S}yy/{N|S}yy{E|W}xxx.hgt.gz = 1 degree tile, 1 arc-second, 3601x3601 big-endian int16,
  row 0 = north edge, void = -32768. Land comes from SRTM 30m (2000-02 acquisition), water bodies
  are masked out by SWBD so the ocean shows ETOPO1 bathymetry (negative metres).

No API key and no third-party package: stdlib only, Python 3.9 compatible.

Output: data-pack/out/terrain_grid.json — four base64 uint8 planes on a 0.01 degree grid
(landPct, slopeP50Deg, steepPct, elevMean10m; 255 = nodata), row-major from the SW corner.

Caveat carried into the app: reclaimed land built after 2000 (Songdo, Saemangeum, Sihwa) reads as
water here, and inland lakes read as land. The app corrects reclaimed land with the VWorld zoning
lookup and constants.scoring.terrain.reclaimedOverrides.
"""
import base64
import gzip
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from array import array
from operator import add, mul, sub
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
RAW = ROOT / "raw" / "terrain"

BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"
TILE_LATS = range(33, 39)          # N33..N38
TILE_LNGS = range(125, 130)        # E125..E129

LAT0, LNG0, STEP = 33.0, 125.5, 0.01
ROWS, COLS = 570, 420              # 33.0~38.7 N, 125.5~129.7 E
SUB = 3                            # sub-sample 1" -> 3" (1201 x 1201 per tile)
CELL = 12                          # 3" samples per 0.01 degree cell edge (144 per cell)
CELLS_PER_TILE = 100               # 1 degree / 0.01
STEEP_DEG = 15.0                   # "steep" threshold for the steepPct plane
NODATA = 255
ARCSEC_M = 30.87                   # metres per arc-second of latitude
VOID = -32768
TIMEOUT_S = 300
RETRIES = 3


def tile_name(lat: int, lng: int) -> str:
    return "N{:02d}E{:03d}".format(lat, lng)


def download(lat: int, lng: int):
    """Return raw .hgt bytes for a tile, or None when it cannot be fetched."""
    name = tile_name(lat, lng)
    cache = RAW / (name + ".hgt.gz")
    if not cache.exists():
        url = "{}/N{:02d}/{}.hgt.gz".format(BASE_URL, lat, name)
        for attempt in range(1, RETRIES + 1):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "grand-site-dc/1.0"})
                with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
                    blob = res.read()
                cache.write_bytes(blob)
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    print("  {} missing upstream (404)".format(name))
                    return None
                print("  {} HTTP {} (attempt {}/{})".format(name, e.code, attempt, RETRIES))
            except Exception as e:  # noqa: BLE001 - network failures are reported, not raised
                print("  {} {} (attempt {}/{})".format(name, e, attempt, RETRIES))
            if attempt == RETRIES:
                return None
            time.sleep(2 * attempt)
    try:
        return gzip.decompress(cache.read_bytes())
    except Exception as e:  # noqa: BLE001 - a truncated cache file should not kill the run
        print("  {} unreadable ({}) - removing cache".format(name, e))
        cache.unlink(missing_ok=True)
        return None


def decode(blob: bytes) -> array:
    a = array("h")
    a.frombytes(blob)
    if len(a) != 3601 * 3601:
        raise ValueError("unexpected HGT length {}".format(len(a)))
    if sys.byteorder == "little":
        a.byteswap()  # HGT is big-endian
    return a


def process_tile(lat: int, lng: int, a: array, planes):
    """Fold one tile into the output planes. Slope uses a central difference on the 3" sub-sample."""
    land_pct, slope_p50, steep_pct, elev10 = planes
    rows = [a[r * 3601:(r + 1) * 3601:SUB] for r in range(0, 3601, SUB)]  # 1201 x 1201

    kx = 1.0 / (2.0 * ARCSEC_M * SUB * max(0.2, math.cos(math.radians(lat + 0.5))))
    ky = 1.0 / (2.0 * ARCSEC_M * SUB)
    kx2, ky2 = kx * kx, ky * ky

    slope_buf = [[] for _ in range(CELLS_PER_TILE * CELLS_PER_TILE)]
    land_cnt = [0] * (CELLS_PER_TILE * CELLS_PER_TILE)
    elev_sum = [0.0] * (CELLS_PER_TILE * CELLS_PER_TILE)
    samp_cnt = [0] * (CELLS_PER_TILE * CELLS_PER_TILE)

    degrees, atan, sqrt = math.degrees, math.atan, math.sqrt
    for i in range(1200):                       # sample rows 0..1199 -> 100 cell rows of 12
        row = rows[i]
        cn = i // CELL                          # cell row counted from the north edge
        base = cn * CELLS_PER_TILE
        # elevation / land share over the full 12-sample span
        for cj in range(CELLS_PER_TILE):
            seg = row[cj * CELL:(cj + 1) * CELL]
            idx = base + cj
            for z in seg:
                if z == VOID:
                    continue
                samp_cnt[idx] += 1
                if z > 0:
                    land_cnt[idx] += 1
                    elev_sum[idx] += z
        # slope needs neighbours on both sides, so skip the tile's outermost rows
        if i == 0 or i >= 1199:
            continue
        gx = list(map(sub, row[2:], row[:-2]))                      # d/dlng at columns 1..1199
        gy = list(map(sub, rows[i + 1][1:-1], rows[i - 1][1:-1]))   # d/dlat at the same columns
        s2 = map(add, map(kx2.__mul__, map(mul, gx, gx)), map(ky2.__mul__, map(mul, gy, gy)))
        deg = [degrees(atan(sqrt(v))) for v in s2]                  # deg[j] belongs to column j+1
        for cj in range(CELLS_PER_TILE):
            lo = max(0, cj * CELL - 1)
            hi = min(len(deg), (cj + 1) * CELL - 1)
            if hi > lo:
                slope_buf[base + cj].extend(deg[lo:hi])

    written = 0
    for cn in range(CELLS_PER_TILE):
        r = int(round((lat - LAT0) * 100)) + (CELLS_PER_TILE - 1 - cn)
        if r < 0 or r >= ROWS:
            continue
        for cj in range(CELLS_PER_TILE):
            c = int(round((lng - LNG0) * 100)) + cj
            if c < 0 or c >= COLS:
                continue
            idx = cn * CELLS_PER_TILE + cj
            n = samp_cnt[idx]
            if n == 0:
                continue
            out = r * COLS + c
            land = land_cnt[idx]
            land_pct[out] = min(100, int(round(100.0 * land / n)))
            elev10[out] = min(254, int(round((elev_sum[idx] / land) / 10.0))) if land else 0
            buf = slope_buf[idx]
            if buf:
                buf.sort()
                slope_p50[out] = min(254, int(round(buf[len(buf) // 2])))
                steep = sum(1 for x in buf if x >= STEEP_DEG)
                steep_pct[out] = min(100, int(round(100.0 * steep / len(buf))))
            else:
                slope_p50[out] = 0
                steep_pct[out] = 0
            written += 1
    return written


def sample_at(planes, lat: float, lng: float):
    r = int(math.floor((lat - LAT0) / STEP + 1e-9))
    c = int(math.floor((lng - LNG0) / STEP + 1e-9))
    if r < 0 or r >= ROWS or c < 0 or c >= COLS:
        return None
    i = r * COLS + c
    if planes[0][i] == NODATA:
        return None
    return {"landPct": planes[0][i], "slopeP50Deg": planes[1][i],
            "steepPct": planes[2][i], "elevM": planes[3][i] * 10}


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    size = ROWS * COLS
    planes = [bytearray([NODATA]) * size for _ in range(4)]
    for p in planes:
        for i in range(size):
            p[i] = NODATA

    requested, loaded, missing = 0, 0, []
    t_all = time.time()
    for lat in TILE_LATS:
        for lng in TILE_LNGS:
            requested += 1
            name = tile_name(lat, lng)
            t0 = time.time()
            blob = download(lat, lng)
            if blob is None:
                missing.append(name)
                continue
            try:
                a = decode(blob)
            except Exception as e:  # noqa: BLE001
                print("  {} decode failed: {}".format(name, e))
                missing.append(name)
                continue
            t1 = time.time()
            cells = process_tile(lat, lng, a, planes)
            loaded += 1
            print("{}: {} cells, fetch {:.1f}s, calc {:.1f}s".format(
                name, cells, t1 - t0, time.time() - t1))

    if loaded == 0:
        target = OUT / "terrain_grid.json"
        print("WARN: no terrain tiles available.")
        if target.exists():
            print("Keeping the existing {}".format(target.name))
            return 0
        print("FAIL: no tiles and no previous output")
        return 1

    stats = {"landCells": 0, "coastalCells": 0, "seaCells": 0, "nodataCells": 0}
    for v in planes[0]:
        if v == NODATA:
            stats["nodataCells"] += 1
        elif v >= 60:
            stats["landCells"] += 1
        elif v > 20:
            stats["coastalCells"] += 1
        else:
            stats["seaCells"] += 1

    doc = {
        "source": "Mapzen/Tilezen Terrain Tiles (AWS Open Data) - skadi 1\" HGT: SRTM 30m land + ETOPO1 bathymetry",
        "sourceUrl": "https://registry.opendata.aws/terrain-tiles/",
        "attribution": "SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 DOC/NOAA/NESDIS/NCEI; tiles by Mapzen/Tilezen",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "method": {"sampleArcsec": SUB, "slope": "central difference on 3\" samples, degrees",
                   "samplesPerCell": CELL * CELL, "steepThresholdDeg": STEEP_DEG},
        "grid": {"lat0": LAT0, "lng0": LNG0, "step": STEP, "rows": ROWS, "cols": COLS,
                 "origin": "sw", "order": "row-major, row 0 = lat0, col 0 = lng0"},
        "encoding": {"type": "base64-uint8", "nodata": NODATA},
        "planes": {
            "landPct": base64.b64encode(bytes(planes[0])).decode("ascii"),
            "slopeP50Deg": base64.b64encode(bytes(planes[1])).decode("ascii"),
            "steepPct": base64.b64encode(bytes(planes[2])).decode("ascii"),
            "elevMean10m": base64.b64encode(bytes(planes[3])).decode("ascii"),
        },
        "tiles": {"requested": requested, "loaded": loaded, "missing": missing},
        "stats": stats,
    }
    target = OUT / "terrain_grid.json"
    target.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    print("\nwrote {} ({:.2f} MB) in {:.0f}s".format(
        target.name, target.stat().st_size / 1e6, time.time() - t_all))
    print("tiles {}/{} loaded, missing {}".format(loaded, requested, missing or "none"))
    print("cells: land {landCells}, coastal {coastalCells}, sea {seaCells}, nodata {nodataCells}".format(**stats))
    print("\nspot checks:")
    for label, lat, lng in [
        ("goyang-deogi", 37.6851, 126.7482), ("incheon-cheongcheon", 37.5218, 126.6963),
        ("sejong-bangok", 36.4967, 127.3007), ("west sea", 37.4, 126.2),
        ("west sea south", 35.5, 126.2), ("taebaek ridge", 37.85, 128.45),
        ("songdo", 37.38, 126.65), ("saemangeum", 35.80, 126.60),
    ]:
        print("  {:22s} {}".format(label, sample_at(planes, lat, lng)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
