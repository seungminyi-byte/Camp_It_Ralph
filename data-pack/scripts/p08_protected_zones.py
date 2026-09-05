"""Build the 법정 보호·규제구역 polygon bundle (out/protected_zones.json) from two data.go.kr shapefiles.

Sources (both 이용허락범위 제한 없음, anonymous download via `fetch_raw.py protected`):
  15017313 국립공원공단_국립공원 공원경계  raw/protected/knps_park_boundary.zip
           BSI_NPK_BBNDR.shp: 23 parks, EPSG:5179 (.prj), cp949 DBF, fields NPK_CD / NPK_NM / CRT_YMD (2024-12-30)
  15127921 국립공원공단_한국보호지역 데이터 (KDPA) raw/protected/kdpa_2016.zip
           wdpa_kor_poly_2016.shp: 1,516 polygons, EPSG:4326, UTF-8 DBF, 2016-12-31 snapshot; DESIG = designation
           type in Korean (25 values), ORIG_NAME = Korean name, MARINE 0/1/2.

Usage:
  p08_protected_zones.py                 build out/protected_zones.json
  p08_protected_zones.py --probe         print members / CRS / encoding / DESIG counts, write nothing
  options: --tolerance-m 30  --decimals 5  --max-mb 3.5

Needs pyshp + pyproj (same as p03). Without them, or without the raw zips, the script warns and keeps the existing
output so build_all.py still passes where only the committed data exists. Python 3.9 compatible.

Output: zones with closed [lat, lng] rings. Every part of a shape is kept (outer rings and holes alike) because the
app tests a point with the even-odd rule over all rings, so winding order does not matter. Rings are simplified with
Douglas-Peucker at ~30 m and rounded to 5 decimals (~1 m). Types are normalised to the keys of
constants.scoring.restriction.types (TYPE_ALIASES below); KDPA's own 국립공원 rows are dropped in favour of the
fresher park-boundary file, and unmapped designations are counted, not silently kept.
"""
from __future__ import annotations

import io
import json
import math
import sys
import time
import zipfile
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "protected"
OUT = ROOT / "out"
CURATED = ROOT / "curated"
TARGET = OUT / "protected_zones.json"

PARK_ZIP = RAW / "knps_park_boundary.zip"
KDPA_ZIP = RAW / "kdpa_2016.zip"
PARK_URL = "https://www.data.go.kr/data/15017313/fileData.do"
KDPA_URL = "https://www.data.go.kr/data/15127921/fileData.do"

TOLERANCE_M = 30.0
DECIMALS = 5
MAX_MB = 3.5
# Size control ladder: (tolerance m for prohibited types, for conditional types, decimals, drop conditional types).
# Conditional zones (수변구역, 생물권보전지역 …) are wide bands, so they tolerate twice the simplification.
ESCALATION = [(30.0, 60.0, 5, False), (50.0, 100.0, 5, False), (80.0, 160.0, 5, False), (80.0, 160.0, 4, False), (80.0, 160.0, 4, True)]

M_PER_DEG_LAT = 110574.0
M_PER_DEG_LNG_EQ = 111320.0

# KDPA DESIG -> canonical type (a key of constants.scoring.restriction.types). Data plumbing, not scoring.
TYPE_ALIASES = {
    "도립공원": "도립공원",
    "군립공원": "군립공원",
    "생태경관보전지역": "생태·경관보전지역",
    "시_도생태경관보전지역": "생태·경관보전지역",
    "습지보호지역": "습지보호지역",
    "습지보호지역-갯벌": "습지보호지역",
    "시_도습지보호지역": "습지보호지역",
    "야생생물특별보호구역": "야생생물특별보호구역",
    "야생생물보호구역": "야생생물보호구역",
    "특정도서": "특정도서",
    "백두대간보호지역": "백두대간보호지역",
    "산림유전자원보호림": "산림유전자원보호구역",
    "천연기념물": "천연기념물·명승 지정구역",
    "명승": "천연기념물·명승 지정구역",
    "천연보호구역": "천연기념물·명승 지정구역",
    "해양보호구역": "해양보호구역",
    "해양보호구역(해양생물)": "해양보호구역",
    "환경보전해역": "환경보전해역",
    "상수원보호구역": "상수원보호구역",
    "수변구역": "수변구역",
    "Ramsar Site, Wetland of International Importance": "람사르 등록습지",
    "생물권보전지역": "생물권보전지역",
    "World Heritage Site": "세계유산",
    "도시자연공원구역": "도시자연공원구역",
}
# Parks come from 15017313 (23 parks, 2024-12-30); the 2016 KDPA copy (22) would only duplicate them.
SKIP_TYPES = {"국립공원"}

