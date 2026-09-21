"""Inspect newly printed product PDFs; rendering is separate from human page review.

Usage: python e2e/inspect-pdf.py [e2e/artifacts/pdf] [--render]
Requires pypdf/pdfplumber and, for --render, Poppler pdftoppm on PATH.
"""
from pathlib import Path
import argparse
import hashlib
import json
import logging
import re
import subprocess
from pypdf import PdfReader
import pdfplumber

logging.getLogger('pdfminer').setLevel(logging.ERROR)
parser = argparse.ArgumentParser()
parser.add_argument('directory', nargs='?', default='e2e/artifacts/pdf')
parser.add_argument('--render', action='store_true')
args = parser.parse_args()
root = Path(args.directory)
rows = []
for name, table_count in [('empty', 1), ('numeric', 3), ('zero', 2), ('long-partial', 5), ('ai', 1)]:
    path = root / (name + '.pdf')
    reader = PdfReader(path)
    texts = [page.extract_text() or '' for page in reader.pages]
    compact = re.sub(r'\s+', '', re.sub(r'^\d+ / \d+\s*$', '', '\n'.join(texts), flags=re.M))
    # Independent arithmetic, not scoreSite output. 1000억원 × rate/100 × months/12.
    rates = [4.5, 5.5, 6.5] if name == 'empty' else [4, 6, 8]
    matrix = '연금리/지연6개월12개월24개월' + ''.join(str(rate) + '%' + ''.join(
        '계산보류' if name == 'empty' else '0원' if name == 'zero'
        else f'{int(1000 * rate / 100 * months / 12)}억원' for months in (6, 12, 24)
    ) for rate in rates)
    with pdfplumber.open(path) as doc:
        page_bounds = [{'page': i + 1, 'textCharacters': len(page.chars), 'outsidePage': sum(
            char['x0'] < -0.5 or char['x1'] > page.width + 0.5 or char['top'] < -0.5 or char['bottom'] > page.height + 0.5
            for char in page.chars)} for i, page in enumerate(doc.pages)]
    checks = {
        'a4': all(abs(float(p.mediabox.width) - 595.276) < 1 and abs(float(p.mediabox.height) - 841.89) < 1 for p in reader.pages),
        'firstPageFive': all(s in texts[0] for s in ['후보 위치', '확인된 주요 제약', '중요한 미확인', '담은 후보 비교 요약', '다음 확인사항']),
        'matrix9cells': compact.count(matrix) == table_count,
        'aiOnlyExplicit': ('선택부록·AI검토의견' in compact) == (name == 'ai'),
        'noReplacementGlyph': '\ufffd' not in compact,
        'noEmptyOrOutsidePageText': all(p['textCharacters'] > 20 and p['outsidePage'] == 0 for p in page_bounds),
        'sourceAndDates': all(s in compact for s in ['자료출처·기준일·공간단위·한계', '2024-05-13', 'API조회']),
    }
    if name != 'empty':
        checks['area15000short5000'] = all(s in re.sub(r'\s+', '', texts[0]) for s in ['최소대지15,000㎡', '부족5,000㎡'])
    if name == 'numeric':
        checks['costDifference300'] = '입력사업비차이300억원' in compact
    if name == 'long-partial':
        sentinels = [f'{c}_{k}_NOTE_END' for c in 'ABCDE' for k in ['power', 'water', 'telecom']] + [f'{c}_LABEL_END' for c in 'ABCDE'] + ['HERITAGE_DIRECT_END', 'HERITAGE_NEARBY_END']
        checks['all22LongTextEnds'] = all(s in compact for s in sentinels)
        checks['fourPinsExcludeCurrentE'] = '담은후보비교요약·4곳' in compact and '현재후보는포함되지않음' in compact
        checks['BHeadingOnOnePage'] = any('2.합성후보B' in re.sub(r'\s+', '', text) and 'B_LABEL_END' in text for text in texts)
    path.with_suffix('.extracted.txt').write_text('\n'.join(texts))
    if args.render:
        subprocess.run(['pdftoppm', '-r', '100', '-png', str(path), str(path.with_suffix(''))], check=True)
    rows.append({'case': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'pages': len(texts), 'checks': checks, 'pageBounds': page_bounds, 'pass': all(checks.values())})
result = {'cases': rows, 'totalPages': sum(r['pages'] for r in rows), 'pass': all(r['pass'] for r in rows), 'visualReviewRequired': True}
(root / 'checks.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps({r['case']: {'pages': r['pages'], 'pass': r['pass'], 'failed': [k for k, v in r['checks'].items() if not v]} for r in rows}, ensure_ascii=False))
if not result['pass']:
    raise SystemExit(1)
