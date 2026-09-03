# raw/ 원본 파일 출처 기록

수집일: 2026-09-01. 원본은 수정하지 않는다. 상세 설명은 `docs/DATA.md`.

| 파일 | 출처 | 수집 방법 |
|---|---|---|
| kepco_supply_emd.csv | data.go.kr 15128065 한국전력공사_지역별 공급가능 변전소 정보 | fileDownload.do (atchFileId=FILE_000000002911269) |
| kepco_dc_status.csv | data.go.kr 15127315 한국전력공사_데이터센터 전기공급 현황 | fileDownload.do (FILE_000000003087742) |
| gov_facilities.csv | data.go.kr 15080581 행안부_행정·공공기관 정보시스템 운영시설 현황 | fileDownload.do (FILE_000000003650490) |
| schools.csv | data.go.kr 15021148 전국초중등학교위치표준데이터 | scripts/fetch_schools.py (columList.json + standard.json 그리드 API, 12,011행) |
| sgis_grid/sgis_grid.zip | data.go.kr 15141768 국가데이터처_SGIS 격자 통계 및 경계 (2024년 1km 격자 인구 + 경계 SHP EPSG:5179) | selectFileDataDownload.do 2단계 POST (98.4MB) |
| sanga.zip | data.go.kr 15083033 소상공인시장진흥공단_상가(상권)정보 202606 (시도별 CSV 17개, UTF-8) | selectFileDataDownload.do 2단계 POST (352.7MB) — 법정동 센트로이드 보강용 |
| osm_substations.json | OpenStreetMap Overpass API (power=substation, 남한 1,192개) | maps.mail.ru 미러 GET (overpass-api.de는 사내망에서 406) |

주의:
- data.go.kr 파일 다운로드는 `POST /tcs/dss/selectFileDataDownload.do` (publicDataPk·publicDataDetailPk·publicDataTyCode=PR0051) → 응답의 atchFileId로 `GET /cmm/cmm/fileDownload.do` 2단계.
- 표준데이터(학교)는 `GET /download/columList.json?pk=…&ext=CSV` → `GET /download/standard.json?publicDataPk=…&colNmList=…&page=1..N` (page는 1부터).
- OSM 데이터는 공식 자료 아님 — 앱·문서에 참고치 명시.