SPOT_CHECKS = [
    ("북한산", 37.66, 126.98), ("지리산", 35.34, 127.73), ("설악산", 38.12, 128.47),
    ("팔당 (상수원)", 37.52, 127.30), ("서해", 37.4, 126.2), ("여의도", 37.5285, 126.9327),
]


class ShpEntry:
    def __init__(self, name, shp, dbf, shx, prj, cpg):
        self.name, self.shp, self.dbf, self.shx, self.prj, self.cpg = name, shp, dbf, shx, prj, cpg


def find_shapefiles(zip_path: Path):
    """Every .shp inside the zip (nested zips included) with its sidecar files."""
    out = []

    def walk(zf: zipfile.ZipFile, prefix: str):
        names = zf.namelist()
        lower = {n.lower(): n for n in names}
        for n in names:
            if n.lower().endswith(".zip"):
                walk(zipfile.ZipFile(io.BytesIO(zf.read(n))), prefix + n + "!")
            if not n.lower().endswith(".shp"):
                continue
            base = n[:-4].lower()

            def side(ext):
                real = lower.get(base + ext)
                return zf.read(real) if real else None

            dbf, shx = side(".dbf"), side(".shx")
            if dbf is None or shx is None:
                print("  skip {} (missing dbf/shx)".format(n))
                continue
            prj = side(".prj")
            cpg = side(".cpg")
            out.append(ShpEntry(
                prefix + n, zf.read(n), dbf, shx,
                prj.decode("utf-8", "ignore") if prj else None,
                cpg.decode("ascii", "ignore").strip() if cpg else None,
            ))

    walk(zipfile.ZipFile(zip_path), "")
    return out


def open_reader(entry: ShpEntry):
    """shapefile.Reader with the first encoding that decodes every record (cpg -> utf-8 -> cp949)."""
    import shapefile

    candidates = []
    if entry.cpg:
        candidates.append(entry.cpg.lower().replace("euc-kr", "cp949"))
    candidates += ["utf-8", "cp949"]
    last = None
    for enc in candidates:
        try:
            r = shapefile.Reader(shp=io.BytesIO(entry.shp), dbf=io.BytesIO(entry.dbf),
                                 shx=io.BytesIO(entry.shx), encoding=enc)
            for i in range(len(r)):
                r.record(i)
            return r, enc
        except Exception as e:  # noqa: BLE001 - try the next encoding
            last = e
    raise RuntimeError("{}: no encoding decodes the DBF ({})".format(entry.name, last))


def make_transformer(entry: ShpEntry, sample_xy):
    """Return (to_lonlat callable or None, description). Geographic input passes through unchanged."""
    from pyproj import CRS, Transformer

    crs = None
    if entry.prj:
        try:
            crs = CRS.from_wkt(entry.prj)
        except Exception as e:  # noqa: BLE001
            print("  {}: .prj unreadable ({}), falling back to magnitude heuristic".format(entry.name, e))
    if crs is None:
        x, y = sample_xy
        if abs(x) <= 180 and abs(y) <= 90:
            return None, "EPSG:4326 (no .prj, degrees)"
        if 700000 <= x <= 1400000 and 1200000 <= y <= 2200000:
            crs = CRS.from_epsg(5179)
        elif 100000 <= x <= 400000 and 300000 <= y <= 800000:
            crs = CRS.from_epsg(5186)
        else:
            raise RuntimeError("{}: cannot guess CRS from sample {}".format(entry.name, sample_xy))
    if crs.is_geographic:
        return None, "{} (geographic)".format(crs.name)
    tf = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    return tf.transform, "{} (EPSG:{}) -> EPSG:4326".format(crs.name, crs.to_epsg())


def dp_simplify(pts, tol_m, kx, ky):
    """Iterative Douglas-Peucker on [x=lng, y=lat] points in a local metric frame; keeps first/last."""
    n = len(pts)
    if n <= 4:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    tol2 = tol_m * tol_m
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = pts[a]
        dx = (pts[b][0] - ax) * kx
        dy = (pts[b][1] - ay) * ky
        seg2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px = (pts[i][0] - ax) * kx
            py = (pts[i][1] - ay) * ky
            if seg2 > 0.0:
                t = (px * dx + py * dy) / seg2
                if t < 0.0:
                    t = 0.0
                elif t > 1.0:
                    t = 1.0
                ex, ey = px - t * dx, py - t * dy
                d2 = ex * ex + ey * ey
            else:
                d2 = px * px + py * py
            if d2 > best:
                best, idx = d2, i
        if best > tol2:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]


