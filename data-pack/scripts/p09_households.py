"""Extract SGIS 2024 total households, preserving missing and explicit zero cells."""
import csv
import hashlib
import re
import io
import json
import zipfile
from pathlib import Path

import shapefile
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]


def main():
    values = {}
    archive = ROOT / 'raw/sgis_grid/sgis_grid.zip'
    source_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    tf = Transformer.from_crs(5179, 4326, always_xy=True)
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if '(가구)' not in name or not name.endswith('_1K.csv'):
                continue
            with z.open(name) as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding='cp949')):
                    if row['통계항목'] != 'to_ga_001':
                        continue
                    if row['기준연도'] != '2024':
                        raise ValueError('Unexpected household source year')
                    key = row['격자코드']
                    if not re.fullmatch(r'[가-힣]{2}[0-9]{4}', key):
                        raise ValueError('Invalid household grid code')
                    raw = row['통계값'].strip()
                    val = int(raw) if raw.isdecimal() else None
                    if key in values and values[key] != val:
                        raise ValueError('Conflicting household cell: ' + key)
                    values[key] = val
        cells = {}
        for name in z.namelist():
            if '2. 경계' not in name or not name.endswith('_1K.shp'):
                continue
            base = name[:-4]
            reader = shapefile.Reader(**{k: io.BytesIO(z.read(base + '.' + k)) for k in ('shp', 'shx', 'dbf')})
            fields = [f[0] for f in reader.fields[1:]]
            indices = [i for i, f in enumerate(fields) if 'GRID' in f.upper() or '격자' in f]
            if len(indices) != 1:
                raise ValueError('Boundary grid identifier is ambiguous')
            idx = indices[0]
            for record in reader.iterShapeRecords():
                key = str(record.record[idx])
                b = record.shape.bbox
                lng, lat = tf.transform((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
                cell = [round(lat, 5), round(lng, 5), values.get(key)]
                if key in cells and cells[key] != cell:
                    raise ValueError('Conflicting boundary cell: ' + key)
                cells[key] = cell
    missing_boundaries = set(values) - set(cells)
    if missing_boundaries:
        raise ValueError('Household cells without boundaries: ' + str(len(missing_boundaries)))
    result = {
        'version': 1, 'indicator': 'to_ga_001', 'pipelineVersion': 'p09-v1', 'sourceSha256': source_hash, 'source': 'SGIS 격자 통계 및 경계',
        'sourceUrl': 'https://www.data.go.kr/data/15141768/fileData.do',
        'year': 2024, 'spatialUnit': '1km 격자 중심점 (EPSG:5179 → WGS84)',
        'note': '총가구수(to_ga_001). 주민등록 세대수와 다름. 비밀보호 값 조정 포함. 결측은 null, 명시적 0은 0.',
        'rows': [cells[k] for k in sorted(cells)],
    }
    out = ROOT / 'out/households_grid.json'
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('household cells:', len(cells), 'known:', sum(c[2] is not None for c in cells.values()), 'bytes:', out.stat().st_size)


if __name__ == '__main__':
    main()
