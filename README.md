# 여기 DC 돼요? — 데이터센터 부지 전력·인허가 리스크 스크리닝

서비스명 "여기 DC 돼요?"는 **가칭**이다. 내부 코드명 The Grand Site DC와 Vercel 프로젝트명 `grand-site-dc`,
OpenRouter `X-Title` 헤더는 그대로 둔다(배포·환경변수가 걸려 있다).

데이터센터 후보 부지를 지도에서 찍거나 주소·읍면동으로 검색하면 ① 전력 수전 가능성(읍면동 공급가능 변전소·변전소 거리·지역 승인률)
② 인허가 지연 리스크(주거·학교 근접, 용도지역, 지자체 규제, 갈등 사례) ③ 부지 지형(경사도·육지/수역 판정)을 점수화하고,
예상 지연 개월을 금융비용(원)으로 환산한 뒤 실사 체크리스트 보고서(PDF 인쇄)로 내보낸다. GS그룹 해커톤(PLAI CAMP S3) 개발자리그 출품용 프로토타입.

- 저장소: https://github.com/seungminyi-byte/Camp_It_Ralph (브랜치 `seungminyi-byte-prototype`)
- 배포(프로덕션): https://grand-site-dc.vercel.app (Vercel Hobby, 팀 `camp-it-ralph` · 프로젝트 `grand-site-dc`)
- 로컬 실행: http://localhost:5199 (아래 빠른 시작)
- 계획서: [docs/PLAN.md](docs/PLAN.md) · 데이터 인벤토리: [docs/DATA.md](docs/DATA.md)

## 빠른 시작 (새 환경)

```bash
git clone -b seungminyi-byte-prototype https://github.com/seungminyi-byte/Camp_It_Ralph.git
cd Camp_It_Ralph/prototype
npm install
npm run dev -- --port 5199
```

앱 데이터(`prototype/public/data/*.json`, 약 5.3MB)는 커밋되어 있어 위 4줄로 바로 동작한다.
원본 데이터부터 다시 만들려면(선택, 약 640MB 다운로드):

```bash
python data-pack/scripts/fetch_raw.py      # 공공데이터포털·OSM 원본 6종 다운로드 (키 불필요)
python data-pack/scripts/build_all.py      # 전처리 p01~p07 → 검증 → prototype/public/data 동기화
```

Python 3.12+ 와 `pip install pyshp pyproj`. 지형만 다시 만들 때는 `pyshp`·`pyproj` 없이도 된다 —
`p07_terrain.py`는 표준 라이브러리만 쓰고 Python 3.9에서도 돌아간다:

```bash
python3 data-pack/scripts/p07_terrain.py                       # 지형 타일 188MB 1회 다운로드 → raw/terrain 캐시
cp data-pack/out/terrain_grid.json prototype/public/data/      # build_all을 못 돌리는 환경에서의 수동 동기화
```

인구 격자만 다시 만들 때(SGIS 2024 1km 격자, 전국 73,016셀 · `pyshp`·`pyproj` 필요):

```bash
python3 data-pack/scripts/fetch_raw.py sgis                    # 격자 zip 98MB만 재다운로드 (인자 = 대상 파일명 키워드)
python3 data-pack/scripts/p03_population.py                    # → data-pack/out/pop_grid.json (전국, 클리핑 없음)
cp data-pack/out/pop_grid.json prototype/public/data/
```

Windows에서 저장소 경로에 `&`가 있으면 `npx`가 깨지므로
`node node_modules/typescript/bin/tsc -b`, `node node_modules/vitest/vitest.mjs run` 처럼 node로 직접 실행한다.

## 검증

```bash
cd prototype && npm run typecheck                # 타입 검사 (src + api + scripts)
cd prototype && npm run lint                     # oxlint
node node_modules/vitest/vitest.mjs run          # 테스트 72건 (엔진 골든 19 · 지형 12 · 검색 11 · 체크리스트 7 · 메모 파서 8 · 비교 핀 7 · 자료 범위 3 · 숫자 입력 5)
python data-pack/scripts/validate_out.py         # 데이터 스키마·좌표·커버리지·지형·시나리오 스팟체크
```