def box_ring(seg):
    """A ring Douglas-Peucker collapsed (islet, 노거수 보호구역): keep its four extreme vertices instead."""
    south = min(seg, key=lambda p: p[1])
    east = max(seg, key=lambda p: p[0])
    north = max(seg, key=lambda p: p[1])
    west = min(seg, key=lambda p: p[0])
    return [south, east, north, west, south]


def round_ring(simp, decimals):
    ring = []
    for x, y in simp:
        pt = [round(y, decimals), round(x, decimals)]
        if not ring or ring[-1] != pt:
            ring.append(pt)
    if ring and ring[0] != ring[-1]:
        ring.append(list(ring[0]))
    return ring


def build_rings(shape, to_lonlat, tol_m, decimals, dropped):
    """Split a shape into closed [lat, lng] rings, simplified and rounded. Returns (rings, raw_points)."""
    pts = shape.points
    parts = list(shape.parts) + [len(pts)]
    rings = []
    for a, b in zip(parts, parts[1:]):
        seg = pts[a:b]
        if to_lonlat is not None:
            seg = [to_lonlat(x, y) for x, y in seg]
        if len(seg) < 4:
            dropped["degenerateRings"] += 1
            continue
        lat0 = sum(p[1] for p in seg) / len(seg)
        kx = M_PER_DEG_LNG_EQ * max(0.2, math.cos(math.radians(lat0)))
        ring = round_ring(dp_simplify(seg, tol_m, kx, M_PER_DEG_LAT), decimals)
        if len(ring) < 4:
            # Smaller than the tolerance: keep a quadrilateral so tiny zones still register, drop only true points.
            ring = round_ring(box_ring(seg), decimals)
            if len(ring) < 4:
                dropped["degenerateRings"] += 1
                continue
            dropped["tinyRingsBoxed"] += 1
        rings.append(ring)
    return rings, len(pts)


def bbox_of(rings):
    lats = [p[0] for r in rings for p in r]
    lngs = [p[1] for r in rings for p in r]
    return [min(lats), min(lngs), max(lats), max(lngs)]


