"""Run the full data pipeline and sync outputs into the prototype app."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
OUT = ROOT / "out"
CURATED = ROOT / "curated"
APP_DATA = ROOT.parent / "prototype" / "public" / "data"

PIPELINE = ["p01_power.py", "p02_schools.py", "p03_population.py", "p04_centroids_enrich.py", "p05_permits_api.py"]


def main() -> int:
    for name in PIPELINE:
        print(f"== {name}")
        r = subprocess.run([sys.executable, str(SCRIPTS / name)])
        if r.returncode != 0:
            print(f"FAIL: {name}")
            return 1

    r = subprocess.run([sys.executable, str(SCRIPTS / "validate_out.py")])
    if r.returncode != 0:
        print("FAIL: validate_out")
        return 1

    APP_DATA.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.json"):
        shutil.copy2(f, APP_DATA / f.name)
    for name in ("constants.json", "scenarios.json", "cases.csv", "regulations.csv"):
        shutil.copy2(CURATED / name, APP_DATA / name)
    sizes = {p.name: p.stat().st_size for p in sorted(APP_DATA.iterdir())}
    print("app data synced:")
    print(json.dumps(sizes, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
