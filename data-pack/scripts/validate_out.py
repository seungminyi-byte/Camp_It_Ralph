"""Validate pipeline outputs: schema, coordinate ranges, row minimums, demo spot checks."""
import base64
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


def terrain_cell(grid, planes, lat, lng):
    """Same indexing as lookupTerrain() in prototype/src/scoring/terrain.ts."""
    r = math.floor((lat - grid["lat0"]) / grid["step"] + 1e-9)
    c = math.floor((lng - grid["lng0"]) / grid["step"] + 1e-9)
    if r < 0 or r >= grid["rows"] or c < 0 or c >= grid["cols"]:
        return None
    i = r * grid["cols"] + c
    return {k: v[i] for k, v in planes.items()}


def point_in_ring(lat: float, lng: float, ring) -> bool:
    """Even-odd ray cast, identical to pointInRing() in prototype/src/scoring/restriction.ts."""
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


def zone_contains(zone, lat: float, lng: float) -> bool:
    """bbox fast path, then even-odd over every ring — same as pointInZone() in restriction.ts."""
    b = zone["bbox"]
    if lat < b[0] or lat > b[2] or lng < b[1] or lng > b[3]:
        return False
    inside = False
    for ring in zone["rings"]:
        if point_in_ring(lat, lng, ring):
            inside = not inside
    return inside


