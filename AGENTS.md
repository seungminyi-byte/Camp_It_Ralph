# AGENTS.md — 여기 DC 돼요?

2026-09-22 기준. 데이터센터 후보 부지의 초기 사업검토를 돕는 지도 웹서비스입니다. 사용자 요청, 기존 변경 보존, 근거의 정확성과 실제 검증을 우선합니다.

## 시작과 문서

- `git status --short`와 현재 브랜치를 확인하고 사용자 변경·미추적 파일을 덮어쓰지 않습니다.
- 최종 기준 브랜치는 `prototype`입니다. 작업 브랜치와 PR로 변경을 검토합니다. 푸시·배포·설정 변경은 사용자가 요청한 범위에서 수행합니다.
- [README](README.md)는 제품·실행 진입점, [RUNNING](docs/RUNNING.md)은 재현 절차, [PLAN](docs/PLAN.md)은 산식, [DATA](docs/DATA.md)는 자료 근거, [QA](docs/QA.md)는 검증 기준입니다.
- 한국어로 대화·문서·커밋을 작성합니다. 코드 식별자·주석은 영어, TypeScript strict와 2칸 들여쓰기를 유지합니다.

## 구현 원칙

- 계산·판단은 `prototype/src/scoring/engine.ts`의 `scoreSite()`에 둡니다. 화면·후보 비교·보고서에서 별도 산식을 만들지 않습니다.
- 상수·가중치·가정·출처는 `data-pack/curated/constants.json`이 원본입니다. `python3 data-pack/scripts/build_all.py --sync-only`로 검증·동기화합니다.
- 평소에는 커밋된 번들을 사용합니다. 자료 갱신 요청이 있을 때만 원본을 재수집합니다.
- 공통 `ProjectAssumptions`와 부지별 `SiteConditions`를 구분합니다. 후보는 최대 네 곳이며 조건 변경 시 다시 계산합니다. 비용 차액은 완전하고 같은 방식·범위인 후보 사이에서만 표시합니다.
- 미입력은 `null`, 명시적 비용 0은 0입니다. 실제 면적·설계계수·인입비·차입잔액에 임의 기본값을 넣지 않습니다. 수전용량과 IT부하를 구분하고 금리·기간은 수정 가능한 가정으로 표시합니다.
- 전력 목록·변전소 개수·직선거리에서 공급 MW나 실제 선로 경로를 만들지 않습니다. 뉴스·주변 인구·가구를 주민수용성의 확정 근거로 사용하지 않습니다.
- 확인된 법적 제한은 자료 누락이 있어도 유지합니다. 국가유산의 직접 `review`·주변 `reference`, 해상·자료 범위 밖, 조회 실패·부분·만료 상태를 보존합니다. 상세 정책은 DATA와 [국가유산 기준](docs/HERITAGE_MAPPING.md)을 따릅니다.
- 입력·근거가 바뀌면 실행 중이거나 완료한 AI 의견을 해제합니다. v4 전체 문맥 서명이 일치하는지 확인하며 이전 의견을 새 결과에 붙이지 않습니다.
- 새 상태관리·라우터·차트 라이브러리나 런타임 외부 API를 임의로 추가하지 않습니다. 기존 책임 분리는 [구조 문서](docs/ARCHITECTURE.md)를 따릅니다.

## 서버와 비밀값

- 런타임 키는 Vercel 서버 Secret, 수집 키는 비공개 수집 환경 또는 GitHub Actions Secrets에서 관리합니다. 코드·브라우저 UI·공개 번들·로그·대화·명령 인수·커밋에 키를 넣지 않습니다. 값 대신 등록 여부와 안전한 응답으로 확인합니다.
- 기존 키가 등록되어 있으면 재입력을 요구하지 않습니다. 계정 가입·키 발급·결제·권한 확대를 임의로 수행하지 않습니다.
- VWorld는 Edge·`icn1`을 유지하며 서버 상대 import는 `.js`를 사용합니다. Edge에 Node 파일 API나 불필요한 공급자 SDK를 추가하지 않습니다.
- AI는 `fetch`와 SSE를 사용합니다. `GEMINI_API_KEY`가 있으면 고정 모델 `gemini-3.5-flash-lite`, JSON 스키마, 명시적 `STOP`과 전체 필수 내용을 검사합니다. 잘린 응답·빈 본문·오류를 성공으로 처리하지 않습니다.
- Google 경로 실패 시 다른 공급자·유료 모델로 자동 전환하지 않습니다. Google 키가 없는 기존 환경에만 OpenRouter 경로를 사용합니다. 설정과 제한시간은 [CONFIGURATION](docs/CONFIGURATION.md)과 [AI_DIAGNOSTICS](docs/AI_DIAGNOSTICS.md)를 따릅니다.
- 로컬 Vite `/api/*`는 운영 서버로 전달됩니다. 로컬 API 수정은 Vite에서 실행되지 않으므로 단위 검사와 실제 배포 후 확인을 구분합니다.
- 운영 주소는 https://grand-site-dc.vercel.app 입니다. README만 바꾼 푸시는 배포 Actions를 실행하지 않습니다. 배포 완료는 Actions 성공·Vercel Ready·커밋과 별칭·실제 응답을 함께 확인합니다.

## 표현과 자료

- 목적과 다음 행동이 분명한 한국어를 사용합니다. 출처·기준일·입력 가정·추가 확인사항을 함께 제시해 전문 검토와 관계기관 협의를 돕습니다.
- 참고점수로 사업 적합성, 실제 공급량이나 허가 결과를 확정하지 않습니다. 공개자료·사용자 기록·AI 의견을 구분합니다.
- 회사명·특정 사업장 고유명을 단가·규모 예시로 쓰지 않습니다. 예시는 가상 사업조건으로 표시합니다. 자료 제공기관·출처 URL·서비스명은 유지하고 링크가 있는 자동 기사 제목은 원문을 보존합니다.
- 원본 세션 로그·이미지 데이터·키·개인 연락처·로컬 작업 경로·중복 감사 산출물을 저장소에 추가하지 않습니다. 검증용 합성 fixture와 자료 출처는 보존합니다.

## 검증

Node.js 24와 Python 3.12를 기준으로 저장소 루트에서 실행합니다.

```bash
npm --prefix prototype ci
npm --prefix prototype run typecheck
npm --prefix prototype run lint
npm --prefix prototype test
python3 data-pack/scripts/validate_out.py
python3 -m unittest discover -s data-pack/scripts -p test_p03_population.py
npm --prefix prototype run build
```

엔진 변경은 요구사항에서 독립적으로 도출한 기대값과 회귀로 검증합니다. 현재 출력에 맞춰 기대값을 바꾸지 않습니다. 주요 사례는 [예제 입력](docs/EXAMPLE_INPUT.md), 브라우저·접근성·PDF는 [QA](docs/QA.md)를 따릅니다. 문서만 바꾼 경우에는 링크·명령·수치·현재 코드와 diff를 확인하고 불필요한 외부 수집을 실행하지 않습니다.