브라우저 확인(검색창에 입력 → Enter):
- `덕이동` → 고양 덕이동 D등급 + "주민 갈등 가능성 높음" 배지, `인천 청천동` + 주거지역 선택 → E등급(조례상 입지 불가),
  `세종 반곡동` + 공업지역 → 비수도권 대조군.
  (골든 테스트는 시나리오 좌표 기준으로 **D 45 / E 32 / B 75**. 검색은 읍면동 중심점이라 점수가 조금 다를 수 있다.)
- **반응형**: lg(1024px) 미만에서는 지도가 위(42vh)·패널이 아래로 쌓이고, 지도 레이어 토글은 "레이어" 버튼으로 접힌다.
  체크리스트 표는 자체 가로 스크롤 박스 안에서만 넘치고(인쇄본은 A4 그대로), 모바일 브라우저 주소창을 고려해 `100dvh`를 쓴다.
- 헤더 아래 **비교 트레이**: "현재 지점 담기"로 최대 4곳을 담으면 같은 사업 가정(총사업비·금리 입력값 공통 적용)으로
  등급·예상 지연·지연 금융비용이 나란히 뜨고, 우측에 최대 차액이 표시된다. 칩을 누르면 그 지점으로 돌아간다.
- `37.4, 126.2` → "해상·수역 — 평가 대상 아님" 카드 + "매립·간척 예정지로 간주" 버튼.
- `38.0, 126.5`(개성 인근)나 지도에서 북한·일본·먼바다를 클릭 → **"판독 불가 — 남한 자료 범위 밖"** 카드. 등급·체크리스트가 뜨지 않고
  "현재 지점 담기"도 막힌다. 판정 규칙은 `constants.scoring.coverage`(bbox 33~38.7°/124.5~132° · 휴전선/NLL 폴리라인 21점 ·
  읍면동 중심점 20km 초과)이고, 폴리라인이 남한 읍면동 중심점 5,471건을 하나도 자르지 않는지 `coverage.test.ts`·`validate_out.py`가
  감시한다. `35.6, 139.7`처럼 아예 범위 밖인 좌표는 검색창이 바로 알려준다.
- 총사업비·연 금리는 슬라이더 대신 **직접 입력**(억원·%, "1.5조"도 인식) + 프리셋 칩 + −/+ 버튼·↑↓ 키(Shift는 ×10).
  입력 범위는 100억~10조 · 1~20%이고 총사업비 옆에 "약 40MW급(MW당 125억원 기준)" 환산이 붙는다.
- 우측 패널 하단 디스클레이머는 "스크리닝 참고용 · 한전 공식 검토·법률 판단 대체 불가" 한 줄만 보이고, 호버·키보드 포커스·탭(자세히)으로
  전문이 위로 펼쳐진다. 지도와 패널 사이 세로 핸들을 드래그하면 **패널 폭**(320~760px)이 바뀌고 새로고침 후에도 유지된다
  (더블클릭·Enter 초기화, ←/→ 키 조절, lg 미만 스택 레이아웃에서는 숨김).
- `37.85, 128.45` → 지형 감점 −30, "급경사 산지" 배지, 중앙값 경사 28°.
- `부산 우동`(해운대) → 반경 1km 인구 수만 명·"주거 인접" 감점 표시. 2026-09-05 전국 격자 확장 전에는 수도권·일부 대조군 밖이
  전부 0명이었다.
- "AI 검토 의견 생성" → 12행 체크리스트가 순서대로 채워지고 "PDF로 저장"으로 A4 보고서 인쇄.
- 지도 우상단 "용도지역 (VWorld)"를 켜고 줌 12 이상에서 노랑(주거)·분홍(상업)·보라(공업)·연두(녹지) 색이 깔리면 프록시·키가 정상.

