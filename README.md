# The Grand Site DC — 데이터센터 부지 전력·인허가 리스크 스크리닝

데이터센터 후보 부지를 지도에서 찍으면 ① 전력 수전 가능성(읍면동 공급가능 변전소·변전소 거리·지역 승인률)
② 인허가 지연 리스크(주거·학교 근접, 용도지역, 지자체 규제, 갈등 사례)를 점수화하고,
예상 지연 개월을 금융비용(원)으로 환산해 보여준다. GS그룹 해커톤(PLAI CAMP S3) 개발자리그 출품용 프로토타입.

- 저장소: https://github.com/smy_gsenc/grand-site-dc (브랜치 `prototype/hackathon-2026`)
- 로컬 실행: http://localhost:5199 (아래 빠른 시작)
- 계획서: [docs/PLAN.md](docs/PLAN.md) · 데이터 인벤토리: [docs/DATA.md](docs/DATA.md)

## 빠른 시작 (새 환경)

```bash
git clone -b prototype/hackathon-2026 https://github.com/smy_gsenc/grand-site-dc.git
cd grand-site-dc/prototype
npm install
npm run dev -- --port 5199
```

앱 데이터(`prototype/public/data/*.json`, 약 2.6MB)는 커밋되어 있어 위 4줄로 바로 동작한다.
원본 데이터부터 다시 만들려면(선택, 약 450MB 다운로드):

```bash
python data-pack/scripts/fetch_raw.py      # 공공데이터포털·OSM 원본 6종 다운로드 (키 불필요)
python data-pack/scripts/build_all.py      # 전처리 p01~p04 → 검증 → prototype/public/data 동기화
```

Python 3.12+ 와 `pip install pyshp pyproj`. Windows에서 저장소 경로에 `&`가 있으면 `npx`가 깨지므로
`node node_modules/typescript/bin/tsc -b`, `node node_modules/vitest/vitest.mjs run` 처럼 node로 직접 실행한다.

## 검증

```bash
node node_modules/typescript/bin/tsc -b          # 타입 검사
node node_modules/vitest/vitest.mjs run          # 골든 테스트 6건 (시나리오 3 + 경계 3)
python data-pack/scripts/validate_out.py         # 데이터 스키마·좌표·커버리지·시나리오 스팟체크
```

브라우저에서 시나리오 버튼 3개를 눌러 등급이 **고양 덕이동 C~D / 인천 주거 인접 E(조례상 입지 불가 배지) / 세종 A~B**로 나오면 정상.

## 직접 발급이 필요한 키 (전부 무료, 본인 계정 필요)

에이전트가 대신 가입·발급할 수 없다. 발급 후 사용처에 넣으면 된다.

| 키 | 발급 URL | 사용처 | 필요 시점 |
|---|---|---|---|
| **Google Gemini** (무료 티어) | https://aistudio.google.com/apikey | 앱 "LLM 설정" 또는 Vercel 환경변수 `GEMINI_API_KEY` | 실사 메모 생성 (기본 제공자) |
| OpenRouter (`:free` 모델) | https://openrouter.ai/keys · 모델 목록 https://openrouter.ai/models?q=free | 앱 "LLM 설정" 또는 `OPENROUTER_API_KEY` | Gemini 대안 |
| Anthropic (유료) | https://console.anthropic.com/settings/keys | 앱 "LLM 설정" 또는 `ANTHROPIC_API_KEY` | 품질 우선 시 |
| VWorld (국토부) | https://www.vworld.kr/dev/v4dv_apikey_s001.do | `data-pack/scripts/00_geocode_emd.py`(미작성)·용도지역 WMS 오버레이 | P1 확장 |
| 건축HUB 건축인허가 API | https://www.data.go.kr/data/15136267/openapi.do → 활용신청(자동승인) | `p05_permits_api.py`(미작성) 시군구별 허가→착공 지연 통계 | P1 확장 |
| 네이버 검색 API | https://developers.naver.com/apps | `p06_news_api.py`(미작성) 지역별 반대 기사 카운트 | P1 확장 |

LLM 키 우선순위: Gemini 무료 티어면 충분하다. 브라우저 "LLM 설정"에 넣으면 그 브라우저의 localStorage에만 저장되고
번들·저장소에는 남지 않는다. Vercel 배포 시에는 `prototype/.env.example` 항목을 환경변수로 넣으면
서버 프록시(`api/generate.ts`)가 키를 숨긴 채 대신 호출한다. 키 없음 + 프록시 없음이면 데모 3지점은
`public/data/precomputed_memos.json`(아직 없음, 생성 예정)으로 폴백한다.

## 폴더 구조

```
data-pack/
  raw/        원본 다운로드 (git 제외, fetch_raw.py로 재현) — SOURCES.md만 커밋
  curated/    수동 큐레이션: cases.csv(갈등 12건) regulations.csv(규제 5건) constants.json(가중치·통계) scenarios.json
  scripts/    fetch_raw → p01_power → p02_schools → p03_population → p04_centroids_enrich → validate_out → build_all
  out/        전처리 산출 JSON (커밋됨)
prototype/    Vite + React + TS. src/scoring/engine.ts 순수 스코어링 엔진 + engine.test.ts 골든 테스트
  api/generate.ts   Vercel Edge 프록시 (Gemini → OpenRouter → Anthropic 순으로 서버 키 선택)
docs/         PLAN.md(전체 계획·일정) DATA.md(데이터 출처·제약·정정사항)
.claude/      launch.json (Claude Code 브라우저 프리뷰용 dev 서버 정의)
```

## 현재 상태와 다음 단계

완료: 데이터 확보·전처리·검증, 앱(지도·스코어카드·슬라이더·사례 레이어·통계 스트립·GenAI 메모 3모드), 골든 테스트, 프로덕션 빌드.

남은 일 (PLAN.md P4~P6, 해커톤 9.21~22):

1. Gemini 무료 키로 실사 메모 실기 확인 → 데모 3지점 프리컴퓨트(`precomputed_memos.json`)
2. Vercel 배포 (`vercel --prod`, 환경변수에 LLM 키) → 심사위원 공유 URL 확보
3. P1 확장(선택): VWorld 용도지역 WMS 오버레이·건축HUB 지연 통계·네이버 뉴스 시그널
4. `docs/DEMO.md` 데모 대본, `ralphathon/` 현장 재빌드 팩(SPEC·TASKS·prompts·fixtures) + 빈 폴더 재빌드 드라이런

## 데이터 출처 요약

공공데이터포털(한전 공급가능 변전소·DC 전기공급 현황·학교 위치·SGIS 격자 인구·상가업소·공공DC 시설),
OpenStreetMap(변전소 좌표, 참고치), 언론보도 큐레이션(갈등·규제 사례). 상세와 제약은 `docs/DATA.md`.
한전 공개 여유용량은 발전접속 기준이라 수전 판단에 직접 쓰지 않았고, 변전소 공식 좌표는 비공개다.
