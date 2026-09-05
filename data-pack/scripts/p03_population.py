"""SGIS 1km grid population -> pop_grid.json [[lat, lng, pop], ...].

Reads stats CSVs (long format) and boundary SHPs (EPSG:5179) from the zip,
sums per-grid population and converts grid centroids to WGS84. Every populated
cell nationwide is kept: an earlier bbox clip (capital area + contrast zones)
silently zeroed the 주거 인접 deduction for 부산·울산·제주·강원 동부 and more.
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

TOTAL_ITEM = "to_in_001"  # verified below; fallback: sum of in_age_* buckets


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
            out_rows.append([round(lat, 5), round(lng, 5), int(p)])

    print(f"boundary files: {len(shp_names)}, grids matched to pop: {matched}, kept: {len(out_rows)}")
    (OUT / "pop_grid.json").write_text(json.dumps(out_rows), encoding="utf-8")
    if out_rows:
        lats = [r[0] for r in out_rows]
        lngs = [r[1] for r in out_rows]
        print(f"sample: {out_rows[:3]}")
        print(f"bounds: lat {min(lats)}~{max(lats)}, lng {min(lngs)}~{max(lngs)}, total pop {sum(r[2] for r in out_rows):,}")


if __name__ == "__main__":
    main()