## 직접 발급이 필요한 키 (전부 무료, 본인 계정 필요)

에이전트가 대신 가입·발급할 수 없다. 발급 후 사용처에 넣으면 된다.

| 키 | 발급 URL | 사용처 | 필요 시점 |
|---|---|---|---|
| **OpenRouter** (`:free` 모델) | https://openrouter.ai/keys · 모델 목록 https://openrouter.ai/models?q=free | Vercel 환경변수 `OPENROUTER_API_KEY` + `LLM_MODEL=minimax/minimax-m3:free` → `prototype/api/generate.ts` | 실사 체크리스트의 AI 검토 의견 |
| VWorld (국토부) | https://www.vworld.kr/dev/v4dv_apikey_s001.do (서비스 URL에 https://grand-site-dc.vercel.app 등록) | Vercel 환경변수 `VWORLD_API_KEY` (`vercel env add VWORLD_API_KEY production`·`preview`) → `api/wms.ts`(용도지역 WMS 오버레이) · `api/zoning.ts`(용도지역 자동 판정) · `api/geocode.ts`(주소 검색) | 용도지역·주소 검색 |
| 건축HUB 건축인허가 API | https://www.data.go.kr/data/15136267/openapi.do → 활용신청(자동승인). 인증키는 마이페이지의 일반 인증키 **Decoding** 값 | 로컬 `data-pack/.env`의 `DATA_GO_KR_API_KEY`(무시됨, Encoding·Decoding 키 모두 허용) → `data-pack/scripts/p05_permits_api.py`(구현됨) 시군구별 허가→착공 지연 통계 → `permit_delay.json`. Vercel 환경변수에도 같은 이름으로 보관 | 허가→착공 통계 |
| 네이버 검색 API (NAVER API HUB) | https://console.ncloud.com/naver-api-hub/application → Application 등록 → [인증 정보]에서 Client ID·Secret 확인. **developers.naver.com이 아니다** — 검색 API는 네이버 클라우드의 API HUB로 이관됐고 호출 주소·헤더가 다르다 | 로컬 `data-pack/.env`의 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` → `data-pack/scripts/p06_news_api.py`(구현됨) 지역별 갈등 기사 카운트 → `news_signal.json`. Vercel 환경변수에도 같은 이름으로 보관 | 뉴스 갈등 시그널 |

LLM 키는 **서버에만** 둔다. 브라우저에 키를 넣는 UI는 없앴고, 앱은 `POST /api/generate`(Vercel Edge → OpenRouter)만 호출한다.
프록시가 실패하면 `public/data/precomputed_memos.json`의 사전 생성 메모로 폴백하는데, 등록된 지점 **반경 300m 이내**에서만 뜬다.
사전 생성은 사용자 키로 직접 실행한다(아직 파일 없음):

```bash
cd prototype && OPENROUTER_API_KEY="sk-or-..." node node_modules/tsx/dist/cli.mjs scripts/precompute_memos.ts
```

로컬 `npm run dev`에는 `/api/*`가 없으므로 `vite.config.ts`가 프로덕션 배포로 프록시한다 —
배포된 함수(`wms`·`generate`)는 로컬에서도 동작하고, 아직 배포되지 않은 함수는 404가 되어 UI가 "자동 판정 불가"로 안내한다.

## 폴더 구조

