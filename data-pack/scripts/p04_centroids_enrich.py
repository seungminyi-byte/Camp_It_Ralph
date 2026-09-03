"""Enrich EMD centroids using 소상공인 상가(상권)정보 (법정동명 + coords per shop).

Streams the per-sido CSVs inside sanga.zip, averages coordinates per
(시도, 시군구, 법정동), then merges with the school-based centroids
(shop-based wins on overlap — far larger sample). Rewrites emd_centroids.json
and reports coverage against emd_power.json.
"""
import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP = ROOT / "raw" / "sanga.zip"
OUT = ROOT / "out"

SIDO_RENAME = {"강원도": "강원특별자치도", "전라북도": "전북특별자치도"}


def norm(s: str) -> str:
    return (s or "").replace(" ", "").strip()


def main() -> None:
    z = zipfile.ZipFile(ZIP)
    names = [n for n in z.namelist() if n.endswith(".csv")]
    acc: dict[tuple[str, str, str], list[float]] = defaultdict(lambda: [0.0, 0.0, 0])
    rows = 0
    for n in names:
        with z.open(n) as f:
            t = io.TextIOWrapper(f, encoding="utf-8", errors="replace")
            reader = csv.DictReader(t)
            for r in reader:
                rows += 1
                sido = SIDO_RENAME.get(norm(r.get("시도명", "")), norm(r.get("시도명", "")))
                sigungu = norm(r.get("시군구명", ""))
                emd = norm(r.get("법정동명", ""))
                try:
                    lng, lat = float(r["경도"]), float(r["위도"])
                except (KeyError, ValueError):
                    continue
                if not (33.0 <= lat <= 39.5 and 124.0 <= lng <= 132.0):
                    continue
                if not (sido and sigungu and emd):
                    continue
                a = acc[(sido, sigungu, emd)]
                a[0] += lat
                a[1] += lng
                a[2] += 1
        print(f"{Path(n).name}: cumulative rows={rows} emds={len(acc)}")

    shop_cent = {
        k: (round(v[0] / v[2], 5), round(v[1] / v[2], 5), int(v[2]))
        for k, v in acc.items() if v[2] >= 1
    }

    school = json.loads((OUT / "emd_centroids.json").read_text(encoding="utf-8"))
    merged: dict[tuple[str, str, str], dict] = {}
    for c in school:
        merged[(c["sido"], c["sigungu"], c["emd"])] = {**c, "src": "school"}
    for k, (lat, lng, cnt) in shop_cent.items():
        merged[k] = {"sido": k[0], "sigungu": k[1], "emd": k[2],
                     "lat": lat, "lng": lng, "n": cnt, "src": "shop"}

    out_list = list(merged.values())
    (OUT / "emd_centroids.json").write_text(
        json.dumps(out_list, ensure_ascii=False), encoding="utf-8")
    print(f"merged centroids: {len(out_list)} "
          f"(shop {sum(1 for c in out_list if c['src'] == 'shop')}, "
          f"school-only {sum(1 for c in out_list if c['src'] == 'school')})")

    power = json.loads((OUT / "emd_power.json").read_text(encoding="utf-8"))
    pk = {(p["sido"], p["sigungu"], p["emd"]) for p in power}
    ck = set(merged)
    inter = pk & ck
    print(f"coverage vs emd_power: {len(inter)}/{len(pk)} ({100 * len(inter) / len(pk):.1f}%)")
    missing = sorted(pk - ck)
    print(f"still missing: {len(missing)}; sample: {missing[:10]}")


if __name__ == "__main__":
    main()
