"""Download every raw source into data-pack/raw (reproducible setup for a fresh clone).

Pass dataset keywords to refresh a subset, e.g. `fetch_raw.py sgis` re-downloads only the 98MB grid zip
(matched against the target file name); with no arguments every source is fetched.

No API keys needed. data.go.kr file downloads use a 2-step flow:
POST /tcs/dss/selectFileDataDownload.do -> atchFileId -> GET /cmm/cmm/fileDownload.do.
Schools come from the standard-data grid JSON endpoints (see fetch_schools.py).
"""
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
BASE = "https://www.data.go.kr"

FILE_DATASETS = [
    # (public_data_pk, uddi detail pk, target filename)
    ("15128065", "uddi:3a841aea-8d81-499a-a82a-ac6588c35b88", "kepco_supply_emd.csv"),
    ("15127315", "uddi:38a10571-ec6d-40cc-90e6-fc9818e08a69", "kepco_dc_status.csv"),
    ("15080581", "uddi:c17ae174-0fb0-4b9f-9d33-99c3b42d02c2", "gov_facilities.csv"),
    ("15141768", "uddi:2d720442-85fd-4ab6-b23c-a924da535c58", "sgis_grid/sgis_grid.zip"),
    ("15083033", "uddi:b3094bc9-8756-4ecc-9141-9144b98a531e", "sanga.zip"),
]

OVERPASS_QUERY = (
    '[out:json][timeout:300];area["ISO3166-1"="KR"][admin_level=2]->.kr;'
    '(node["power"="substation"](area.kr);way["power"="substation"](area.kr);'
    'relation["power"="substation"](area.kr););out center tags;'
)
OVERPASS_MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def opener_with_cookies():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def download_datagokr(pk: str, detail_pk: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 1000:
        print(f"skip (exists): {target.name}")
        return
    op = opener_with_cookies()
    page = f"{BASE}/data/{pk}/fileData.do"
    op.open(urllib.request.Request(page, headers={"User-Agent": UA}), timeout=60).read()
    body = urllib.parse.urlencode({
        "publicDataPk": pk,
        "publicDataDetailPk": detail_pk,
        "atchFileId": "",
        "fileDetailSn": "1",
        "publicDataTyCode": "PR0051",
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/tcs/dss/selectFileDataDownload.do", data=body,
        headers={"User-Agent": UA, "Referer": page, "X-Requested-With": "XMLHttpRequest"},
    )
    meta = json.loads(op.open(req, timeout=60).read().decode("utf-8"))
    if not meta.get("status") or not meta.get("atchFileId"):
        raise RuntimeError(f"{pk}: download meta failed: {str(meta)[:200]}")
    url = f"{BASE}/cmm/cmm/fileDownload.do?atchFileId={meta['atchFileId']}&fileDetailSn={meta['fileDetailSn']}"
    target.parent.mkdir(parents=True, exist_ok=True)
    with op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=900) as r, \
            target.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    print(f"downloaded {target.name}: {target.stat().st_size:,} bytes")


def download_overpass(target: Path) -> None:
    if target.exists() and target.stat().st_size > 5000:
        print(f"skip (exists): {target.name}")
        return
    q = urllib.parse.urlencode({"data": OVERPASS_QUERY})
    for m in OVERPASS_MIRRORS:
        try:
            req = urllib.request.Request(f"{m}?{q}", headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
            data = urllib.request.urlopen(req, timeout=320).read()
            if len(data) > 5000:
                target.write_bytes(data)
                print(f"downloaded {target.name} via {m}: {len(data):,} bytes")
                return
        except Exception as e:  # noqa: BLE001 — try next mirror
            print(f"overpass mirror failed {m}: {e}")
    raise RuntimeError("all Overpass mirrors failed")


def main(argv: list[str]) -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    only = [a.lower() for a in argv]
    selected = [d for d in FILE_DATASETS if not only or any(k in d[2].lower() for k in only)]
    if only and not selected:
        print(f"no dataset matches {argv}; known targets: {[d[2] for d in FILE_DATASETS]}")
        return 2
    for pk, detail, name in selected:
        download_datagokr(pk, detail, RAW / name)
    if only:
        print("raw subset complete")
        return 0
    download_overpass(RAW / "osm_substations.json")
    schools = RAW / "schools.csv"
    if schools.exists() and schools.stat().st_size > 100000:
        print("skip (exists): schools.csv")
    else:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "fetch_schools.py")], check=True)
    print("raw data complete")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