```
data-pack/
  raw/        원본 다운로드 (git 제외, fetch_raw.py로 재현) — SOURCES.md만 커밋
  curated/    수동 큐레이션: cases.csv(갈등 12건) regulations.csv(규제 5건) constants.json(가중치·통계) scenarios.json
  scripts/    fetch_raw → p01_power → p02_schools → p03_population → p04_centroids_enrich
              → p05_permits_api(건축HUB) → p06_news_api(네이버 뉴스) → p07_terrain(지형, stdlib만)
              → validate_out → build_all
  out/        전처리 산출 JSON (커밋됨)
prototype/    Vite + React + TS. src/scoring/engine.ts 순수 스코어링 엔진 + engine.test.ts 골든 테스트
  src/scoring/terrain.ts   지형 격자 디코딩·육지/수역 판정·경사 감점 (순수 함수)
  src/scoring/coverage.ts  남한 자료 범위 판정 (bbox·휴전선/NLL 폴리라인·읍면동 중심점 거리) → '판독 불가'
  src/search/emdSearch.ts  오프라인 읍면동 검색 (번들 센트로이드 5,471건)
  src/report/checklist.ts  ScoreResult → 실사 체크리스트 12행
  src/compare/pins.ts      비교 트레이 순수 로직(핀 추가·제거·상한·차액). 점수는 scoreSite 재호출로만 얻는다
  src/lib/format.ts        fmtKrw·등급 색·행정구역 라벨 공용
  src/lib/numberInput.ts   총사업비·금리 입력 파싱("1.5조")·클램프 (NumberField.tsx가 사용)
  src/lib/panelWidth.ts    우측 패널 폭 범위·localStorage 저장 (PanelResizer.tsx가 사용)
  src/genai/memoFormat.ts  LLM "## 섹션" 응답 파서 (스트리밍 중에도 부분 파싱)
  api/_vworld.ts    VWorld 공통 헬퍼 (라우트 아님 — Vercel은 `_` 접두 파일을 배포하지 않는다)
  api/generate.ts   Vercel Edge 프록시 (OpenRouter 단일, 기본 모델 minimax/minimax-m3:free)
  api/wms.ts        Vercel Edge 프록시 (VWorld 용도지역 WMS 타일, 서울 리전 icn1 고정 — 해외 PoP는 VWorld가 차단)
  api/zoning.ts     Vercel Edge 프록시 (VWorld 2D Data API 점 조회 → 용도지역 자동 판정)
  api/geocode.ts    Vercel Edge 프록시 (VWorld Geocoder → 도로명·지번 주소 검색)
  public/data/permit_delay.json  건축HUB 허가→착공 통계 (p05 산출; 없으면 해당 감점 비활성)
  public/data/news_signal.json   네이버 뉴스 갈등 기사 카운트 (p06 산출; 없으면 해당 감점 비활성)
  public/data/terrain_grid.json  0.01° 지형 격자 (p07 산출; 없으면 지형 감점·수역 판정 비활성)
  vercel.json       Node 함수 리전 icn1 고정 (한국 공공 API 호출용)
docs/         PLAN.md(전체 계획·일정) DATA.md(데이터 출처·제약·정정사항)
.claude/      launch.json (Claude Code 브라우저 프리뷰용 dev 서버 정의)
```

## 현재 상태와 다음 단계

