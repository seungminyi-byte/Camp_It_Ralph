"""건축HUB 건축인허가 기본개요 → 시군구별 허가→착공 지연 통계 (P1 signal).

Source: data.go.kr 15136267 국토교통부_건축HUB_건축인허가정보 서비스, operation getApBasisOulnInfo
(fields archPmsDay=건축허가일, realStcnsDay=실제착공일, archGbCdNm=건축구분, totArea=연면적, mainPurpsCdNm=주용도).

Needs DATA_GO_KR_API_KEY (environment, or a KEY=VALUE line in data-pack/.env which is git-ignored).
Without a key the script prints a warning and exits 0 so build_all keeps the previous out/permit_delay.json.

Every API page is cached under raw/permits/ (git-ignored) so re-runs do not spend the 10,000 calls/day quota.
Verified 2026-09-04: bjdongCd is effectively required (a sigungu-only query returns an empty body), the
startDate/endDate parameters do not filter by 허가일 (1990s permits come back), and numOfRows is capped at 100.
So every 법정동/리 code of a sigungu (raw/bjdong_codes.txt from code.go.kr) is paged completely and the
허가일 window is applied client-side.

Usage:
  python p05_permits_api.py                # full run → out/permit_delay.json
  python p05_permits_api.py --probe 41287  # diagnostics for one sigungu (paging, date filter, bjdong need)
"""
from __future__ import annotations

import io
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "permits"
OUT = ROOT / "out"
BJDONG_FILE = ROOT / "raw" / "bjdong_codes.txt"

ENDPOINT = "https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo"
UA = "Mozilla/5.0 (compatible; GrandSiteDC/1.0; +https://grand-site-dc.vercel.app)"

WINDOW_FROM = "20210101"   # 허가일(archPmsDay) 기준 집계 구간 — 클라이언트에서 필터 (API 날짜 파라미터는 무효)
WINDOW_TO = "20251231"
PAGE_SIZE = 100             # hard cap of the service (numOfRows > 100 is silently reduced)
MIN_TOT_AREA_M2 = 3000.0    # "대형 신축" 표본: 연면적 3,000㎡ 이상 (데이터센터급 프로젝트 프록시)
STALL_MONTHS = 12           # 허가 후 12개월 넘게 미착공이면 지연 표본으로 간주
MONTH_DAYS = 30.44

# (sigunguCd, sido, sigungu as written in emd_power/emd_centroids, city group for roll-ups)
TARGETS: list[tuple[str, str, str, str]] = [
    # Ordered by demo priority so a quota stop (10,000 calls/day) still leaves the essentials collected.
    ("41287", "경기도", "고양시일산서구", "고양시"),        # 시나리오 1 (덕이동)
    ("28237", "인천광역시", "부평구", "인천광역시"),        # 시나리오 2 (청천동)
    ("36110", "세종특별자치시", "*", "세종특별자치시"),  # 시나리오 3, 시도 단위로 매칭
    ("41281", "경기도", "고양시덕양구", "고양시"),
    ("41285", "경기도", "고양시일산동구", "고양시"),
    ("41570", "경기도", "김포시", "김포시"),
    ("41171", "경기도", "안양시만안구", "안양시"),
    ("41173", "경기도", "안양시동안구", "안양시"),
    ("41461", "경기도", "용인시처인구", "용인시"),
    ("41463", "경기도", "용인시기흥구", "용인시"),
    ("41465", "경기도", "용인시수지구", "용인시"),
    ("11545", "서울특별시", "금천구", "금천구"),
    ("41192", "경기도", "부천시원미구", "부천시"),    # 2024.1 구 신설 이후 코드
    ("41194", "경기도", "부천시소사구", "부천시"),
    ("41196", "경기도", "부천시오정구", "부천시"),
    ("41190", "경기도", "부천시", "부천시"),          # 2023년까지의 단일 코드 (폐지 법정동으로 조회)
    ("41290", "경기도", "과천시", "과천시"),
    ("28260", "인천광역시", "서구", "인천광역시"),          # 2026.7 개편 전 코드 (폐지 법정동으로 조회)
    ("28200", "인천광역시", "남동구", "인천광역시"),
    ("28185", "인천광역시", "연수구", "인천광역시"),
    ("28245", "인천광역시", "계양구", "인천광역시"),
    ("28177", "인천광역시", "미추홀구", "인천광역시"),
    ("28290", "인천광역시", "검단구", "인천광역시"),        # 2026.7 신설 코드 (과거 허가는 대부분 옛 코드)
    ("28275", "인천광역시", "서해구", "인천광역시"),
    ("28125", "인천광역시", "제물포구", "인천광역시"),
    ("28155", "인천광역시", "영종구", "인천광역시"),
]

