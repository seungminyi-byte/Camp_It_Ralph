# 여기 DC 돼요? — 후보 부지의 1차 사업검토

제안받은 후보 주소와 사업조건을 입력해 주요 제약, 면적 부족, 미확인 비용·공급조건, 다음 확인사항을 정리하는 지도 웹앱입니다. 개발·사업검토 담당자의 초기 검토와 내부 보고를 돕습니다.

기본 보고서는 AI 없이 출력됩니다. 점수는 보조 정보이며 사업 적합·부적합, 실제 공급 용량, 인허가 결과를 확정하지 않습니다.

- 서비스명은 가칭입니다. 배포 설정과 `X-Title`의 내부 코드명은 유지합니다.
- 저장소: https://github.com/seungminyi-byte/Camp_It_Ralph · 기준 브랜치 `prototype`
- 운영 서비스: https://grand-site-dc.vercel.app · [현재 재현·배포 검증](ralphathon/implementation/09-reproduction-deployment.md)
- [최종 전달 자료](ralphathon/deliverables/START_HERE.md): 편집 가능한 5장 발표자료·5분 구성 대본·실제 운영 PDF·실행 안내·검증 결과. 선택형 AI의 운영 생성 실패와 자료의 확인 범위를 함께 표시합니다.
- [새 폴더 실행 안내](docs/RUNNING.md) · [예제 입력](docs/EXAMPLE_INPUT.md) · [구조·재사용 범위](docs/ARCHITECTURE_REUSE.md)
- [구현 사양](docs/PLAN.md) · [데이터 출처·한계](docs/DATA.md) · [데모·검증 절차](docs/DEMO.md)

스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가.

## 빠른 시작

```bash
cd prototype
npm ci
npm run dev -- --port 5199
```

Node.js 24와 npm을 사용합니다(배포 자동화와 동일). `prototype/public/data` 약 11.2MB를 번들로 사용하므로 기본 계산을 위해 원본을 다시 수집할 필요는 없습니다.

Vite 개발 서버의 `/api/*`는 운영 서버로 전달됩니다. 로컬 화면에서도 주소·선택 좌표와 AI 생성 요청은 운영 API에 전송되며, 새 인증키 입력 없이 기존 서버 설정을 사용합니다. `prototype/api` 수정은 Vite에서 실행되지 않으므로 서버 변경 검증과 구분하세요. 주소 검색·용도지역·규제·재해 조회가 실패하면 미확인 상태로 남습니다. 지도 타일과 온라인 조회에는 인터넷 연결이 필요합니다.

## 사용법

1. 주소·읍면동·좌표를 검색하거나 지도에서 후보를 선택합니다. 읍면동 검색은 중심점이므로 실제 필지와 다를 수 있습니다.
2. 규모(엣지·일반·초대형), 사업 유형(일반 클라우드·코로케이션·AI 데이터센터), 목표 수전용량을 각각 입력합니다. 규모·유형 변경은 비용·용량을 덮어쓰지 않습니다.
3. 신축은 계획 연면적·대지면적·적용 용적률·건폐율·지상층수를 입력합니다. ㎡·평을 전환할 수 있습니다. 기존 건물 전환은 확보된 건물 면적을 비교합니다.
4. 필요한 경우 상세 설계조건을 입력해 IT부하와 랙 조건으로 연면적을 계산합니다. 수전용량을 IT부하로 대신 사용하지 않습니다.
5. 비용 항목과 지연 중 평균 차입잔액을 입력합니다. 빈 항목은 미입력이고, 실제로 비용이 없을 때만 0을 입력합니다. 총액 방식은 항목 합계와 별개입니다.
6. 전력·용수·통신 협의 상태, 확인 내용과 날짜를 기록합니다. 사용자 확인은 서비스가 검증한 공급 확약이 아닙니다.
7. 최대 4개 후보를 담아 비교합니다. 사업·설계·금리 가정은 공통이고 부지 조건·비용·협의 기록은 개별 보관합니다. 후보 입력은 이 탭에서 24시간·96KiB 한도로 보관되어 소개 이동·새로고침에 복원됩니다. 온라인 자료와 AI 의견은 저장하지 않습니다. 탭 닫기·브라우저 정책·저장 실패 시 복원을 보장하지 않습니다.
8. ‘부지 검토 보고서’를 열고 PDF 저장을 누릅니다. AI 의견은 선택 사항이며 입력·근거 변경 시 해제됩니다.

