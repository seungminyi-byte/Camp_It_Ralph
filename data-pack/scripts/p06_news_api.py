"""네이버 검색 API(뉴스) → 지역별 데이터센터 갈등 기사 카운트 (P1 signal).

Source: NAVER API HUB 뉴스 검색 https://naverapihub.apigw.ntruss.com/search/v1/news
(headers X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY, display<=100, start<=1000, sort=date,
일 25,000회·키당 50 RPS). 네이버 검색 API는 개발자센터(openapi.naver.com, X-Naver-Client-* 헤더)에서
네이버 클라우드 콘솔의 NAVER API HUB로 이관되었고 게이트웨이 주소와 헤더가 모두 바뀌었다.
인증 정보는 console.ncloud.com/naver-api-hub/application 의 Application → [인증 정보].

Needs NAVER_CLIENT_ID + NAVER_CLIENT_SECRET (environment, or KEY=VALUE lines in the git-ignored
data-pack/.env). Without them the script warns and exits 0 so build_all keeps out/news_signal.json.

Every API page is cached under raw/news/ (git-ignored) so re-runs cost no quota and stay reproducible.

Counting rules (all client-side; the API's totalCount is inflated and unusable):
  1. pubDate within the last WINDOW_MONTHS months,
  2. 데이터센터 in the TITLE, and
  3. the area in the TITLE (per-area include/exclude regexes — "고양이"·"세종대왕" 류 오탐 제거).
     제목 기준이 핵심이다: 질의는 느슨하게 매칭돼 요약문까지 허용하면 "공공기관 이전" 류 무관 기사가
     대량 유입된다(세종 실측: 요약 허용 434건 → 제목 기준 56건).
  4. duplicates removed by normalized link and normalized title (뉴스 기사 재전재가 많다),
  5. conflictArticles = 3 + an opposition keyword (반대·반발·무산·백지화 …) in the TITLE.
     요약문에는 질의어("반대")가 그대로 실려 오므로 갈등 판정도 제목으로만 한다.
The 감점은 conflictArticles 기준 (constants.json scoring.permit.newsDeduction).

Usage:
  python p06_news_api.py                 # full run → out/news_signal.json
  python p06_news_api.py --check         # 키 1회 호출 검증 (성공/실패만 출력)
  python p06_news_api.py --probe 고양     # one area: query별 수집·필터 통계만 출력
"""
from __future__ import annotations

import html
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "news"
OUT = ROOT / "out"

ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/news"
UA = "Mozilla/5.0 (compatible; GrandSiteDC/1.0; +https://grand-site-dc.vercel.app)"

WINDOW_MONTHS = 24
PAGE_SIZE = 100        # API 상한
MAX_START = 1000       # API 상한 (start + display <= 1100 이지만 start > 1000 은 오류)
QUERY_TEMPLATES = ["{} 데이터센터 반대", "{} 데이터센터 주민", "{} 데이터센터 인허가"]
TOP_N = 3

# 제목에 데이터센터가 실제로 언급되어야 한다 (질의어는 느슨하게 매칭된다).
DC_PATTERN = re.compile(r"데이터\s?센터|데이터센타|IDC(?![A-Za-z])")

# 갈등 단계 분류: 규칙 기반(LLM 미사용). strong = 반대 행동이 드러난 기사.
CONFLICT_KEYWORDS = [
    "반대", "반발", "집회", "시위", "규탄", "항의", "농성", "저지", "철회", "백지화",
    "무산", "부결", "반려", "불허", "중단", "취소", "소송", "행정심판", "청원", "대책위",
    "비상대책", "서명", "제동", "좌초", "갈등", "논란", "진통", "민원",
]
CONFLICT_PATTERN = re.compile("|".join(CONFLICT_KEYWORDS))