def main() -> int:
    emd_power = json.loads((OUT / "emd_power.json").read_text(encoding="utf-8"))
    cents = json.loads((OUT / "emd_centroids.json").read_text(encoding="utf-8"))
    subs = json.loads((OUT / "substations_osm.json").read_text(encoding="utf-8"))
    schools = json.loads((OUT / "schools.json").read_text(encoding="utf-8"))
    pop = json.loads((OUT / "pop_grid.json").read_text(encoding="utf-8"))
    data_centers = json.loads((CURATED / "data_centers.json").read_text(encoding="utf-8"))

    check(len(emd_power) >= 4000, f"emd_power rows {len(emd_power)} >= 4000")
    check(len(cents) >= 5000, f"emd_centroids rows {len(cents)} >= 5000")
    check(len(subs) >= 800, f"substations rows {len(subs)} >= 800")
    check(len(schools) >= 11000, f"schools rows {len(schools)} >= 11000")
    check(len(pop) >= 50000, f"pop_grid rows {len(pop)} >= 50000 (nationwide; the old bbox clip gave 21,944)")
    dc_sites = data_centers.get("sites", [])
    check(data_centers.get("version") == 1, "data_centers version 1")
    check(len(dc_sites) > 0, f"verified data_centers rows {len(dc_sites)} > 0")
    check(len({d.get('id') for d in dc_sites}) == len(dc_sites), "data_centers ids unique")
    check(
        all(
            d.get("status") == "operational"
            and d.get("category") in {"edgeSmall", "colocation", "hyperscale"}
            and in_korea(d["lat"], d["lng"])
            and str(d.get("sourceUrl", "")).startswith("https://")
            and "operator" not in d
            and (d.get("capacityMw") is None and d.get("capacityKind") is None
                 or isinstance(d.get("capacityMw"), (int, float)) and d["capacityMw"] > 0
                 and d.get("capacityKind") in {"IT", "facility", "design"})
            for d in dc_sites
        ),
        "data_centers operational, classified, sourced and in Korea bbox",
    )

    check(all(in_korea(c["lat"], c["lng"]) for c in cents), "centroid coords in Korea bbox")
    check(all(in_korea(s["lat"], s["lng"]) for s in subs), "substation coords in Korea bbox")
    check(all(in_korea(s[2], s[3]) for s in schools), "school coords in Korea bbox")
    check(all(in_korea(r[0], r[1]) for r in pop), "pop grid coords in Korea bbox")
    # Nationwide grid: a re-clipped output (capital area + contrast zones only) fails here.
    for name, lat, lng in [("부산", 35.18, 129.08), ("제주", 33.5, 126.5), ("강릉", 37.75, 128.9), ("울산", 35.54, 129.31), ("전주", 35.82, 127.15)]:
        check(
            any(abs(r[0] - lat) < 0.15 and abs(r[1] - lng) < 0.15 for r in pop),
            f"pop grid has cells near {name}",
        )

    # constants.scoring.coverage decides 판독 불가 in the app; a rebuilt centroid set must stay inside it.
    scoring = json.loads((CURATED / "constants.json").read_text(encoding="utf-8"))["scoring"]
    coverage = scoring.get("coverage")
    check(coverage is not None, "constants.scoring.coverage present")
    if coverage:
        line = coverage["northernBoundary"]

        def line_lat(lng: float) -> float:
            # Same interpolation as polylineLatAt() in prototype/src/scoring/geo.ts.
            if lng <= line[0][1]:
                return line[0][0]
            for (lat0, lng0), (lat1, lng1) in zip(line, line[1:]):
                if lng <= lng1:
                    return lat0 + (lat1 - lat0) * (lng - lng0) / (lng1 - lng0)
            return line[-1][0]

        lngs = [p[1] for p in line]
        check(lngs == sorted(lngs), "coverage northernBoundary vertices ascend by longitude")
        b = coverage["bbox"]
        outside_box = [c for c in cents if not (b[0] <= c["lat"] <= b[2] and b[1] <= c["lng"] <= b[3])]
        check(not outside_box, f"all centroids inside coverage bbox ({len(outside_box)} outside)")
        north = [c for c in cents if c["lat"] > line_lat(c["lng"])]
        check(
            not north,
            "no centroid north of the MDL/NLL line ({} found: {})".format(
                len(north), [f"{c['sigungu']} {c['emd']}" for c in north[:5]]
            ),
        )

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

    news_path = OUT / "news_signal.json"
    if news_path.exists():
        news = json.loads(news_path.read_text(encoding="utf-8"))
        rows = news.get("rows", [])
        check(len(rows) >= 10, f"news_signal rows {len(rows)} >= 10")
        check(
            all(0 <= r["conflictArticles"] <= r["articles"] for r in rows),
            "news_signal conflict counts within article counts",
        )
        keys = {(r["sido"], r["sigungu"]) for r in rows}
        for need in [("경기도", "고양시"), ("인천광역시", "부평구"), ("세종특별자치시", "*")]:
            check(need in keys, f"news_signal has row for {need[0]} {need[1]}")
        check(all(len(r["top"]) <= 3 for r in rows), "news_signal top lists capped at 3 articles")
        check((news.get("window") or {}).get("months", 0) >= 12, "news_signal window >= 12 months")
        check(
            all(r["level"] in ("sigungu", "city", "sido") for r in rows),
            "news_signal levels are sigungu/city/sido",
        )
    else:
        print("SKIP news_signal.json not present (P1 signal disabled)")

    terrain_path = OUT / "terrain_grid.json"
    if terrain_path.exists():
        terrain = json.loads(terrain_path.read_text(encoding="utf-8"))
        grid = terrain["grid"]
        size = grid["rows"] * grid["cols"]
        planes = {k: base64.b64decode(v) for k, v in terrain["planes"].items()}
        check(
            set(planes) == {"landPct", "slopeP50Deg", "steepPct", "elevMean10m"},
            "terrain has the four expected planes",
        )
        check(
            all(len(v) == size for v in planes.values()),
            "terrain plane lengths == rows*cols ({})".format(size),
        )
        check(terrain["tiles"]["missing"] == [], "terrain tiles all loaded (no partial grid)")
        nodata = terrain["stats"]["nodataCells"]
        check(nodata / size < 0.02, "terrain nodata share {:.2%} < 2%".format(nodata / size))

        for sc in scenarios:
            cell = terrain_cell(grid, planes, sc["lat"], sc["lng"])
            ok = cell is not None and cell["landPct"] >= 60 and cell["slopeP50Deg"] < 15
            check(ok, "terrain {}: land/slope {}".format(sc["id"], cell))

        for name, lat, lng, want_land in [("서해", 37.4, 126.2, False), ("서해남부", 35.5, 126.2, False)]:
            cell = terrain_cell(grid, planes, lat, lng)
            check(
                cell is not None and cell["landPct"] < 20,
                "terrain {} reads as water: {}".format(name, cell),
            )

        ridge = terrain_cell(grid, planes, 37.85, 128.45)
        check(
            ridge is not None and ridge["slopeP50Deg"] >= 15 and ridge["steepPct"] >= 50,
            "terrain 태백산맥 reads as steep: {}".format(ridge),
        )

        cfg = json.loads((CURATED / "constants.json").read_text(encoding="utf-8"))["scoring"]["terrain"]
        bands = [b["maxP50Deg"] for b in cfg["slopeDeduction"]]
        check(bands == sorted(bands) and bands[-1] >= 999, "terrain slope bands ascend to a catch-all")
        check(
            cfg["unsuitable"]["minDeduction"] == 20,
            "terrain unsuitable cells receive at least a 20-point deduction",
        )

        check(
            all(
                b[0] < b[2] and b[1] < b[3] and in_korea(b[0], b[1]) and in_korea(b[2], b[3])
                for b in (o["bbox"] for o in cfg["reclaimedOverrides"])
            ),
            "reclaimedOverrides bboxes are ordered and inside Korea",
        )
        songdo = [
            o["name"] for o in cfg["reclaimedOverrides"]
            if o["bbox"][0] <= 37.40 <= o["bbox"][2] and o["bbox"][1] <= 126.62 <= o["bbox"][3]
        ]
        check(bool(songdo), "송도 6·8공구 covered by a reclaimed override: {}".format(songdo))
    else:
        print("SKIP terrain_grid.json not present (terrain signal disabled)")

    profiles = scoring.get("projectProfiles", {})
    check(set(profiles) == {"small", "standard", "hyperscale"}, "three project profiles present")
    check(all(set(p) == {'label', 'description'} for p in profiles.values()), 'project types do not impose MW or count presets')
    household_file = json.loads((OUT / 'households_grid.json').read_text(encoding='utf-8'))
    households = household_file['rows']
    check(household_file['year'] == 2024 and household_file['version'] == 1, 'households year and version')
    check(household_file.get('indicator') == 'to_ga_001' and household_file.get('pipelineVersion') == 'p09-v1' and len(household_file.get('sourceSha256', '')) == 64, 'household indicator and source checksum')
    check(len(households) >= 50000, 'household grid nationwide')
    check(all(len(r) == 3 and in_korea(r[0], r[1]) and (r[2] is None or isinstance(r[2], int) and r[2] >= 0) for r in households), 'household coordinates, counts and nulls valid')
    check(len({(r[0], r[1]) for r in households}) == len(households), 'household grid has no duplicate centers')
    for name, lat, lng in [('부산',35.18,129.08),('제주',33.5,126.5),('강릉',37.75,128.9)]:
        check(any(abs(r[0]-lat)<0.1 and abs(r[1]-lng)<0.1 and r[2] is not None for r in households), 'households near ' + name)
    check(scoring["disaster"]["deduction"] == 15, "disaster deduction is 15 points")
    check("LT_C_UP201" not in scoring["restriction"]["vworldLayers"], "disaster is not double-counted as a restriction")


    # 법정 보호·규제구역 polygons (p08) — the app caps a site inside a prohibited zone at grade E, so the demo
    # scenarios must stay clear of them and the well-known parks must register.
    pz_path = OUT / "protected_zones.json"
    if pz_path.exists():
        pz = json.loads(pz_path.read_text(encoding="utf-8"))
        rcfg = json.loads((CURATED / "constants.json").read_text(encoding="utf-8"))
        restriction = rcfg["scoring"].get("restriction") or {}
        rtypes = restriction.get("types") or {}
        zones = pz.get("zones", [])
        size_mb = pz_path.stat().st_size / 1e6
        check(size_mb <= 3.5, "protected_zones size {:.2f} MB <= 3.5 MB".format(size_mb))
        check(len(zones) >= 1000, f"protected_zones zones {len(zones)} >= 1000")
        check(
            all(all(k in z for k in ("id", "type", "name", "bbox", "rings")) for z in zones),
            "protected_zones zones carry id/type/name/bbox/rings",
        )
        bad_rings = bad_bbox = out_of_range = 0
        for z in zones:
            b = z["bbox"]
            if not (b[0] <= b[2] and b[1] <= b[3]):
                bad_bbox += 1
            for ring in z["rings"]:
                if len(ring) < 4 or ring[0] != ring[-1]:
                    bad_rings += 1
                for lat, lng in ring:
                    if not (b[0] <= lat <= b[2] and b[1] <= lng <= b[3]):
                        bad_bbox += 1
                    if not (32.0 <= lat <= 39.5 and 123.5 <= lng <= 132.5):
                        out_of_range += 1
        check(bad_rings == 0, f"protected_zones rings closed with >= 4 points ({bad_rings} bad)")
        check(bad_bbox == 0, f"protected_zones bboxes ordered and enclosing their rings ({bad_bbox} bad)")
        check(out_of_range == 0, f"protected_zones vertices within 32~39.5 / 123.5~132.5 ({out_of_range} outside)")
        unmapped = sorted({z["type"] for z in zones if z["type"] not in rtypes})
        check(not unmapped, f"every zone type has a constants.scoring.restriction.types entry (unmapped: {unmapped})")
        counts: dict[str, int] = {}
        for z in zones:
            counts[z["type"]] = counts.get(z["type"], 0) + 1
        for t, n in [("국립공원", 22), ("습지보호지역", 1), ("생태·경관보전지역", 1), ("상수원보호구역", 1), ("백두대간보호지역", 1)]:
            check(counts.get(t, 0) >= n, f"protected_zones has >= {n} {t} ({counts.get(t, 0)})")
        check(
            all(v.get("level") in ("prohibited", "conditional") for v in rtypes.values()),
            "restriction types levels are prohibited/conditional",
        )
        vl = restriction.get("vworldLayers") or {}
        vl_types = [v["type"] for v in vl.values()]
        vl_types += [v["buffered"] for v in vl.values() if v.get("buffered")]
        vl_types += [r["type"] for v in vl.values() for r in v.get("nameRules", [])]
        check(all(t in rtypes for t in vl_types), "restriction vworldLayers types exist in restriction.types")
        grades = [g["grade"] for g in rcfg["scoring"]["composite"]["grades"]]
        check(rcfg["scoring"]["composite"].get("restrictionGradeCap") in grades, "composite.restrictionGradeCap is a grade")
        check(bool(rcfg.get("disclaimer", {}).get("restriction")), "disclaimer.restriction present")

        def hits_at(lat: float, lng: float):
            return [z for z in zones if zone_contains(z, lat, lng)]

        for name, lat, lng in [("북한산", 37.66, 126.98), ("지리산", 35.34, 127.73), ("설악산", 38.12, 128.47)]:
            parks = [z["name"] for z in hits_at(lat, lng) if z["type"] == "국립공원"]
            check(any(name in park for park in parks), f"protected_zones {name} inside a 국립공원 zone: {parks}")
        for name, lat, lng in [("서해", 37.4, 126.2), ("여의도", 37.5285, 126.9327)]:
            check(not hits_at(lat, lng), f"protected_zones {name} has no hit")
        for sc in scenarios:
            hits = hits_at(sc["lat"], sc["lng"])
            prohibited = [z["name"] for z in hits if rtypes.get(z["type"], {}).get("level") == "prohibited"]
            check(not prohibited, f"scenario {sc['id']}: no 법적 입지 제한 zone (golden tests depend on it): {prohibited}")
            conditional = [z["name"] for z in hits if rtypes.get(z["type"], {}).get("level") == "conditional"]
            if conditional:
                print(f"INFO scenario {sc['id']}: conditional zones {conditional}")
    else:
        print("SKIP protected_zones.json not present (restriction layer disabled)")

    print()
    if ERRORS:
        print(f"VALIDATION FAILED: {len(ERRORS)} error(s)")
        return 1
    print("VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