금리 4.5·5.5·6.5%, 지연 6·12·24개월은 수정 가능한 **계산 가정**입니다. 실제 면적·설계계수·인입비·차입잔액에는 임의 기본값이 없습니다. 비용 차액은 모든 비교 후보가 완전하고 같은 비용 방식·범위를 가질 때만 표시합니다.

## 결과를 읽는 기준

- 전력 목록과 OSM 위치·직선거리는 참고 자료입니다. 변전소 개수로 공급 MW를 추정하거나 실제 연결 변전소·심사 결과를 예측하지 않습니다. 목록 미등재만으로 D등급 상한을 적용하지 않습니다.
- 참고점수의 필수 자료가 없으면 미산정입니다. 확인된 법적 입지 제한은 점수 산정 여부와 별개로 E등급 상한과 붉은 배지를 유지합니다. 재해위험지구는 15점 감점·추가 검토 대상이며 재해만으로 E등급 상한을 적용하지 않습니다.
- 주변 인구·가구는 반경 1km 안의 격자 중심점 합계입니다. SGIS 2024 가구 자료는 전국 107,680개 셀 중 74,723개 값이 확인되고 32,957개는 결측입니다. 가구 수는 주민등록 세대수와 다르며, 부분 합계·결측을 구분합니다. 가구를 인구와 중복 감점하지 않습니다.
- 인구·가구가 적거나 뉴스가 0건이어도 주민수용성이 좋다는 뜻은 아닙니다. 뉴스·사례는 참고 목록이며 수용성 등급·감점에 사용하지 않습니다. 학교 지점까지 거리는 법정 보호구역 경계거리가 아닙니다.
- 면적 충족은 입력한 단순 조건의 계산 결과입니다. 지연 금융비용은 평균 차입잔액과 사용자가 정한 금리·기간으로 계산하며 점수에서 예상 지연기간을 만들지 않습니다. 산식과 예시는 [구현 사양](docs/PLAN.md#2-입력과-산식)을 참조하세요.

## 데이터 재생성

평소에는 번들 자료를 사용합니다. 원본을 갱신할 때만 전처리를 실행하세요.

```bash
python3 data-pack/scripts/fetch_raw.py sgis
python3 data-pack/scripts/p03_population.py
python3 data-pack/scripts/p09_households.py
python3 data-pack/scripts/build_all.py --sync-only
```

p03·p09·p08에는 `pyshp`, `pyproj`가 필요합니다. Python 3.9에서는 별도 가상환경에 `pyshp`와 `pyproj<3.7`을 설치합니다.
전체 재생성은 `fetch_raw.py` → `build_all.py`이며 기존 뉴스·허가 통계 수집도 포함하므로 선택적으로 실행하세요.
보호구역만 갱신할 때는 `fetch_raw.py protected` → `p08_protected_zones.py --probe` → `p08_protected_zones.py` → `build_all.py --sync-only`입니다.

## 검증

저장소 루트에서:

```bash
npm --prefix prototype run typecheck
npm --prefix prototype run lint
(cd prototype && node node_modules/vitest/vitest.mjs run)
python3 data-pack/scripts/validate_out.py
npm --prefix prototype run build
```

[데모 절차](docs/DEMO.md)에 면적·금융비용·비교·조회 실패·모바일·인쇄 확인 항목을 정리했습니다. 이전 데모 점수 D45/E32/B75 및 점수 기반 예상 지연은 현재 기준이 아닙니다.

## 직접 발급이 필요한 키

새 환경을 구성하거나 수집 자료를 갱신할 때 필요한 키입니다. 계정 가입·키 발급과 비밀값 입력은 사용자가 직접 진행합니다. 운영 키 등록 여부와 수집용 로컬 키 보유 여부는 별개입니다. 키 발급·무료 모델에도 서비스별 호출 한도와 제공 조건이 적용됩니다.

| 키 | 발급 URL | 사용처 | 필요 시점 |
|---|---|---|---|
| **Google AI Studio** (무료 등급) | https://aistudio.google.com/api-keys | Vercel 서버 Secret `GEMINI_API_KEY` → `prototype/api/generate.ts`, 고정 모델 `gemini-3.5-flash-lite` | 선택형 AI 검토 의견 |
| **OpenRouter** (무료 모델) | https://openrouter.ai/keys · 모델 목록 https://openrouter.ai/models?q=free | Vercel 환경변수 `OPENROUTER_API_KEY` + `LLM_MODEL=google/gemma-4-31b-it:free` → `prototype/api/generate.ts` | 실사 체크리스트의 AI 검토 의견 |
| VWorld (국토부) | https://www.vworld.kr/dev/v4dv_apikey_s001.do (서비스 URL에 https://grand-site-dc.vercel.app 등록) | Vercel 환경변수 `VWORLD_API_KEY` (`vercel env add VWORLD_API_KEY production`·`preview`) → `api/disaster.ts`(재해위험지구 점 조회) · `api/wms.ts`(용도지역·규제구역 WMS 오버레이) · `api/zoning.ts`(용도지역 자동 판정) · `api/restrictions.ts`(개발제한구역 등 규제구역 점 조회) · `api/geocode.ts`(주소 검색) | 용도지역·규제구역·주소 검색 |
| 건축HUB 건축인허가 API | https://www.data.go.kr/data/15136267/openapi.do → 활용신청(자동승인). 인증키는 마이페이지의 일반 인증키 **Decoding** 값 | GitHub Actions Secret `DATA_GO_KR_API_KEY`(Encoding·Decoding 키 모두 허용) → `data-pack/scripts/p05_permits_api.py`(구현됨) 시군구별 허가→착공 지연 통계 → `permit_delay.json` | 허가→착공 통계 |
| 네이버 검색 API (NAVER API HUB) | https://console.ncloud.com/naver-api-hub/application → Application 등록 → [인증 정보]에서 Client ID·Secret 확인. **developers.naver.com이 아니다** — 검색 API는 네이버 클라우드의 API HUB로 이관됐고 호출 주소·헤더가 다르다 | GitHub Actions Secrets `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` → `data-pack/scripts/p06_news_api.py`(구현됨) 지역별 갈등 기사 카운트 → `news_signal.json` | 뉴스 참고 목록 |
| 고속도로 출입시설 위치정보 (후속) | https://www.data.go.kr/data/15076687/openapi.do → 연결된 한국도로공사 서비스에서 활용신청·인증키 확인 | 향후 빌드 시 수집 전용. 신청·키 발급은 사용자 직접 진행, 브라우저 입력·번들 포함 금지 | IC 자료 원본 검증 단계 |

런타임 키는 Vercel에, 데이터 수집 키는 GitHub Actions Secrets에만 둡니다. Codex Cloud 환경에는 API 비밀값을 복제하지 않습니다. 임시 로컬 수집이 꼭 필요할 때만 Git에서 제외된 환경 파일을 만들고 작업 후 제거합니다. 사전 생성 의견은 **v4 서명**과 전체 평가조건·근거가 일치할 때만 사용합니다. 이전 형식은 무효이며 현재 `precomputed_memos.json`은 없습니다. 기본 보고서는 AI 없이 사용할 수 있습니다. 선택형 AI는 제공 상태에 따라 실패할 수 있으며 [서버 오류 진단과 운영 확인](docs/AI_DIAGNOSTICS.md)을 별도로 수행합니다.

`prototype/scripts/precompute_memos.ts`는 `OPENROUTER_API_KEY`와 선택값 `OPENROUTER_MODEL`을 사용하며 서버 변수 `LLM_MODEL`을 읽지 않습니다. 필수 `--output`으로 **새 검수 후보 파일 하나**만 생성하고 두 배포 파일은 갱신하지 않습니다. [사전 생성 안내](docs/PRECOMPUTED_MEMOS.md)의 단일 무료 모델·실행 제한·내용 및 전체 평가 서명 검수·별도 게시 절차를 따릅니다.

## Google AI Studio 서버 연결

`GEMINI_API_KEY`를 Vercel **Production / Secret**으로 등록한 뒤 새 배포를 실행합니다. 키를 대화·코드·명령 인수·프런트엔드 환경변수에 넣지 않습니다. Google의 표준 키와 새 인증 키는 같은 `x-goog-api-key` 서버 헤더로 전달합니다. 값의 특정 접두사를 가정하지 않습니다.

Google 키가 설정되어 있으면 Google의 `streamGenerateContent` API와 고정 안정 모델 `gemini-3.5-flash-lite`만 호출합니다. `GEMINI_MODEL`을 생략해도 동일하며, 승인되지 않은 모델 설정은 요청 전에 차단합니다. [모델 사양](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)과 [무료 등급·가격](https://ai.google.dev/gemini-api/docs/pricing)을 확인할 수 있습니다. 프로젝트는 무료 등급을 유지하며 코드가 결제나 유료 모델 전환을 실행하지 않습니다. 프로젝트의 요금제 변경은 별도 관리 대상입니다.

출력 한도는 8,192토큰이고 추론 수준은 최소로 지정합니다. 종합 의견·18개 항목·후속 조치·유의사항을 JSON 스키마로 고정하고, 명시적인 `STOP` 뒤 필수 내용을 검사해 기존 보고서 형식으로 전달합니다. 생성 중인 JSON과 추론 내용은 화면에 표시하지 않습니다. 계산 수치는 기본 보고서에 유지하고 AI는 근거의 의미와 다음 행동을 보완합니다. 출력 한도 초과·안전 차단·잘린 응답·시간초과는 실패로 표시합니다. 앱은 별도로 수치·확정 표현을 점검합니다. 이 검사는 원자료의 정확성이나 AI 내용 전체를 보증하지 않습니다.

Google 키가 설정된 상태에서 실패하면 다른 공급자로 자동 전환하지 않습니다. 기본 조회·계산·비교·보고서는 AI 없이 계속 사용할 수 있습니다. Google 키가 없는 기존 환경에 한해 아래 OpenRouter 설정을 사용합니다. 배포 후에는 짧은 연결 확인 외에 실제 보고서 전체 생성과 화면·보고서 반영을 확인합니다.

## 기존 OpenRouter 서버 키 등록·교체

운영 환경 설정은 [Vercel 프로젝트 환경변수](https://vercel.com/camp-it-ralph/grand-site-dc/settings/environment-variables)에서 관리합니다.

1. 새 키가 필요하면 [OpenRouter Keys](https://openrouter.ai/keys)에서 본인 계정으로 발급합니다.
2. Vercel에서 `OPENROUTER_API_KEY`를 추가하거나 편집하고 값을 직접 붙여넣습니다. 환경은 **Production**, 종류는 **Secret**으로 지정해 저장합니다. 키를 대화·코드·브라우저 앱 입력란에 넣지 않습니다.
3. `LLM_MODEL`은 **Config**, Production 환경에 `google/gemma-4-31b-it:free`로 설정합니다. [무료 모델 제공 상태](https://openrouter.ai/google/gemma-4-31b-it:free)를 확인할 수 있습니다. 이 기존 설정값과 미설정/빈 설정은 호환을 위해 유지하며, 실제 기본 요청 목록은 `nvidia/nemotron-3.5-lightning:free` → `google/gemma-4-31b-it:free` → `google/gemma-4-26b-a4b-it:free` 순서입니다. 세 모델을 한 요청의 대체 목록으로 전달합니다. 자동 유료 전환은 없으며, 무료 모델의 가용성·선택 결과·속도는 달라질 수 있습니다. 목록 전달만으로 각 대안의 실제 시도나 응답 성공을 보장하지 않습니다. `openrouter/free`는 명시적인 단일 모델 설정으로만 허용하며 기본 대체 목록에는 포함하지 않습니다.
4. 환경변수 변경 후 새로 배포해야 실행 중인 서버에 반영됩니다. 기존 배포는 Vercel의 Redeploy, 코드 변경은 저장소의 배포 흐름으로 반영합니다.

터미널을 선호하면 프로젝트의 `prototype` 폴더에서 `vercel env update OPENROUTER_API_KEY production --sensitive`를 직접 실행하고 숨겨진 입력창에 붙여넣습니다. 처음 등록하는 환경이면 `update` 대신 `add`를 사용합니다. 키를 명령어 인수에 적지 않습니다.

2026-09-08 점검에서 `OPENROUTER_API_KEY`는 운영 환경에 이미 등록돼 있었습니다. 기존 `minimax/minimax-m3:free` 호출은 무료 제공 종료로 404를 반환해 서버 설정과 기본 모델을 `google/gemma-4-31b-it:free`로 변경했습니다. 키 원문을 조회·복사하지 않았습니다. 보고서 18개 항목의 출력을 위해 추론 모드를 끄고 출력 한도를 4,000토큰으로 설정했습니다. 본문이 비어 있는 응답은 실패로 표시하며 기본 보고서는 계속 사용할 수 있습니다. 기본 모델의 호출 제한은 [OpenRouter 모델 대체 기능](https://openrouter.ai/docs/guides/routing/model-fallbacks)으로 대응합니다. 대체 경로에서는 실제 선택 모델을 단정하지 않고 생성 서비스를 OpenRouter로 표시합니다. 다른 `LLM_MODEL`을 명시하면 해당 모델만 사용합니다.

2026-09-22 코드의 생성 제한은 요청 접수부터 상위 응답 헤더까지 20초, 정상 본문을 포함한 전체 180초, 개별 본문 수신 대기 15초입니다. 헤더 확인 후 최초 개행 1바이트를 즉시 보내 응답을 시작하며 이 개행은 생성된 의견이나 빈 응답 성공으로 세지 않습니다. 인스턴스 중복 예약도 180초이고 클라이언트의 헤더·본문·선택적 사전 의견 탐색은 하나의 195초 한도를 공유합니다. 긴 정상 응답을 허용하는 변경이며 제공자가 일찍 반환한 실패를 재시도하거나 무시하지 않습니다.

최종 관측한 HTTP/SSE 401(또는 명시적 인증 오류), 429(요청 제한), 504(제공자 시간초과)는 서로 다른 안전 코드와 한국어 안내로 표시합니다. 공급자 원문이나 키는 반환하지 않으며 미관측 라우팅은 추정하지 않습니다. 초기 설정 오류와 로컬 제한시간 초과는 별도입니다. Nemotron 우선순위와 긴 응답 허용은 무료 제공자 장애의 복구를 보장하지 않습니다. 실제 복구는 배포 후 응답과 18항목 의견을 별도로 확인해야 합니다.


## 구현 구조

아래 `src/` 경로의 기준은 `prototype/`입니다.

- `src/scoring/engine.ts`: 기존 공간·규제 판단과 면적·사업비·금융비용·추가 확인사항의 단일 계산 경로
- `data-pack/curated/constants.json`: 가중치·임계값·단위 변환·금리와 기간 가정·자료 설명. `build_all.py`가 앱에 복사
- `src/lib/reviewInputs.ts`: 빈 입력 상태·공통 사업조건·표시 단위 변환
- `src/components/BusinessInputs.tsx`, `ReviewFacts.tsx`: 공통/부지별 입력과 계산 결과 표시
- `src/compare/pins.ts`: 최대 4곳 보관, 엔진 결과 재계산 및 같은 비용 범위의 차액
- `src/report/checklist.ts`, `src/components/ChecklistReport.tsx`: 18개 근거 항목과 첫 장 요약·상세 보고서
- `src/genai/memoContext.ts`: 입력·근거 전체의 안정적인 서명. `MemoPanel`은 오래된 AI 의견을 표시하지 않음
- `data-pack/scripts/p09_households.py`: SGIS 총가구수 추출, 좌표 변환, 결측·중복·출처 추적

지도·패널 폭 조절·주소 검색·용도지역 수동 보완·보호구역/재해 조회는 유지했습니다. 새로운 런타임 API와 상태관리·라우터·차트 라이브러리는 추가하지 않았습니다.

## 배포와 운영 확인

배포 자동화는 [.github/workflows/vercel-prod.yml](.github/workflows/vercel-prod.yml)입니다. 기본 브랜치 `prototype`의 `prototype/**` 또는 해당 워크플로 파일 변경을 푸시하면 GitHub Actions가 검사 후 Vercel 운영 배포를 실행합니다. 수동 실행(`workflow_dispatch`)도 지원합니다. README·AGENTS 등 문서만 수정한 푸시는 이 Actions를 실행하지 않습니다. 별도로 연결된 Vercel Git 배포·PR 미리보기는 자체 실행 조건을 따릅니다.

배포에는 GitHub Actions Secret `VERCEL_TOKEN`이 필요합니다. Vercel Git 연동의 Root Directory는 `prototype`입니다. 워크플로는 Node.js 24와 Vercel CLI 59.16.0을 사용해 타입 검사·린트·전체 Vitest·데이터 검증을 먼저 통과시키고, 기존 `grand-site-dc` 프로젝트를 명시적으로 연결한 뒤 production 설정을 받아 prebuilt 결과를 배포합니다. 마지막에는 `vercel inspect --wait --timeout 10m`으로 Ready 상태를 확인합니다. 서버 API 키는 별도로 Vercel 환경변수에 두고 VWorld API의 서울 리전 `icn1`을 유지합니다. 푸시·배포는 사용자가 요청한 범위에서 진행합니다.

2026-09-08 운영 확인 기록은 [DEMO](docs/DEMO.md#2026-09-08-운영-배포-검증)에 있습니다. 배포 코드 `7678816`의 Ready 상태, 운영 정적 파일과 가구 JSON 일치, 용도지역·규제·재해 API 응답, AI 보고서 18개 항목·조치 5개·주의사항 2개의 생성 완료를 확인했습니다. 해당 변경의 타입 검사·린트·17개 파일 134개 테스트·데이터 검증·프로덕션 빌드도 통과했습니다. 이는 날짜가 있는 검증 기록이며 이후 변경의 검증을 대신하지 않습니다.

## 다른 사용자 배포 가이드

팀원도 배포할 수 있도록 하려면 아래 조건을 맞추면 됩니다.

- 저장소에 등록된 협업자(Write 이상) 또는 팀 멤버여야 합니다.
- `prototype/**` 변경이 기본 브랜치 `prototype`으로 반영되어야 합니다.
- `VERCEL_TOKEN`은 `seungminyi-byte/Camp_It_Ralph` 저장소의 Actions Secret으로 등록되어 있어야 합니다.

Codex Cloud의 `camp-itralph` 환경에서 `prototype`을 선택해 작업하고 변경 diff와 검증 결과를 검토한 뒤 PR을 만듭니다. 환경 구성·검사가 완료되었는지는 아래 검증 기록을 먼저 확인하세요. 팀원이 별도 개발 환경에서 GitHub CLI를 사용하는 경우에도 같은 PR 절차를 따릅니다.

```bash
# 저장소 루트에서 최신 기준 브랜치의 작업 브랜치 생성
git fetch origin prototype
git switch -c codex/my-change origin/prototype

# 요청한 변경과 검증을 마친 뒤 해당 파일만 커밋
git add prototype
git commit -m "요청한 변경 내용"

# PR 작성 → 검토 → prototype에 squash 병합
git push -u origin codex/my-change
gh pr create --base prototype
# → prototype/** 또는 워크플로 변경 병합이면 Actions 배포 실행

# 수동 워크플로 배포가 필요한 경우
gh workflow run vercel-prod.yml --ref prototype
```

배포 상태 확인:

```bash
gh run list --workflow vercel-prod.yml --limit 5
gh run view <run-id> --log
```

수동 배포를 선택해도 Secrets와 Workflow 권한이 없는 계정이면 실행이 실패할 수 있습니다.

## Codex Cloud — 2026-09-12 환경 이력 작업

Codex GitHub 연결 권한은 사용자 요청에 따라 `seungminyi-byte` 계정의 전체 저장소에 부여합니다. 이 프로젝트용 개인 환경 이름은 `camp-itralph`, 환경에 연결할 저장소는 `seungminyi-byte/Camp_It_Ralph`, 기준 브랜치는 `prototype`입니다. 런타임은 Node.js 24·Python 3.12를 사용합니다. 구성·실행 완료 여부는 [검증 기록](docs/DEMO.md)을 확인하세요.

- 기본 이미지의 Node 선택 메뉴에는 24가 없어 설정 스크립트에서 NVM으로 24를 활성화합니다. Python 선택값은 3.12입니다. 실제 런타임 버전은 Cloud 검사 결과로 확인합니다.
- 환경 비밀값: 없음. 런타임 키는 Vercel, 수집 키는 GitHub Actions Secrets에서 관리합니다.
- 에이전트 인터넷 접근: 사용자 최종 승인에 따라 `grand-site-dc.vercel.app`의 `GET`·`HEAD`·`OPTIONS`만 허용합니다. 현재 UI에서 `POST`만 추가할 수 없어 계획의 4종 대신 읽기 전용 3종으로 확정했습니다. Cloud 에이전트의 운영 AI 생성 `POST` 호출은 허용되지 않으며, 별도 승인 없이 모든 메서드로 넓히지 않습니다.
- GitHub 작업: 수동 `@codex` 작업과 리뷰를 사용하고 자동 리뷰는 켜지 않습니다.

Codex Cloud에서는 작업 생성 화면에서 `camp-itralph`와 기준 브랜치 `prototype`을 선택하고, 변경은 Cloud의 PR 기능으로 반영합니다. 검사 컨테이너에서는 브랜치가 `work`이고 Git remote가 없었습니다. 이 경우 터미널에서 임의로 원격·인증키를 추가하지 말고 선택한 환경·브랜치와 HEAD가 원격 기준 커밋에 일치하는지 대조합니다. 검사 전용 작업은 위의 다섯 검증 명령을 실행한 뒤 `git diff --exit-code`와 `git status --short`로 변경이 남지 않았는지 확인하고, 저장소 루트의 `AGENTS.md` 적용 여부를 결과에 기록합니다.

설정 스크립트:

```bash
set +x
set -e
source "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
nvm use 24
node --version
python3 --version
npm --prefix prototype ci
python3 -m pip install pyshp 'pyproj<3.7'
```

유지관리 스크립트:

```bash
set +x
set -e
source "$NVM_DIR/nvm.sh"
nvm use 24
npm --prefix prototype ci
```

## 현재 상태와 다음 단계

2026-09-12: 로컬 문서 원본 3개를 `codex/local-preservation-20260912`에 보존하고 기본 브랜치 `prototype`의 배포 자동화를 검증했습니다. GitHub Actions, Vercel Ready, 운영 화면·핵심 API·AI 연결 검사와 `camp-itralph` Cloud의 전체 166개 테스트·무변경 검사가 통과했습니다. 사용자는 읽기 전용 인터넷 설정과 지정된 로컬 5개 폴더의 휴지통 이동을 최종 승인했습니다. 당시 후속 작업은 Cloud 환경의 `prototype`에서 시작하도록 안내했으며 [최신 검증 기록](docs/DEMO.md#2026-09-12-배포-자동화와-운영-검증)을 따릅니다.

2026-09-08: 사용자 요청으로 1차 사업검토 개편을 운영 환경에 배포했습니다. 가구 격자, 사업조건과 면적 계산, 부지별 비용·협의 기록, 민감도 표, 비교·보고서와 AI 의견 유효성 검사를 연결했습니다.

후속 기후 자료는 파일셋 페이지의 응답 지연으로 원본 확보·가공 검증을 완료하지 못했습니다. IC 자료는 서비스 활용신청·인증 상태가 미확인입니다. 검증한 원본만 추가한다는 기준에 따라 두 항목은 현재 화면에 없습니다. 수집 절차와 완료 조건은 PLAN·DATA에 정리했습니다.

2026-09-21: 네 경로·검토/비교·A4·오류 복구·소개/팀 및 통합 검수 기록을 `ralphathon/`에 추가했습니다. 최신 실행은 [RUNNING](docs/RUNNING.md), [예제 입력](docs/EXAMPLE_INPUT.md), [08 QA](ralphathon/implementation/08-integration-quality.md), [09 재현·운영 검증](ralphathon/implementation/09-reproduction-deployment.md)을 따릅니다. 사전 생성 AI는 필수 조건이 아니며 데모·영상·포스터 제작은 이번 범위 밖입니다. 아래와 기존 DEMO의 날짜별 배포·Cloud 기록은 이력으로 보존합니다.