KEEP_FIELDS = [
    "mgmPmsrgstPk", "sigunguCd", "bjdongCd", "platPlc", "bldNm", "archGbCdNm", "mainPurpsCdNm",
    "totArea", "archPmsDay", "realStcnsDay", "stcnsSchedDay", "stcnsDelayDay", "useAprDay",
    "jiyukCdNm", "crtnDay",
]


# ----------------------------------------------------------------------------- key / http

def normalize_key(key: str) -> str:
    """data.go.kr issues an Encoding key (percent-escaped) and a Decoding key; accept either.

    urlencode() below escapes the key once, so an Encoding-style value must be unescaped first or the
    request is double-encoded and the API answers SERVICE_KEY_IS_NOT_REGISTERED_ERROR (HTTP 403).
    """
    key = key.strip().strip('"').strip("'")
    return urllib.parse.unquote(key) if "%" in key else key


def load_key() -> str | None:
    key = os.environ.get("DATA_GO_KR_API_KEY", "").strip()
    if key:
        return normalize_key(key)
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATA_GO_KR_API_KEY=") and not line.startswith("#"):
                return normalize_key(line.split("=", 1)[1])
    return None


class ApiError(RuntimeError):
    pass


def api_get(key: str, params: dict[str, str], cache_name: str | None = None) -> dict:
    """GET one page (JSON). Cached by cache_name under raw/permits/."""
    cache = RAW / f"{cache_name}.json" if cache_name else None
    if cache and cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    q = {"serviceKey": key, "_type": "json", **params}
    url = f"{ENDPOINT}?{urllib.parse.urlencode(q)}"
    last: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8", errors="replace")
            if raw.lstrip().startswith("<"):
                # XML error envelope (SERVICE_KEY / LIMITED_NUMBER ...), surface it
                raise ApiError(raw[:400].replace("\n", " "))
            data = json.loads(raw)
            header = data.get("response", {}).get("header", {})
            code = str(header.get("resultCode", ""))
            if code not in ("00", "03"):  # 03 = NODATA_ERROR
                raise ApiError(f"resultCode={code} {header.get('resultMsg')}")
            if cache:
                RAW.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:300].replace("\n", " ")
            if 400 <= e.code < 500:  # key / quota errors: not transient
                raise ApiError(f"HTTP {e.code}: {body}") from None
            last = e
            time.sleep(1.5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:  # transient
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise ApiError(f"request failed after retries: {last}")


def body_of(data: dict) -> tuple[list[dict], int]:
    body = data.get("response", {}).get("body", {}) or {}
    total = int(body.get("totalCount") or 0)
    items = body.get("items") or {}
    if not isinstance(items, dict):
        return [], total
    item = items.get("item") or []
    if isinstance(item, dict):
        item = [item]
    return item, total


# ----------------------------------------------------------------------------- 법정동 codes

def ensure_bjdong_codes() -> dict[str, list[tuple[str, str]]]:
    """{sigunguCd: [(bjdongCd5, name), ...]} for existing 법정동/리 codes, from code.go.kr full dump."""
    if not BJDONG_FILE.exists():
        print("downloading 법정동코드 전체자료 from code.go.kr …")
        body = urllib.parse.urlencode({"codeseId": "법정동코드", "codeseName": "법정동코드"}).encode()
        req = urllib.request.Request(
            "https://www.code.go.kr/etc/codeFullDown.do", data=body,
            headers={"User-Agent": UA, "Referer": "https://www.code.go.kr/stdcode/regCodeL.do"},
        )
        blob = urllib.request.urlopen(req, timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".txt"))
            text = z.read(name)
        for enc in ("utf-8", "cp949"):
            try:
                decoded = text.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise RuntimeError("cannot decode 법정동코드 file")
        BJDONG_FILE.parent.mkdir(parents=True, exist_ok=True)
        BJDONG_FILE.write_text(decoded, encoding="utf-8")
    existing: dict[str, list[tuple[str, str]]] = {}
    abolished: dict[str, list[tuple[str, str]]] = {}
    for line in BJDONG_FILE.read_text(encoding="utf-8").splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 3 or len(parts[0]) != 10:
            continue
        code, name, status = parts[0], parts[1].strip(), parts[2].strip()
        if code.endswith("00000"):
            continue  # 시군구 자체
        (existing if status == "존재" else abolished).setdefault(code[:5], []).append((code[5:], name))
    # Sigungu that were abolished by a reorganisation (인천 서구 28260, 부천시 41190) keep their historical
    # permits under the old codes, so fall back to their abolished 법정동 list.
    out = dict(existing)
    for sg, codes in abolished.items():
        if sg not in out:
            out[sg] = codes
    return out


