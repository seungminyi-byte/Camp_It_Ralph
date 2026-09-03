"""Normalize KEPCO supply-substation CSV, KEPCO DC stats, OSM substations into app JSON."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)


def read_csv_kr(path: Path) -> list[dict]:
    for enc in ("cp949", "utf-8-sig"):
        try:
            with path.open(encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"encoding fail: {path}")


SIDO_RENAME = {
    "강원도": "강원특별자치도",
    "전라북도": "전북특별자치도",
}
SIDO_NAMES = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
    "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도",
    "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
]


def norm(s: str) -> str:
    return (s or "").replace(" ", "").strip()


def norm_sido(s: str) -> str:
    return SIDO_RENAME.get(s, s)


def norm_sigungu(sido: str, sigungu: str) -> str:
    for name in SIDO_NAMES + list(SIDO_RENAME):
        if sigungu.startswith(name):
            return sigungu[len(name):]
    return sigungu


def main() -> None:
    rows = read_csv_kr(RAW / "kepco_supply_emd.csv")
    emd: dict[str, dict] = {}
    for r in rows:
        sido = norm_sido(norm(r["시도"]))
        sigungu = norm_sigungu(sido, norm(r["시군구"]))
        dong = norm(r["읍면동"])
        key = f"{sido}|{sigungu}|{dong}"
        e = emd.setdefault(key, {"sido": sido, "sigungu": sigungu, "emd": dong, "subs": []})
        sub = norm(r.get("공급변전소", ""))
        if sub and sub not in e["subs"]:
            e["subs"].append(sub)
    for e in emd.values():
        e["count"] = len(e["subs"])
    (OUT / "emd_power.json").write_text(
        json.dumps(list(emd.values()), ensure_ascii=False), encoding="utf-8")
    print(f"emd_power: {len(emd)} EMDs from {len(rows)} rows")

    dc = read_csv_kr(RAW / "kepco_dc_status.csv")
    dc_out = [{"region": norm(r["지역명"]),
               "customers": int(r["고객호수"]),
               "contractMw": float(r["계약전력(MW)"])} for r in dc]
    (OUT / "dc_stats.json").write_text(json.dumps(dc_out, ensure_ascii=False), encoding="utf-8")
    print(f"dc_stats: {len(dc_out)} regions")

    osm = json.loads((RAW / "osm_substations.json").read_text(encoding="utf-8"))
    subs = []
    for el in osm.get("elements", []):
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags", {})
        subs.append({
            "name": tags.get("name", ""),
            "lat": round(lat, 5),
            "lng": round(lon, 5),
            "voltage": tags.get("voltage", ""),
            "operator": tags.get("operator", ""),
        })
    (OUT / "substations_osm.json").write_text(
        json.dumps(subs, ensure_ascii=False), encoding="utf-8")
    named = sum(1 for s in subs if s["name"])
    print(f"substations_osm: {len(subs)} points ({named} named)")


if __name__ == "__main__":
    main()