# 검색 지역 → 앱 행정구역 매핑.
#   query   : 네이버 검색어 앞부분 (QUERY_TEMPLATES 에 삽입)
#   sido    : emd_power/emd_centroids 표기 (engine 의 sido 매칭용)
#   sigungu : emd 표기. 여러 구를 덮는 시는 시 이름(level=city, engine 이 prefix 매칭),
#             '*' 는 시도 전체 폴백
#   include : (AND 묶음들의 OR) 지역 언급 판정 정규식
#   exclude : 하나라도 걸리면 제외
AREAS: list[dict] = [
    {"query": "고양", "sido": "경기도", "sigungu": "고양시", "level": "city",
     "include": [["고양시"], ["고양(?!이)"], ["일산"], ["덕양"], ["덕이동"]], "exclude": []},
    {"query": "김포", "sido": "경기도", "sigungu": "김포시", "level": "sigungu",
     "include": [["김포"]], "exclude": []},
    {"query": "안양", "sido": "경기도", "sigungu": "안양시", "level": "city",
     "include": [["안양"], ["호계동"], ["평촌"]], "exclude": []},
    {"query": "용인", "sido": "경기도", "sigungu": "용인시", "level": "city",
     # 제목에 "용인 데이터센터"로만 쓰는 기사가 많아 맨이름도 넣는다("용인하다" 동사는 데이터센터
     # 동시 언급 조건 때문에 사실상 걸리지 않는다).
     "include": [["용인"], ["기흥"], ["처인"], ["수지구"], ["죽전"], ["공세동"]],
     "exclude": []},
    {"query": "부천", "sido": "경기도", "sigungu": "부천시", "level": "city",
     "include": [["부천"], ["삼정동"]], "exclude": []},
    {"query": "과천", "sido": "경기도", "sigungu": "과천시", "level": "sigungu",
     "include": [["과천"], ["주암동"]], "exclude": []},
    {"query": "시흥시", "sido": "경기도", "sigungu": "시흥시", "level": "sigungu",
     "include": [["시흥시"], ["경기 ?시흥"], ["시흥 ?국가"]], "exclude": ["시흥동"]},
    {"query": "금천구", "sido": "서울특별시", "sigungu": "금천구", "level": "sigungu",
     "include": [["금천"], ["독산동"], ["가산디지털"]], "exclude": []},
    {"query": "영등포", "sido": "서울특별시", "sigungu": "영등포구", "level": "sigungu",
     "include": [["영등포"], ["문래동"]], "exclude": []},
    {"query": "부평", "sido": "인천광역시", "sigungu": "부평구", "level": "sigungu",
     "include": [["부평"], ["청천동"]], "exclude": []},
    {"query": "인천 서구", "sido": "인천광역시", "sigungu": "서구", "level": "sigungu",
     "include": [["인천", "서구"], ["가좌동"], ["청라"]], "exclude": []},
    {"query": "인천 남동구", "sido": "인천광역시", "sigungu": "남동구", "level": "sigungu",
     "include": [["남동구"], ["남동공단"], ["남동국가산단"], ["논현동", "인천"]], "exclude": []},
    {"query": "인천 연수구", "sido": "인천광역시", "sigungu": "연수구", "level": "sigungu",
     "include": [["연수구"], ["송도"]], "exclude": []},
    {"query": "인천 계양구", "sido": "인천광역시", "sigungu": "계양구", "level": "sigungu",
     "include": [["계양"]], "exclude": []},
    {"query": "인천 미추홀구", "sido": "인천광역시", "sigungu": "미추홀구", "level": "sigungu",
     "include": [["미추홀"]], "exclude": []},
    {"query": "인천 검단", "sido": "인천광역시", "sigungu": "검단구", "level": "sigungu",
     "include": [["검단"]], "exclude": []},
    {"query": "인천 영종", "sido": "인천광역시", "sigungu": "영종구", "level": "sigungu",
     "include": [["영종"]], "exclude": []},
    {"query": "인천 제물포", "sido": "인천광역시", "sigungu": "제물포구", "level": "sigungu",
     "include": [["제물포"], ["인천", "중구"], ["인천", "동구"]], "exclude": []},
    {"query": "인천 서해구", "sido": "인천광역시", "sigungu": "서해구", "level": "sigungu",
     "include": [["서해구"]], "exclude": []},
    {"query": "인천", "sido": "인천광역시", "sigungu": "*", "level": "sido",
     "include": [["인천"]], "exclude": []},
    {"query": "세종시", "sido": "세종특별자치시", "sigungu": "*", "level": "sido",
     "include": [["세종시"], ["세종특별자치시"], ["행복도시"], ["세종"]],
     "exclude": ["세종대왕", "세종문화", "세종호텔", "세종대학교", "세종사이버", "세종연구소", "세종문고"]},
]

TAG_RE = re.compile(r"<[^>]+>")
NON_WORD_RE = re.compile(r"[^0-9A-Za-z가-힣]+")


# ----------------------------------------------------------------------------- key / http

