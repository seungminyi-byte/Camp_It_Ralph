# raw/ 원본 파일 출처 기록

수집일: 2026-09-01. 원본은 수정하지 않는다. 상세 설명은 `docs/DATA.md`.

| 파일 | 출처 | 수집 방법 |
|---|---|---|
| kepco_supply_emd.csv | data.go.kr 15128065 한국전력공사_지역별 공급가능 변전소 정보 | fileDownload.do (atchFileId=FILE_000000002911269) |
| kepco_dc_status.csv | data.go.kr 15127315 한국전력공사_데이터센터 전기공급 현황 | fileDownload.do (FILE_000000003087742) |
| gov_facilities.csv | data.go.kr 15080581 행안부_행정·공공기관 정보시스템 운영시설 현황 | fileDownload.do (FILE_000000003650490) |
| schools.csv | data.go.kr 15021148 전국초중등학교위치표준데이터 | scripts/fetch_schools.py (columList.json + standard.json 그리드 API, 12,011행) |
| sgis_grid/sgis_grid.zip | data.go.kr 15141768 국가데이터처_SGIS 격자 통계 및 경계 (2024년 1km 격자 인구 + 경계 SHP EPSG:5179) | selectFileDataDownload.do 2단계 POST (98.4MB) · 2026-09-05 macOS에서 `fetch_raw.py sgis`로 재수집, 동일 98,426,954바이트 |
| sanga.zip | data.go.kr 15083033 소상공인시장진흥공단_상가(상권)정보 202606 (시도별 CSV 17개, UTF-8) | selectFileDataDownload.do 2단계 POST (352.7MB) — 법정동 센트로이드 보강용 |
| osm_substations.json | OpenStreetMap Overpass API (power=substation, 남한 1,192개) | maps.mail.ru 미러 GET (overpass-api.de는 사내망에서 406) |
| protected/knps_park_boundary.zip | data.go.kr 15017313 국립공원공단_국립공원 공원경계 (BSI_NPK_BBNDR.shp, 23곳, EPSG:5179, cp949, 기준 2024-12-30) | selectFileDataDownload.do 2단계 POST (0.33MB) — publicDataDetailPk에 `_201709051712` 접미사 필요 · 이용허락범위 제한 없음 |
| protected/kdpa_2016.zip | data.go.kr 15127921 국립공원공단_한국보호지역 데이터 KDPA (wdpa_kor_poly_2016.shp, 1,516 폴리곤, EPSG:4326, UTF-8, 2016-12-31 기준) | selectFileDataDownload.do 2단계 POST (19.5MB) · 이용허락범위 제한 없음 |
| terrain/N{33..38}E{125..129}.hgt.gz | AWS Open Data — Mapzen/Tilezen Terrain Tiles, skadi 1" HGT (SRTM 30m 육지 + ETOPO1 수심) | scripts/p07_terrain.py 익명 GET 30타일 188MB (키 불필요). 표기 의무: "SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 DOC/NOAA/NESDIS/NCEI" |

주의:
- data.go.kr 파일 다운로드는 `POST /tcs/dss/selectFileDataDownload.do` (publicDataPk·publicDataDetailPk·publicDataTyCode=PR0051) → 응답의 atchFileId로 `GET /cmm/cmm/fileDownload.do` 2단계.
  `fetch_raw.py <키워드>`는 대상 파일명에 키워드가 든 항목만 받는다(예: `sgis`) — 상가 352MB를 피할 때.
- 표준데이터(학교)는 `GET /download/columList.json?pk=…&ext=CSV` → `GET /download/standard.json?publicDataPk=…&colNmList=…&page=1..N` (page는 1부터).
- OSM 데이터는 공식 자료 아님 — 앱·문서에 참고치 명시.
- Terrain Tiles의 SRTM은 2000-02 촬영본이고 수역은 SWBD 마스크로 지워져 ETOPO1 수심이 드러난다. 그래서
  **2000년 이후 매립지(송도·새만금·시화)는 표고가 음수**로 나오고, 내륙 호수는 주변 지형으로 메워져 육지로 나온다.
