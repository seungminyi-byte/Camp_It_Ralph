"""Reproduce the PDF font from the pinned upstream variable font (fonttools 4.65.0)."""
from pathlib import Path
import hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

base = Path(__file__).resolve().parent / 'noto-kr'
source = base / 'NotoSansKR-VF.ttf'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '9e1d729e7e2b36f9ef439da102f8c134c10aabe46f1c843bf0aca5c043b86f76'
font = TTFont(source, recalcTimestamp=False)
static = instantiateVariableFont(font, {'wght': 400}, inplace=False)
static.recalcTimestamp = False
target = base / 'NotoSansKR-Regular.ttf'
static.save(target)
print(target.name, target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest())