# ----------------------------------------------------------------------------- fetch

def fetch_pages(key: str, sigungu: str, bjdong: str) -> list[dict]:
    """All permit rows of one 법정동 (every page; the API has no usable date filter)."""
    tag = f"{sigungu}_{bjdong}"
    items: list[dict] = []
    page = 1
    while True:
        params = {"sigunguCd": sigungu, "bjdongCd": bjdong, "numOfRows": str(PAGE_SIZE), "pageNo": str(page)}
        data = api_get(key, params, cache_name=f"{tag}_p{page}")
        page_items, total = body_of(data)
        items.extend(page_items)
        if not page_items or len(items) >= total:
            break
        page += 1
        if page > 500:  # safety valve (50k rows per 법정동)
            print(f"  ! {tag}: stopping at page {page}")
            break
    return items


def fetch_sigungu(key: str, sigungu: str, bjdong_codes: dict[str, list[tuple[str, str]]]) -> list[dict]:
    """Iterate every existing 법정동/리 code of the sigungu."""
    items: list[dict] = []
    codes = bjdong_codes.get(sigungu, [])
    for i, (code5, name) in enumerate(codes, 1):
        got = fetch_pages(key, sigungu, code5)
        items.extend(got)
        if got:
            print(f"    [{i}/{len(codes)}] {code5} {name}: {len(got)}", flush=True)
    return items


# ----------------------------------------------------------------------------- stats

def parse_day(s: str | None) -> date | None:
    s = (s or "").strip()
    if len(s) != 8 or not s.isdigit():
        return None
    try:
        return datetime.strptime(s, "%Y%m%d").date()
    except ValueError:
        return None


def to_float(s: str | None) -> float:
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def slim(item: dict) -> dict:
    return {k: item.get(k) for k in KEEP_FIELDS}


def is_sample(rec: dict, today: date) -> bool:
    if (rec.get("archGbCdNm") or "").strip() != "신축":
        return False
    if to_float(rec.get("totArea")) < MIN_TOT_AREA_M2:
        return False
    pms = parse_day(rec.get("archPmsDay"))
    return pms is not None and WINDOW_FROM <= pms.strftime("%Y%m%d") <= WINDOW_TO and pms <= today


