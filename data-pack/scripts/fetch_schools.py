"""Fetch 전국초중등학교위치표준데이터 (data.go.kr 15021148) via the grid JSON endpoints."""
import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://www.data.go.kr"
PK = "15021148"
RAW_DIR = Path(__file__).resolve().parents[1] / "raw"
OUT = RAW_DIR / "schools.csv"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def get_json(url: str, referer: str) -> object:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": referer,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    referer = f"{BASE}/data/{PK}/standard.do"
    header = get_json(f"{BASE}/download/columList.json?pk={PK}&ext=CSV", referer)
    total = int(header["totalCount"])
    table = header["tableVO"]["svcTableNm"]
    col_codes = [c["columCode"] for c in header["columList"]]
    col_names = [c["columNm"] for c in header["columList"]]
    col_nm_list = header["tableVO"]["colNmList"]
    print(f"totalCount={total} table={table} cols={len(col_codes)}")

    per_page = 10000
    rows: list[list[str]] = []
    page = 1
    while len(rows) < total and page <= 10:
        params = [("publicDataPk", PK)] + [("colNmList", c) for c in col_nm_list]
        params += [("totalCount", str(total)), ("svcTableNm", table),
                   ("perPage", str(per_page)), ("page", str(page))]
        url = f"{BASE}/download/standard.json?" + urllib.parse.urlencode(params)
        data = get_json(url, referer)
        records = data if isinstance(data, list) else data.get("dataList") or data.get("records") or []
        if not records:
            print(f"page {page}: empty, stop")
            break
        for rec in records:
            rows.append([str(rec.get(code, "") or "") for code in col_codes])
        print(f"page {page}: +{len(records)} (total {len(rows)})")
        page += 1

    if len(rows) < total * 0.95:
        print(f"WARN: collected {len(rows)} < expected {total}")

    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(col_names)
        w.writerows(rows)
    print(f"saved {OUT} rows={len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
