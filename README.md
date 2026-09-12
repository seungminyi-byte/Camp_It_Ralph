# 여기 DC 돼요? — 후보 부지의 1차 사업검토

제안받은 후보 주소와 사업조건을 입력해 주요 제약, 면적 부족, 미확인 비용·공급조건, 다음 확인사항을 정리하는 지도 웹앱입니다. 개발·사업검토 담당자의 초기 검토와 내부 보고를 돕습니다.

기본 보고서는 AI 없이 출력됩니다. 점수는 보조 정보이며 사업 적합·부적합, 실제 공급 용량, 인허가 결과를 확정하지 않습니다.

- 서비스명은 가칭입니다. 배포 설정과 `X-Title`의 내부 코드명은 유지합니다.
- 저장소: https://github.com/seungminyi-byte/Camp_It_Ralph · 기준 브랜치 `prototype`
- 운영 서비스: https://grand-site-dc.vercel.app · 2026-09-08 확인한 배포 코드 `7678816`
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
7. 최대 4개 후보를 담아 비교합니다. 사업·설계·금리 가정은 공통이고 부지 조건·비용·협의 기록은 개별 보관합니다. 후보는 현재 세션 동안 유지됩니다.
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
| **OpenRouter** (`:free` 모델) | https://openrouter.ai/keys · 모델 목록 https://openrouter.ai/models?q=free | Vercel 환경변수 `OPENROUTER_API_KEY` + `LLM_MODEL=google/gemma-4-31b-it:free` → `prototype/api/generate.ts` | 실사 체크리스트의 AI 검토 의견 |
| VWorld (국토부) | https://www.vworld.kr/dev/v4dv_apikey_s001.do (서비스 URL에 https://grand-site-dc.vercel.app 등록) | Vercel 환경변수 `VWORLD_API_KEY` (`vercel env add VWORLD_API_KEY production`·`preview`) → `api/disaster.ts`(재해위험지구 점 조회) · `api/wms.ts`(용도지역·규제구역 WMS 오버레이) · `api/zoning.ts`(용도지역 자동 판정) · `api/restrictions.ts`(개발제한구역 등 규제구역 점 조회) · `api/geocode.ts`(주소 검색) | 용도지역·규제구역·주소 검색 |
| 건축HUB 건축인허가 API | https://www.data.go.kr/data/15136267/openapi.do → 활용신청(자동승인). 인증키는 마이페이지의 일반 인증키 **Decoding** 값 | GitHub Actions Secret `DATA_GO_KR_API_KEY`(Encoding·Decoding 키 모두 허용) → `data-pack/scripts/p05_permits_api.py`(구현됨) 시군구별 허가→착공 지연 통계 → `permit_delay.json` | 허가→착공 통계 |
| 네이버 검색 API (NAVER API HUB) | https://console.ncloud.com/naver-api-hub/application → Application 등록 → [인증 정보]에서 Client ID·Secret 확인. **developers.naver.com이 아니다** — 검색 API는 네이버 클라우드의 API HUB로 이관됐고 호출 주소·헤더가 다르다 | GitHub Actions Secrets `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` → `data-pack/scripts/p06_news_api.py`(구현됨) 지역별 갈등 기사 카운트 → `news_signal.json` | 뉴스 참고 목록 |
| 고속도로 출입시설 위치정보 (후속) | https://www.data.go.kr/data/15076687/openapi.do → 연결된 한국도로공사 서비스에서 활용신청·인증키 확인 | 향후 빌드 시 수집 전용. 신청·키 발급은 사용자 직접 진행, 브라우저 입력·번들 포함 금지 | IC 자료 원본 검증 단계 |

런타임 키는 Vercel에, 데이터 수집 키는 GitHub Actions Secrets에만 둡니다. Codex Cloud 환경에는 API 비밀값을 복제하지 않습니다. 임시 로컬 수집이 꼭 필요할 때만 Git에서 제외된 환경 파일을 만들고 작업 후 제거합니다. 사전 생성 의견은 **v4 서명**과 전체 평가조건·근거가 일치할 때만 사용합니다. 이전 형식은 무효이며 현재 `precomputed_memos.json`은 없습니다. 기본 보고서와 온라인 AI 의견은 사용할 수 있습니다. `prototype/scripts/precompute_memos.ts`는 `OPENROUTER_API_KEY`와 선택값 `OPENROUTER_MODEL`을 환경변수로 받습니다. 서버의 모델 변수 `LLM_MODEL`과 이름이 다르므로 사전 생성 시 같은 모델인지 확인하세요.

## OpenRouter 서버 키 등록·교체