def stats_for(records: list[dict], today: date) -> dict:
    sample = [r for r in records if is_sample(r, today)]
    delays: list[float] = []
    stalled = 0
    eligible = 0
    purposes: dict[str, int] = {}
    for r in sample:
        pms = parse_day(r.get("archPmsDay"))
        start = parse_day(r.get("realStcnsDay"))
        assert pms is not None
        purpose = (r.get("mainPurpsCdNm") or "기타").strip()
        purposes[purpose] = purposes.get(purpose, 0) + 1
        if start and start >= pms:
            delays.append((start - pms).days / MONTH_DAYS)
        elif not start and not parse_day(r.get("useAprDay")):
            if (today - pms).days >= STALL_MONTHS * MONTH_DAYS:
                eligible += 1
                stalled += 1
                continue
        if (today - pms).days >= STALL_MONTHS * MONTH_DAYS:
            eligible += 1
    delays.sort()
    top = sorted(purposes.items(), key=lambda kv: -kv[1])[:3]
    return {
        "n": len(sample),
        "started": len(delays),
        "medianMonths": round(statistics.median(delays), 1) if delays else None,
        "p75Months": round(delays[int(len(delays) * 0.75) - 1] if len(delays) >= 4 else (delays[-1] if delays else 0), 1) if delays else None,
        "stalled12mN": stalled,
        "eligible12mN": eligible,
        "stalled12mShare": round(stalled / eligible, 3) if eligible else None,
        "topPurposes": [{"purpose": p, "n": n} for p, n in top],
    }


# ----------------------------------------------------------------------------- main

def probe(key: str, sigungu: str) -> int:
    codes = ensure_bjdong_codes().get(sigungu, [])
    print(f"probe sigungu {sigungu}: {len(codes)} 법정동 codes: {[n.split()[-1] for _, n in codes[:12]]}")
    if not codes:
        return 1
    code5, name = codes[0]
    data = api_get(key, {"sigunguCd": sigungu, "bjdongCd": code5, "numOfRows": "100", "pageNo": "1"})
    items, total = body_of(data)
    print(f"  {code5} {name}: totalCount={total} page items={len(items)}")
    if items:
        print("  sample:", json.dumps(slim(items[0]), ensure_ascii=False)[:300])
    return 0


def main(argv: list[str]) -> int:
    key = load_key()
    if not key:
        print("WARN: DATA_GO_KR_API_KEY not set (env or data-pack/.env) — skipping permit stats; keeping existing out/permit_delay.json")
        return 0
    if len(argv) >= 2 and argv[0] == "--probe":
        return probe(key, argv[1])

    today = date.today()
    bjdong_codes = ensure_bjdong_codes()
    per_code: dict[str, list[dict]] = {}
    for code, sido, sigungu, city in TARGETS:
        print(f"== {code} {sido} {sigungu} ({len(bjdong_codes.get(code, []))} 법정동)", flush=True)
        items = fetch_sigungu(key, code, bjdong_codes)
        recs = [slim(i) for i in items]
        per_code[code] = recs
        in_window = sum(1 for r in recs if is_sample(r, today))
        print(f"   {len(recs)} permits fetched, {in_window} in sample (신축 ≥{MIN_TOT_AREA_M2:.0f}㎡, {WINDOW_FROM[:4]}~{WINDOW_TO[:4]})", flush=True)

    rows: list[dict] = []
    # per-sigungu rows (as named in emd data)
    for code, sido, sigungu, city in TARGETS:
        st = stats_for(per_code[code], today)
        rows.append({"sido": sido, "sigungu": sigungu, "level": "sigungu", "codes": [code], **st})
    # city roll-ups for multi-gu cities (and 부천 old+new codes)
    groups: dict[tuple[str, str], list[str]] = {}
    for code, sido, sigungu, city in TARGETS:
        groups.setdefault((sido, city), []).append(code)
    for (sido, city), codes in groups.items():
        if len(codes) < 2:
            continue
        merged = [r for c in codes for r in per_code[c]]
        rows.append({"sido": sido, "sigungu": city, "level": "city", "codes": codes, **stats_for(merged, today)})
    all_recs = [r for recs in per_code.values() for r in recs]
    baseline = stats_for(all_recs, today)

    out = {
        "source": "국토교통부_건축HUB_건축인허가정보 서비스 (data.go.kr 15136267, getApBasisOulnInfo)",
        "fetchedAt": today.isoformat(),
        "window": {"from": WINDOW_FROM, "to": WINDOW_TO},
        "sample": {"archGb": "신축", "minTotAreaM2": MIN_TOT_AREA_M2, "stallMonths": STALL_MONTHS},
        "baseline": baseline,
        "rows": rows,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "permit_delay.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote out/permit_delay.json: {len(rows)} rows, baseline median {baseline['medianMonths']} months over {baseline['n']} permits")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
