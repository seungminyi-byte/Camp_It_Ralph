"""Validate pipeline outputs: schema, coordinate ranges, row minimums, demo spot checks."""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
CURATED = ROOT / "curated"

ERRORS: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("OK  " if cond else "FAIL") + " " + msg)
    if not cond:
        ERRORS.append(msg)


def in_korea(lat: float, lng: float) -> bool:
    return 33.0 <= lat <= 39.5 and 124.0 <= lng <= 132.0


def nearest_centroid(cents: list[dict], lat: float, lng: float) -> tuple[dict, float]:
    best, best_d = None, math.inf
    for c in cents:
        d = math.hypot(c["lat"] - lat, (c["lng"] - lng) * 0.79)
        if d < best_d:
            best, best_d = c, d
    assert best is not None
    return best, best_d * 111


def main() -> int:
    emd_power = json.loads((OUT / "emd_power.json").read_text(encoding="utf-8"))
    cents = json.loads((OUT / "emd_centroids.json").read_text(encoding="utf-8"))
    subs = json.loads((OUT / "substations_osm.json").read_text(encoding="utf-8"))
    schools = json.loads((OUT / "schools.json").read_text(encoding="utf-8"))
    pop = json.loads((OUT / "pop_grid.json").read_text(encoding="utf-8"))

    check(len(emd_power) >= 4000, f"emd_power rows {len(emd_power)} >= 4000")
    check(len(cents) >= 5000, f"emd_centroids rows {len(cents)} >= 5000")
    check(len(subs) >= 800, f"substations rows {len(subs)} >= 800")
    check(len(schools) >= 11000, f"schools rows {len(schools)} >= 11000")
    check(len(pop) >= 15000, f"pop_grid rows {len(pop)} >= 15000")

    check(all(in_korea(c["lat"], c["lng"]) for c in cents), "centroid coords in Korea bbox")
    check(all(in_korea(s["lat"], s["lng"]) for s in subs), "substation coords in Korea bbox")
    check(all(in_korea(s[2], s[3]) for s in schools), "school coords in Korea bbox")
    check(all(in_korea(r[0], r[1]) for r in pop), "pop grid coords in Korea bbox")

    pk = {(p["sido"], p["sigungu"], p["emd"]) for p in emd_power}
    ck = {(c["sido"], c["sigungu"], c["emd"]) for c in cents}
    cov = len(pk & ck) / len(pk)
    check(cov >= 0.85, f"centroid coverage of emd_power {cov:.1%} >= 85%")

    scenarios = json.loads((CURATED / "scenarios.json").read_text(encoding="utf-8"))["scenarios"]
    expect = {
        "goyang-deogi": ("경기도", "덕이동"),
        "incheon-residential": ("인천광역시", None),
        "sejong-contrast": ("세종특별자치시", None),
    }
    for sc in scenarios:
        c, dist = nearest_centroid(cents, sc["lat"], sc["lng"])
        sido_exp, emd_exp = expect[sc["id"]]
        ok_sido = c["sido"] == sido_exp
        ok_emd = emd_exp is None or c["emd"] == emd_exp
        check(
            ok_sido and ok_emd and dist < 3.0,
            f"scenario {sc['id']}: matched {c['sido']} {c['sigungu']} {c['emd']} ({dist:.2f}km)",
        )
        key = (c["sido"], c["sigungu"], c["emd"])
        has_power = key in pk
        if not has_power:
            by_sido_emd = [p for p in emd_power if p["sido"] == c["sido"] and p["emd"] == c["emd"]]
            has_power = len(by_sido_emd) == 1
        check(has_power, f"scenario {sc['id']}: emd_power entry resolvable")

    permits_path = OUT / "permit_delay.json"
    if permits_path.exists():
        permits = json.loads(permits_path.read_text(encoding="utf-8"))
        rows = permits.get("rows", [])
        check(len(rows) >= 10, f"permit_delay rows {len(rows)} >= 10")
        check((permits.get("baseline") or {}).get("n", 0) >= 100, "permit_delay baseline sample >= 100 permits")
        keys = {(r["sido"], r["sigungu"]) for r in rows}
        for need in [("경기도", "고양시일산서구"), ("인천광역시", "부평구"), ("세종특별자치시", "*")]:
            check(need in keys, f"permit_delay has row for {need[0]} {need[1]}")
        check(
            all(r.get("medianMonths") is None or 0 <= r["medianMonths"] <= 120 for r in rows),
            "permit_delay medians within 0~120 months",
        )
    else:
        print("SKIP permit_delay.json not present (P1 signal disabled)")

    print()
    if ERRORS:
        print(f"VALIDATION FAILED: {len(ERRORS)} error(s)")
        return 1
    print("VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