운영 환경 설정은 [Vercel 프로젝트 환경변수](https://vercel.com/camp-it-ralph/grand-site-dc/settings/environment-variables)에서 관리합니다.

1. 새 키가 필요하면 [OpenRouter Keys](https://openrouter.ai/keys)에서 본인 계정으로 발급합니다.
2. Vercel에서 `OPENROUTER_API_KEY`를 추가하거나 편집하고 값을 직접 붙여넣습니다. 환경은 **Production**, 종류는 **Secret**으로 지정해 저장합니다. 키를 대화·코드·브라우저 앱 입력란에 넣지 않습니다.
3. `LLM_MODEL`은 **Config**, Production 환경에 `google/gemma-4-31b-it:free`로 설정합니다. [무료 모델 제공 상태](https://openrouter.ai/google/gemma-4-31b-it:free)를 확인할 수 있습니다. 기본 모델 호출이 제한되면 `nvidia/nemotron-3.5-lightning:free`, `google/gemma-4-26b-a4b-it:free` 순으로 이어서 요청합니다. 모두 무료 모델이며 자동 유료 전환은 없습니다. 무료 제공 상태와 응답 속도는 달라질 수 있습니다.
4. 환경변수 변경 후 새로 배포해야 실행 중인 서버에 반영됩니다. 기존 배포는 Vercel의 Redeploy, 코드 변경은 저장소의 배포 흐름으로 반영합니다.

터미널을 선호하면 프로젝트의 `prototype` 폴더에서 `vercel env update OPENROUTER_API_KEY production --sensitive`를 직접 실행하고 숨겨진 입력창에 붙여넣습니다. 처음 등록하는 환경이면 `update` 대신 `add`를 사용합니다. 키를 명령어 인수에 적지 않습니다.

2026-09-08 점검에서 `OPENROUTER_API_KEY`는 운영 환경에 이미 등록돼 있었습니다. 기존 `minimax/minimax-m3:free` 호출은 무료 제공 종료로 404를 반환해 서버 설정과 기본 모델을 `google/gemma-4-31b-it:free`로 변경했습니다. 키 원문을 조회·복사하지 않았습니다. 보고서 18개 항목의 출력을 위해 추론 모드를 끄고 출력 한도를 4,000토큰으로 설정했습니다. 본문이 비어 있는 응답은 실패로 표시하며 기본 보고서는 계속 사용할 수 있습니다. 기본 모델의 호출 제한은 [OpenRouter 모델 대체 기능](https://openrouter.ai/docs/guides/routing/model-fallbacks)으로 대응합니다. 대체 경로에서는 실제 선택 모델을 단정하지 않고 생성 서비스를 OpenRouter로 표시합니다. 다른 `LLM_MODEL`을 명시하면 해당 모델만 사용합니다.

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

실행 예시 (동작 확인됨):

```bash
# 1) GitHub CLI 로그인
gh auth login --hostname github.com --web

# 2) 저장소 클론 후 브랜치 생성
cd /tmp
gh repo clone seungminyi-byte/Camp_It_Ralph
cd Camp_It_Ralph
git checkout -b feat/my-deploy

# 3) prototype만 수정 후 커밋
git add prototype
git commit -m "..."

# 4-1) PR/병합 배포(권장)
git push -u origin feat/my-deploy
gh pr create --base prototype
# → 병합되면 배포 자동 실행

# 4-2) 직접 배포 브랜치 반영(권한이 있는 경우)
git checkout prototype
git pull origin prototype
git merge --no-ff feat/my-deploy
git push origin prototype
# → 자동 배포 실행

# 4-3) 수동 워크플로 배포(긴급/테스트용)
gh workflow run vercel-prod.yml --ref prototype
```

배포 상태 확인:

```bash
gh run list --workflow vercel-prod.yml --limit 5
gh run view <run-id> --log
```

수동 배포를 선택해도 Secrets와 Workflow 권한이 없는 계정이면 실행이 실패할 수 있습니다.

## Codex Cloud 작업

Codex GitHub 연결 권한은 사용자 요청에 따라 `seungminyi-byte` 계정의 전체 저장소에 부여합니다. 이 프로젝트용 개인 환경 이름은 `camp-itralph`, 환경에 연결할 저장소는 `seungminyi-byte/Camp_It_Ralph`, 기준 브랜치는 `prototype`입니다. 런타임은 Node.js 24·Python 3.12를 사용합니다. 구성·실행 완료 여부는 [검증 기록](docs/DEMO.md)을 확인하세요.

- 설정 스크립트: `npm --prefix prototype ci`와 `python3 -m pip install pyshp 'pyproj<3.7'`
- 유지관리 스크립트: `npm --prefix prototype ci`
- 환경 비밀값: 없음. 런타임 키는 Vercel, 수집 키는 GitHub Actions Secrets에서 관리합니다.
- 에이전트 인터넷 접근: `grand-site-dc.vercel.app`만 허용하며 `GET`, `HEAD`, `OPTIONS`, `POST`만 엽니다.
- GitHub 작업: 수동 `@codex` 작업과 리뷰를 사용하고 자동 리뷰는 켜지 않습니다.

Codex Cloud에서 변경할 때는 `prototype`에서 작업 브랜치를 만들고 PR로 반영합니다. 검사 전용 작업은 위의 다섯 검증 명령을 실행한 뒤 `git diff --exit-code`와 `git status --short`로 변경이 남지 않았는지 확인하고, 저장소 루트의 `AGENTS.md` 적용 여부를 결과에 기록합니다.

## 현재 상태와 다음 단계

2026-09-08: 사용자 요청으로 1차 사업검토 개편을 운영 환경에 배포했습니다. 가구 격자, 사업조건과 면적 계산, 부지별 비용·협의 기록, 민감도 표, 비교·보고서와 AI 의견 유효성 검사를 연결했습니다.

후속 기후 자료는 파일셋 페이지의 응답 지연으로 원본 확보·가공 검증을 완료하지 못했습니다. IC 자료는 서비스 활용신청·인증 상태가 미확인입니다. 검증한 원본만 추가한다는 기준에 따라 두 항목은 현재 화면에 없습니다. 수집 절차와 완료 조건은 PLAN·DATA에 정리했습니다.

해커톤 준비의 v4 사전 생성 의견, 현장 재빌드 팩(`ralphathon/`, 현재 미생성) 및 드라이런은 별도 남은 작업입니다. 데모·모바일·A4 인쇄 절차는 이미 [DEMO](docs/DEMO.md)에 정리했습니다.