def point_in_ring(lat, lng, ring):
    """Even-odd ray cast; identical to pointInRing() in prototype/src/scoring/restriction.ts."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > lat) != (yj > lat):
            x = xi + (lat - yi) * (xj - xi) / (yj - yi)
            if lng < x:
                inside = not inside
        j = i
    return inside


def point_in_zone(zone, lat, lng):
    b = zone["bbox"]
    if lat < b[0] or lat > b[2] or lng < b[1] or lng > b[3]:
        return False
    inside = False
    for ring in zone["rings"]:
        if point_in_ring(lat, lng, ring):
            inside = not inside
    return inside


def load_types():
    cfg = json.loads((CURATED / "constants.json").read_text(encoding="utf-8"))["scoring"]["restriction"]
    return cfg["types"]


def probe(zip_path: Path):
    print("\n########## {}".format(zip_path))
    for i in zipfile.ZipFile(zip_path).infolist():
        print("   {:>10,}  {}".format(i.file_size, i.filename.encode("cp437", "ignore").decode("cp949", "ignore")))
    for entry in find_shapefiles(zip_path):
        r, enc = open_reader(entry)
        fields = [f[0] for f in r.fields[1:]]
        first = r.shape(0).points[0] if len(r) else (0, 0)
        _, crs_desc = make_transformer(entry, first)
        print("\n== {}\n   shapeType={} records={} encoding={} cpg={}\n   crs: {}\n   fields: {}\n   bbox: {}".format(
            entry.name, r.shapeType, len(r), enc, entry.cpg, crs_desc, fields, [round(v, 4) for v in r.bbox]))
        counters = {f: Counter() for f in fields}
        points, parts = 0, Counter()
        for sr in r.iterShapeRecords():
            points += len(sr.shape.points)
            parts[len(sr.shape.parts)] += 1
            for f, v in zip(fields, sr.record):
                if isinstance(v, str):
                    counters[f][v] += 1
        print("   points={:,} parts histogram={}".format(points, parts.most_common(6)))
        for f in fields:
            c = counters[f]
            if 0 < len(c) <= 80:
                print("   [{}] {} distinct: {}".format(f, len(c), ", ".join("{}×{}".format(k, v) for k, v in c.most_common())))
            elif len(c) > 80:
                print("   [{}] {} distinct, e.g. {}".format(f, len(c), list(c)[:5]))
        for i in range(min(2, len(r))):
            print("   sample:", dict(zip(fields, r.record(i))))


def collect_zones(types, tol_m, tol_cond_m, decimals, drop_conditional):
    dropped = Counter()
    zones = []
    per_type_source = {}

    parks = find_shapefiles(PARK_ZIP)
    if not parks:
        raise RuntimeError("no .shp in {}".format(PARK_ZIP))
    r, enc = open_reader(parks[0])
    fields = [f[0] for f in r.fields[1:]]
    to_lonlat, crs_desc = make_transformer(parks[0], r.shape(0).points[0])
    print("parks: {} records, {}, {}".format(len(r), enc, crs_desc))
    name_idx = fields.index("NPK_NM") if "NPK_NM" in fields else 0
    for i, sr in enumerate(r.iterShapeRecords()):
        rings, _ = build_rings(sr.shape, to_lonlat, tol_m, decimals, dropped)
        if not rings:
            dropped["emptyZones"] += 1
            continue
        zones.append(OrderedDict([
            ("id", "np-{:04d}".format(i + 1)), ("type", "국립공원"), ("name", str(sr.record[name_idx]).strip()),
            ("marine", 0), ("bbox", bbox_of(rings)), ("rings", rings),
        ]))
    per_type_source["국립공원"] = "15017313"

    kdpa = find_shapefiles(KDPA_ZIP)
    if not kdpa:
        raise RuntimeError("no .shp in {}".format(KDPA_ZIP))
    r, enc = open_reader(kdpa[0])
    fields = [f[0] for f in r.fields[1:]]
    to_lonlat, crs_desc = make_transformer(kdpa[0], r.shape(0).points[0])
    print("kdpa: {} records, {}, {}".format(len(r), enc, crs_desc))
    fi = {f: k for k, f in enumerate(fields)}
    for f in ("DESIG", "ORIG_NAME", "WDPA_PID"):
        if f not in fi:
            raise RuntimeError("KDPA field {} missing; fields are {}".format(f, fields))
    t0 = time.time()
    for k, sr in enumerate(r.iterShapeRecords()):
        rec = sr.record
        desig = str(rec[fi["DESIG"]]).strip()
        if desig in SKIP_TYPES:
            dropped["kdpaNationalParkDuplicates"] += 1
            continue
        canonical = TYPE_ALIASES.get(desig)
        if canonical is None or canonical not in types:
            dropped["unmapped:" + desig] += 1
            continue
        conditional = types[canonical]["level"] == "conditional"
        if drop_conditional and conditional:
            dropped["conditionalDropped:" + canonical] += 1
            continue
        rings, _ = build_rings(sr.shape, to_lonlat, tol_cond_m if conditional else tol_m, decimals, dropped)
        if not rings:
            dropped["emptyZones"] += 1
            continue
        name = str(rec[fi["ORIG_NAME"]]).strip()
        if not name and "NAME" in fi:
            name = str(rec[fi["NAME"]]).strip()
        marine = 0
        if "MARINE" in fi:
            try:
                marine = int(str(rec[fi["MARINE"]]).strip() or 0)
            except ValueError:
                marine = 0
        zones.append(OrderedDict([
            ("id", "kd-{}".format(int(float(rec[fi["WDPA_PID"]])))), ("type", canonical), ("name", name),
            ("marine", marine), ("bbox", bbox_of(rings)), ("rings", rings),
        ]))
        per_type_source.setdefault(canonical, "15127921")
        if (k + 1) % 300 == 0:
            print("  kdpa {}/{} ({:.0f}s)".format(k + 1, len(r), time.time() - t0))
    zones.sort(key=lambda z: (z["type"], z["name"], z["id"]))
    return zones, dropped, per_type_source


def serialize(zones, dropped, per_type_source, tol_m, tol_cond_m, decimals, drop_conditional, size_step):
    stats = OrderedDict()
    for z in zones:
        s = stats.setdefault(z["type"], OrderedDict([("zones", 0), ("vertices", 0), ("source", per_type_source.get(z["type"], ""))]))
        s["zones"] += 1
        s["vertices"] += sum(len(r) for r in z["rings"])
    doc = OrderedDict([
        ("source", "국립공원공단 국립공원 공원경계(15017313, 2024-12-30) + 국립공원공단 한국보호지역 데이터 KDPA(15127921, 2016-12-31 기준)"),
        ("sourceUrls", [PARK_URL, KDPA_URL]),
        ("license", "공공데이터포털 이용허락범위 제한 없음 (두 데이터셋 모두)"),
        ("builtAt", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        ("asOf", OrderedDict([("nationalParks", "2024-12-30"), ("kdpa", "2016-12-31")])),
        ("method", OrderedDict([
            ("crs", "EPSG:4326"), ("simplifyToleranceM", OrderedDict([("prohibited", tol_m), ("conditional", tol_cond_m)])), ("coordDecimals", decimals),
            ("droppedConditionalTypes", drop_conditional), ("sizeControlStep", size_step),
            ("rings", "[lat,lng] pairs, closed, every part kept (outer rings and holes), even-odd point-in-polygon"),
        ])),
        ("types", stats),
        ("dropped", OrderedDict(sorted(dropped.items()))),
        ("zones", zones),
    ])
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":"))


def keep_existing() -> int:
    if TARGET.exists():
        print("Keeping the existing {}".format(TARGET.name))
        return 0
    print("FAIL: no packages/raw data and no previous output")
    return 1


def main(argv) -> int:
    if "--probe" in argv:
        try:
            import shapefile  # noqa: F401
            import pyproj  # noqa: F401
        except ImportError as e:
            print("FAIL: {} (pip install pyshp pyproj)".format(e))
            return 1
        for z in (PARK_ZIP, KDPA_ZIP):
            if z.exists():
                probe(z)
            else:
                print("missing {} (run fetch_raw.py protected)".format(z))
        return 0

    def opt(name, default, cast):
        if name in argv:
            return cast(argv[argv.index(name) + 1])
        return default

    tol_m = opt("--tolerance-m", TOLERANCE_M, float)
    decimals = opt("--decimals", DECIMALS, int)
    max_mb = opt("--max-mb", MAX_MB, float)

    try:
        import shapefile  # noqa: F401
        import pyproj  # noqa: F401
    except ImportError as e:
        print("WARN: {} — pyshp/pyproj not installed.".format(e))
        return keep_existing()
    if not (PARK_ZIP.exists() and KDPA_ZIP.exists()):
        print("WARN: raw zips missing under {} (run fetch_raw.py protected).".format(RAW))
        return keep_existing()

    types = load_types()
    OUT.mkdir(exist_ok=True)
    ladder = [(tol_m, tol_m * 2, decimals, False)] + [s for s in ESCALATION if s[0] > tol_m or s[2] < decimals or s[3]]
    text = None
    t_all = time.time()
    for step, (tol, tol_cond, dec, drop_cond) in enumerate(ladder):
        print("\n== build: tolerance {} m (conditional {} m), {} decimals, drop conditional={}".format(tol, tol_cond, dec, drop_cond))
        zones, dropped, per_type_source = collect_zones(types, tol, tol_cond, dec, drop_cond)
        text = serialize(zones, dropped, per_type_source, tol, tol_cond, dec, drop_cond, step)
        mb = len(text.encode("utf-8")) / 1e6
        print("   {} zones, {:.2f} MB".format(len(zones), mb))
        if mb <= max_mb:
            break
        print("   over {} MB budget, escalating".format(max_mb))
    assert text is not None
    TARGET.write_text(text, encoding="utf-8")
    doc = json.loads(text)
    print("\nwrote {} ({:.2f} MB) in {:.0f}s".format(TARGET.name, TARGET.stat().st_size / 1e6, time.time() - t_all))
    for t, s in doc["types"].items():
        print("  {:20s} zones {:5d}  vertices {:8,}".format(t, s["zones"], s["vertices"]))
    print("dropped:", dict(doc["dropped"]))

    print("\nspot checks:")
    points = list(SPOT_CHECKS)
    scen_path = CURATED / "scenarios.json"
    if scen_path.exists():
        for sc in json.loads(scen_path.read_text(encoding="utf-8"))["scenarios"]:
            points.append((sc["id"], sc["lat"], sc["lng"]))
    for label, lat, lng in points:
        hits = ["{}({})".format(z["name"], z["type"]) for z in doc["zones"] if point_in_zone(z, lat, lng)]
        print("  {:22s} {}".format(label, hits or "-"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
