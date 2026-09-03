"""SGIS 1km grid population -> pop_grid.json [[lat, lng, pop], ...].

Reads stats CSVs (long format) and boundary SHPs (EPSG:5179) from the zip,
sums per-grid population, converts grid centroids to WGS84, and clips to
regions of interest (capital area + non-capital contrast zones).
"""
import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

import shapefile
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
ZIP = ROOT / "raw" / "sgis_grid" / "sgis_grid.zip"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

# (min_lng, min_lat, max_lng, max_lat)
BBOXES = [
    (126.3, 36.85, 127.9, 38.05),   # capital area (Seoul/Gyeonggi/Incheon)
    (127.0, 36.35, 127.65, 36.75),  # Sejong / N-Chungnam contrast
    (128.3, 35.75, 129.2, 36.25),   # Gyeongbuk contrast (Gumi/Pohang belt)
    (126.6, 34.95, 127.5, 35.45),   # Jeonnam contrast (Naju/Gwangju belt)
]

TOTAL_ITEM = "to_in_001"  # verified below; fallback: sum of in_age_* buckets


def in_bbox(lng: float, lat: float) -> bool:
    return any(lo <= lng <= hi and la <= lat <= ha for lo, la, hi, ha in BBOXES)


def main() -> None:
    tf = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)
    zf = zipfile.ZipFile(ZIP)
    names = zf.namelist()

    stat_csvs = [n for n in names if "1. 통계" in n and n.endswith("_1K.csv")]
    items_seen: set[str] = set()
    pop: dict[str, float] = defaultdict(float)
    has_total: dict[str, bool] = {}
    for n in stat_csvs:
        with zf.open(n) as f:
            text = io.TextIOWrapper(f, encoding="cp949", errors="replace")
            for row in csv.DictReader(text):
                item = row.get("통계항목", "")
                items_seen.add(item)
                gid = row.get("격자코드", "")
                try:
                    val = float(row.get("통계값", "") or 0)
                except ValueError:
                    continue
                if item == TOTAL_ITEM:
                    pop[gid] = val
                    has_total[gid] = True
                elif item.startswith("in_age_") and not has_total.get(gid):
                    pop[gid] += val

    print(f"stat files: {len(stat_csvs)}, grids with pop: {len(pop)}")
    print(f"items sample: {sorted(items_seen)[:12]}")
    print(f"grids with explicit total item: {sum(has_total.values())}")

    shp_names = [n for n in names if "2. 경계" in n and n.endswith("_1K.shp")]
    out_rows: list[list[float]] = []
    matched = 0
    for shp_name in shp_names:
        base = shp_name[:-4]
        shp = io.BytesIO(zf.read(base + ".shp"))
        dbf = io.BytesIO(zf.read(base + ".dbf"))
        shx = io.BytesIO(zf.read(base + ".shx"))
        r = shapefile.Reader(shp=shp, dbf=dbf, shx=shx)
        fields = [f[0] for f in r.fields[1:]]
        gid_idx = next((i for i, f in enumerate(fields) if "GRID" in f.upper() or "격자" in f), 0)
        for sr in r.iterShapeRecords():
            gid = str(sr.record[gid_idx])
            p = pop.get(gid, 0)
            if p <= 0:
                continue
            xs = [pt[0] for pt in sr.shape.points]
            ys = [pt[1] for pt in sr.shape.points]
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            lng, lat = tf.transform(cx, cy)
            matched += 1
            if in_bbox(lng, lat):
                out_rows.append([round(lat, 5), round(lng, 5), int(p)])

    print(f"boundary files: {len(shp_names)}, grids matched to pop: {matched}, kept in bbox: {len(out_rows)}")
    (OUT / "pop_grid.json").write_text(json.dumps(out_rows), encoding="utf-8")
    if out_rows:
        print(f"sample: {out_rows[:3]}")


if __name__ == "__main__":
    main()