완료: 데이터 확보·전처리·검증, 앱(지도·스코어카드·슬라이더·사례 레이어·통계 스트립), 골든 테스트, 프로덕션 빌드,
Vercel 배포(2026-09-03), VWorld 용도지역 오버레이·건축HUB 허가→착공 통계·네이버 뉴스 갈등 시그널(2026-09-04)로 P1 확장 3종 완료.
2026-09-04 개편: 데모 시나리오 버튼 제거 + **주소·읍면동·좌표 검색**, **용도지역 자동 판정**(VWorld Data API),
**지형 경사도 감점·해상 수역 판정**(SRTM 기반 0.01° 격자), 실사 메모를 **고정 서식 체크리스트 보고서 + PDF 인쇄**로 교체,
LLM 설정 UI 삭제(서버 프록시 OpenRouter·MiniMax 단일 경로).
2026-09-05 개편: 헤더에 서비스명, 시장 통계 스트립 → **부지 비교 트레이**, 갈등 사례 드로어 → **주민 갈등 가능성 지표**
(`permit.conflictRisk` — 기존 갈등 감점 3종의 합을 낮음/주의/높음으로 등급화, 점수는 불변).
2026-09-05 후속: 남한 자료 범위 밖 **'판독 불가'** 판정(`site.status = 'outside'`), 화면·보고서·프롬프트의 직역체 정비
(전력 축/인허가 축 → 전력 수전 가능성/인허가 여건 · 전력 게이트 → 공급가능 변전소 미확인으로 등급 제한 · 앵커 → 참조 사례 ·
점추정 → 대표값 · 뉴스 갈등 시그널 → 뉴스 갈등 보도 · 행정구역 매칭 실패 → 행정구역 미확인), 총사업비·금리 직접 입력,
디스클레이머 접기, 패널 폭 조절. 이어서 **인구 격자 전국 확장**(21,944 → 73,016셀): `p03_population.py`의 bbox 클리핑을 제거해
부산·울산·창원·제주·강원 동부·전남·경북에서도 '주거 인접' 감점이 계산된다.

남은 일 (PLAN.md P4~P6, 해커톤 9.21~22):

1. 사전 생성 메모(`precomputed_memos.json`) 생성 — OpenRouter 키로 `scripts/precompute_memos.ts` 실행(위 "직접 발급이 필요한 키" 참조).
   없으면 프록시 실패 시 폴백이 비어 있다.
2. ~~Vercel 배포~~ 완료 → 공유 URL https://grand-site-dc.vercel.app. 환경변수는 `OPENROUTER_API_KEY` +
   `LLM_MODEL=minimax/minimax-m3:free` (Production·Preview). 배포 자동화는 `.github/workflows/vercel-prod.yml`:
   이 브랜치의 `prototype/**` 푸시 시 GitHub Actions가 Vercel CLI로 프로덕션 배포 (저장소 시크릿 `VERCEL_TOKEN` 필요).
   Vercel GitHub 앱 연동은 쓰지 않는다 — Hobby 플랜은 팀 소유자 커밋만 배포하고, 기본 브랜치(팀원)에 `prototype/`가
   없어 실패 표시가 남는다. 수동 배포는 `cd prototype && vercel --prod` (처음이면 `vercel link --project grand-site-dc`).
   프리뷰 URL은 Vercel 로그인 사용자만 열 수 있다(기본 Deployment Protection).
3. ~~P1 확장~~ 완료 (VWorld 용도지역 오버레이 · 건축HUB 허가→착공 통계 · 네이버 뉴스 갈등 시그널). 갱신은
   `data-pack/.env`에 키를 두고 `python data-pack/scripts/p05_permits_api.py`(법정동 단위 페이징, `raw/permits/` 캐시) ·
   `python data-pack/scripts/p06_news_api.py`(지역 21개 × 질의 3개, `raw/news/` 캐시, 키 확인은 `--check`).
   두 스크립트 모두 키가 없으면 경고 후 종료하고 기존 산출물을 유지한다. 산출물은 `data-pack/out/*.json` →
   `prototype/public/data/`로 복사(전체 재빌드가 가능한 환경이면 `build_all.py`가 대신 한다)
4. `docs/DEMO.md` 데모 대본, `ralphathon/` 현장 재빌드 팩(SPEC·TASKS·prompts·fixtures) + 빈 폴더 재빌드 드라이런

## 데이터 출처 요약

공공데이터포털(한전 공급가능 변전소·DC 전기공급 현황·학교 위치·SGIS 1km 격자 인구 전국 73,016셀·상가업소·공공DC 시설),
OpenStreetMap(변전소 좌표, 참고치), 언론보도 큐레이션(갈등·규제 사례). 상세와 제약은 `docs/DATA.md`.
한전 공개 여유용량은 발전접속 기준이라 수전 판단에 직접 쓰지 않았고, 변전소 공식 좌표는 비공개다.