def load_keys() -> tuple[str, str] | tuple[None, None]:
    """NAVER_CLIENT_ID / NAVER_CLIENT_SECRET from the environment or data-pack/.env."""
    vals = {"NAVER_CLIENT_ID": os.environ.get("NAVER_CLIENT_ID", "").strip(),
            "NAVER_CLIENT_SECRET": os.environ.get("NAVER_CLIENT_SECRET", "").strip()}
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            if k in vals and not os.environ.get(k, "").strip():
                # last occurrence wins so re-appending a corrected key does not need manual cleanup
                vals[k] = v.strip().strip('"').strip("'")
    if vals["NAVER_CLIENT_ID"] and vals["NAVER_CLIENT_SECRET"]:
        return vals["NAVER_CLIENT_ID"], vals["NAVER_CLIENT_SECRET"]
    return None, None


class ApiError(RuntimeError):
    pass


def cache_name(query: str, start: int) -> str:
    slug = NON_WORD_RE.sub("_", query).strip("_")
    return f"{slug}_s{start}"


def api_get(cid: str, secret: str, query: str, start: int) -> dict:
    """One page of news search results (cached under raw/news/)."""
    cache = RAW / f"{cache_name(query, start)}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    params = {"query": query, "display": str(PAGE_SIZE), "start": str(start),
              "sort": "date", "format": "json"}
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    headers = {"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": secret,
               "User-Agent": UA, "Accept": "application/json"}
    last: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8", errors="replace"))
            RAW.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            time.sleep(0.1)
            return data
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:300].replace("\n", " ")
            if e.code in (400, 401, 403, 404):  # 키·질의 오류: 재시도 무의미
                raise ApiError(f"HTTP {e.code}: {body}") from None
            if e.code == 429:  # 쿼터 초과
                raise ApiError(f"HTTP 429 quota exceeded: {body}") from None
            last = e
            time.sleep(1.5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise ApiError(f"request failed after retries: {last}")


# ----------------------------------------------------------------------------- parsing

def clean(text: str) -> str:
    return html.unescape(TAG_RE.sub("", text or "")).strip()


def parse_pub(value: str) -> datetime | None:
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def norm_title(title: str) -> str:
    return NON_WORD_RE.sub("", title)


def norm_link(item: dict) -> str:
    """Keep the query string: 국내 언론사 상당수가 기사 id 를 ?id=... 로 실어 잘라내면 서로 다른
    기사가 한 건으로 합쳐진다 (세종 실측 56건 → 34건)."""
    link = (item.get("originallink") or item.get("link") or "").strip()
    link = re.sub(r"^https?://", "", link)
    link = re.sub(r"^(www|news|m)\.", "", link)
    return link.rstrip("/")


def matches_area(title: str, text: str, area: dict) -> bool:
    """지역 언급은 제목에서만 인정하고, 오탐 제외 패턴은 제목+요약 전체에 적용한다."""
    for pattern in area["exclude"]:
        if re.search(pattern, text):
            return False
    for group in area["include"]:
        if all(re.search(p, title) for p in group):
            return True
    return False


def collect_area(cid: str, secret: str, area: dict, cutoff: datetime, verbose: bool = False) -> dict:
    """Fetch every query of one area, filter, dedupe → article records."""
    seen_links: set[str] = set()
    seen_titles: set[str] = set()
    articles: list[dict] = []
    calls = 0
    fetched = 0
    for template in QUERY_TEMPLATES:
        query = template.format(area["query"])
        kept_here = 0
        start = 1
        while start <= MAX_START:
            data = api_get(cid, secret, query, start)
            calls += 1
            items = data.get("items") or []
            fetched += len(items)
            oldest: datetime | None = None
            for item in items:
                pub = parse_pub(item.get("pubDate", ""))
                if pub is not None and (oldest is None or pub < oldest):
                    oldest = pub
                if pub is None or pub < cutoff:
                    continue
                title = clean(item.get("title", ""))
                desc = clean(item.get("description", ""))
                text = title + " " + desc
                if not DC_PATTERN.search(title) or not matches_area(title, text, area):
                    continue
                link = norm_link(item)
                key_title = norm_title(title)
                if (link and link in seen_links) or (key_title and key_title in seen_titles):
                    continue
                if link:
                    seen_links.add(link)
                if key_title:
                    seen_titles.add(key_title)
                articles.append({
                    "title": title,
                    "link": (item.get("originallink") or item.get("link") or "").strip(),
                    "date": pub.astimezone(timezone(timedelta(hours=9))).date().isoformat(),
                    "conflict": bool(CONFLICT_PATTERN.search(title)),
                })
                kept_here += 1
            if len(items) < PAGE_SIZE or (oldest is not None and oldest < cutoff):
                break
            start += PAGE_SIZE
        if verbose:
            print(f"    '{query}': +{kept_here} (누적 {len(articles)})", flush=True)
    articles.sort(key=lambda a: a["date"], reverse=True)
    conflict = [a for a in articles if a["conflict"]]
    top = (conflict or articles)[:TOP_N]
    return {
        "articles": len(articles),
        "conflictArticles": len(conflict),
        "top": [{k: a[k] for k in ("title", "link", "date")} for a in top],
        "_calls": calls,
        "_fetched": fetched,
    }


# ----------------------------------------------------------------------------- main

def check(cid: str, secret: str) -> int:
    """One call to confirm the credentials work (키를 다시 넣은 뒤 즉시 확인용)."""
    print(f"NAVER_CLIENT_ID {len(cid)}자 / NAVER_CLIENT_SECRET {len(secret)}자")
    try:
        params = urllib.parse.urlencode(
            {"query": "데이터센터", "display": "1", "sort": "date", "format": "json"})
        req = urllib.request.Request(
            f"{ENDPOINT}?{params}",
            headers={"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": secret, "User-Agent": UA},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        print(f"OK — 검색 API 인증 성공 (total={data.get('total')}). 이제 p06_news_api.py 를 실행하면 된다.")
        return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"실패 — HTTP {e.code} {body}")
        if e.code in (401, 403):
            print("  → console.ncloud.com/naver-api-hub/application 의 Application → [인증 정보] 값인지, "
                  "해당 Application 에 검색 API 가 포함되어 있는지 확인.")
        return 1


def probe(cid: str, secret: str, name: str) -> int:
    area = next((a for a in AREAS if a["query"] == name or a["sigungu"] == name), None)
    if area is None:
        print(f"unknown area '{name}'. known: {[a['query'] for a in AREAS]}")
        return 1
    cutoff = datetime.now(timezone.utc) - timedelta(days=int(WINDOW_MONTHS * 30.44))
    print(f"probe {area['query']} ({area['sido']} {area['sigungu']}), cutoff {cutoff.date()}")
    res = collect_area(cid, secret, area, cutoff, verbose=True)
    print(f"  calls={res['_calls']} fetched={res['_fetched']} kept={res['articles']} conflict={res['conflictArticles']}")
    for a in res["top"]:
        print(f"   - {a['date']} {a['title'][:70]}")
    return 0


def main(argv: list[str]) -> int:
    cid, secret = load_keys()
    if not cid or not secret:
        print("WARN: NAVER_CLIENT_ID/NAVER_CLIENT_SECRET not set (env or data-pack/.env) — "
              "skipping news signal; keeping existing out/news_signal.json")
        return 0
    if argv and argv[0] == "--check":
        return check(cid, secret)
    if len(argv) >= 2 and argv[0] == "--probe":
        return probe(cid, secret, argv[1])

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=int(WINDOW_MONTHS * 30.44))
    rows: list[dict] = []
    calls = 0
    for area in AREAS:
        res = collect_area(cid, secret, area, cutoff)
        calls += res.pop("_calls")
        res.pop("_fetched")
        rows.append({"sido": area["sido"], "sigungu": area["sigungu"], "level": area["level"],
                     "query": area["query"], **res})
        print(f"== {area['query']:12s} {area['sido']} {area['sigungu']:8s} "
              f"기사 {res['articles']:4d} / 갈등 {res['conflictArticles']:4d}", flush=True)

    conflicts = [r["conflictArticles"] for r in rows]
    out = {
        "source": "네이버 검색 API (뉴스), openapi.naver.com/v1/search/news.json",
        "fetchedAt": now.astimezone(timezone(timedelta(hours=9))).date().isoformat(),
        "window": {"months": WINDOW_MONTHS, "from": cutoff.astimezone(timezone(timedelta(hours=9))).date().isoformat(),
                   "to": now.astimezone(timezone(timedelta(hours=9))).date().isoformat()},
        "queries": QUERY_TEMPLATES,
        "conflictKeywords": CONFLICT_KEYWORDS,
        "note": ("행은 검색 지역 단위다(합산 아님): level=city 는 시 전체 검색, level=sido 는 시도 전체 검색으로 "
                 "구별 행이 없을 때의 폴백이다. 감점은 conflictArticles 기준."),
        "baseline": {
            "areas": len(rows),
            "articles": sum(r["articles"] for r in rows),
            "conflictArticles": sum(conflicts),
            "medianConflict": int(statistics.median(conflicts)) if conflicts else 0,
            "maxConflict": max(conflicts) if conflicts else 0,
        },
        "rows": rows,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "news_signal.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote out/news_signal.json: {len(rows)} areas, {out['baseline']['conflictArticles']} conflict articles, "
          f"{calls} API calls (quota 25,000/day)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
