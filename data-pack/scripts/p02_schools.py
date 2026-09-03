"""Compact schools.json + approximate EMD centroids from school addresses.

Centroids are a key-issuance-free approximation: average of school coordinates
per (sido, sigungu, emd) parsed from lot-number addresses. Refine later with
VWorld geocoding (00_geocode_emd) once an API key is available.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

SIDO_MAP = {
    "서울특별시": "서울특별시", "부산광역시": "부산광역시", "대구광역시": "대구광역시",
    "인천광역시": "인천광역시", "광주광역시": "광주광역시", "대전광역시": "대전광역시",
    "울산광역시": "울산광역시", "세종특별자치시": "세종특별자치시", "경기도": "경기도",
    "강원특별자치도": "강원특별자치도", "강원도": "강원특별자치도",
    "충청북도": "충청북도", "충청남도": "충청남도",
    "전북특별자치도": "전북특별자치도", "전라북도": "전북특별자치도",
    "전라남도": "전라남도", "경상북도": "경상북도", "경상남도": "경상남도",
    "제주특별자치도": "제주특별자치도",
}


def parse_addr(addr: str) -> tuple[str, str, str] | None:
    toks = (addr or "").split()
    if len(toks) < 3 or toks[0] not in SIDO_MAP:
        return None
    sido = SIDO_MAP[toks[0]]
    if len(toks) >= 4 and toks[1].endswith("시") and re.fullmatch(r".+[구군]", toks[2]):
        sigungu, emd = toks[1] + toks[2], toks[3]
    else:
        sigungu, emd = toks[1], toks[2]
    if not re.search(r"[동리가읍면]$", emd):
        return None
    return sido, sigungu, emd


def main() -> None:
    with (RAW / "schools.csv").open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    schools = []
    buckets: dict[tuple[str, str, str], list[tuple[float, float]]] = {}
    for r in rows:
        if r.get("운영상태") and r["운영상태"] != "운영":
            continue
        try:
            lat, lng = float(r["위도"]), float(r["경도"])
        except (ValueError, KeyError):
            continue
        if not (33.0 <= lat <= 39.5 and 124.0 <= lng <= 132.0):
            continue
        schools.append([r["학교명"], r["학교급구분"], round(lat, 5), round(lng, 5)])
        parsed = parse_addr(r.get("소재지지번주소", ""))
        if parsed:
            buckets.setdefault(parsed, []).append((lat, lng))

    (OUT / "schools.json").write_text(json.dumps(schools, ensure_ascii=False), encoding="utf-8")
    print(f"schools: {len(schools)} active")

    centroids = []
    for (sido, sigungu, emd), pts in buckets.items():
        centroids.append({
            "sido": sido, "sigungu": sigungu, "emd": emd,
            "lat": round(sum(p[0] for p in pts) / len(pts), 5),
            "lng": round(sum(p[1] for p in pts) / len(pts), 5),
            "n": len(pts),
        })
    (OUT / "emd_centroids.json").write_text(
        json.dumps(centroids, ensure_ascii=False), encoding="utf-8")
    print(f"emd_centroids: {len(centroids)} EMDs (school-average approximation)")

    emd_power = json.loads((OUT / "emd_power.json").read_text(encoding="utf-8"))
    power_keys = {(e["sido"], e["sigungu"], e["emd"]) for e in emd_power}
    cent_keys = {(c["sido"], c["sigungu"], c["emd"]) for c in centroids}
    inter = power_keys & cent_keys
    print(f"coverage vs emd_power: {len(inter)}/{len(power_keys)} "
          f"({100 * len(inter) / max(1, len(power_keys)):.1f}%) exact-key matches")


if __name__ == "__main__":
    main()
