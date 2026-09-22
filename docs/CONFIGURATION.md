# 서버 설정과 자료 갱신

실행은 [RUNNING](RUNNING.md), 자료별 기준은 [DATA](DATA.md)를 참조합니다. 키는 서버의 비밀 환경변수로 등록하고 브라우저 코드·공개 저장소·명령 인수·로그에 넣지 않습니다.

## Vercel 배포

서비스는 `prototype` 브랜치에서 배포합니다. Vercel 프로젝트의 Root Directory는 `prototype`, Node.js 버전은 24입니다. `.github/workflows/vercel-prod.yml`이 타입·린트·단위 테스트·자료 검증 후 빌드·배포·Ready 확인을 수행합니다.

워크플로는 `prototype/**` 또는 워크플로 파일 변경과 수동 `workflow_dispatch`로 실행됩니다. GitHub Actions Secret `VERCEL_TOKEN`은 배포 인증용이며 앱에 전달하지 않습니다. 새 Vercel 프로젝트를 연결할 때는 워크플로의 프로젝트 이름·프로젝트 및 팀 식별자를 본인 환경에 맞춥니다. 식별자는 비밀키와 구분합니다.

## 서버 환경변수

| 이름 | 용도 | 설정 위치 |
|---|---|---|
| `VWORLD_API_KEY` | 주소·용도지역·규제·재해·지도 표시 | Vercel 서버 Secret. [VWorld 키 발급](https://www.vworld.kr/dev/v4dv_apikey_s001.do)에서 서비스 주소 등록 |
| `GEMINI_API_KEY` | 선택형 AI 검토 의견 | Vercel 서버 Secret. [Google AI Studio](https://aistudio.google.com/api-keys)에서 발급 |
| `GEMINI_MODEL` | Google 모델 설정 | 선택값. 기본값과 허용값은 `gemini-3.5-flash-lite` |
| `OPENROUTER_API_KEY` | Google 키가 없는 기존 환경의 AI | Vercel 서버 Secret. [OpenRouter](https://openrouter.ai/keys)에서 발급 |
| `LLM_MODEL` | 기존 OpenRouter 경로의 무료 모델 설정 | 서버 설정값. Google 경로에는 적용하지 않음 |

환경변수 변경 후 새 배포를 실행해야 운영 함수에 반영됩니다. 비밀값은 Vercel 환경변수 화면의 Secret 입력을 사용하며 `VITE_` 접두사를 붙이지 않습니다. 기존 키가 설정된 환경에서는 재입력을 요구하지 않습니다.

## Google AI 의견 생성

Google 키가 있으면 `gemini-3.5-flash-lite`와 Google 네이티브 SSE를 사용합니다. 출력 한도 8,192토큰, 최소 추론, 18항목 JSON 스키마와 명시적인 `STOP`을 확인합니다. 정상 구조를 확인한 내용만 보고서 형식으로 전달하고, 앱에서 수치·확정 표현·입력 일치를 추가로 검사합니다.

실패하면 원인을 구분해 안내하며 다른 공급자로 자동 전환하지 않습니다. 기본 조회·계산·비교·보고서는 계속 사용할 수 있습니다. 무료 등급의 호출 한도·제공 상태는 운영 계정에서 관리합니다. 코드가 결제나 유료 모델 전환을 실행하지 않습니다.

Google 키가 없는 기존 환경은 OpenRouter의 무료 모델 경로를 사용합니다. `LLM_MODEL` 미설정·빈 값 또는 기존 `google/gemma-4-31b-it:free` 설정에서는 `nvidia/nemotron-3.5-lightning:free`, `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free` 순서의 대체 목록을 요청합니다. 실제 선택 결과는 공급 상태에 따라 달라집니다. 자세한 계약은 [생성 API](../prototype/api/generate.ts)와 [오류 진단](AI_DIAGNOSTICS.md)을 따릅니다.

사전 생성 의견은 [별도 생성·검수 절차](PRECOMPUTED_MEMOS.md)를 따릅니다. 현재 배포에는 사전 생성 의견 파일이 없으며 기본 사용에 필수인 기능이 아닙니다.

## 자료 갱신

평소에는 커밋된 번들을 사용합니다. 공통 상수 수정은 `data-pack/curated/constants.json`에서 진행하고 다음 명령으로 검증·동기화합니다.

```bash
python3 data-pack/scripts/build_all.py --sync-only
```

SGIS를 새로 수집할 때는 `fetch_raw.py sgis` → `p03_population.py` → `p09_households.py` → `build_all.py --sync-only` 순서입니다. 보호지역은 `fetch_raw.py protected` → `p08_protected_zones.py --probe` → `p08_protected_zones.py` → 동기화 순서입니다. Python 전처리에는 `pyshp`, `pyproj`가 필요합니다.

건축HUB 수집은 `DATA_GO_KR_API_KEY`, NAVER API HUB 수집은 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`을 사용합니다. 수집 전용 키는 비공개 수집 환경 또는 GitHub Actions Secrets에서 관리하며 런타임 앱에 복제하지 않습니다. 전체 `build_all.py`는 외부 수집도 실행하므로 필요한 자료만 선택해 갱신합니다.
