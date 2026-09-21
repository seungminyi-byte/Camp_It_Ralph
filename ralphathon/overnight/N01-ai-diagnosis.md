# N01 — 선택형 AI 운영 실패 진단과 안전한 관측 명세

검토 기준: `3c578a17d43d9b4723f94848d635c3eef1ab1a26` / `codex/ralph-goal-20260921`. 제품은 기존 `bb18284`와 동일하다는 인계를 적용했고, 이번 작업에서도 제품 디렉터리의 HEAD 대비 diff 0을 확인했다. 진단 시작 2026-09-21 23:59 KST, 근거 수집 2026-09-22 00:00~00:06 KST. 사용자 하드마감은 같은 날 10:00이며, 00:06 기준 약 9시간 54분 남았다. 최소 09:00까지 후속 작업을 계속한다는 최신 지시와 `OVERNIGHT.md`를 적용한다. 이 문서는 N01 인계이며 전체 야간 작업 종료 선언이 아니다.

## 1. 결론

**현재 확정할 수 있는 것은 ‘정상 생성 실패’와 실패 분기의 위치다. 공급자 타임아웃, 할당량, 인증·정책, 파서의 오류 필드 해석 중 실제 원인은 아직 확정할 수 없다.** 운영 응답은 HTTP 200이지만 본문은 31바이트의 `UPSTREAM_UNAVAILABLE` 오류 마커뿐이다. 현 코드에서는 upstream의 정상 상태와 SSE 형식을 확인한 다음, SSE 프레임의 오류 필드 또는 오류 종료 사유를 만났을 때 이 형태를 만든다. 로컬 입력·설정 차단이나 HTTP 단계 실패와 구별된다.

기존 네 개 무료 라우팅 식별자는 모두 현재 공식 공개 카탈로그에 있고 가격은 0이다. 고정 모델 세 개의 공개 endpoint는 기존 요청의 `reasoning`, `temperature`, `max_tokens`를 지원한다. **모델 폐지나 파라미터 미지원이라는 가정으로 모델·키·시간제한을 먼저 바꿀 근거는 없다.**

권고하는 첫 수정은 **서버 전용의 제한된 오류 분류 로그 추가**다. 현재 파싱된 오류의 공식 `error_type`을 정확한 허용목록으로 정규화하고, upstream HTTP 상태·숫자 code·오류 위치·형태만 남긴다. 공개 오류, 기본 보고서, 55초 서버/15초 본문 idle/65초 클라이언트, 무료 allowlist, 자동 재시도 횟수는 유지한다. 진단 배포 후 관측한 분류에 따라 후속 복구안을 선택한다.

## 2. 수행 범위와 증거의 경계

- 실행 모델은 총괄이 지정하고 실제 세션과 대조한 Astra/xhigh다. 진단 정확도·회귀 안전성이 우선인 업무이며 Astra를 유지했다. Sol/Terra/Luna/5.5에 대한 실측 성능·비용 비교나 추가 모델 전환은 하지 않았다. 중첩 에이전트 없음.
- 루트/저장소 AGENTS, 런북, 목표 원문, 상태·결정·근거·인계, 기존 04B와 운영 실패 기록을 읽었다. 최신 총괄 지시와 야간 계획이 이전 완료 기록보다 현재 작업 범위를 결정한다.
- 제품·기존 outputs·원문·사진·root 상태파일·환경설정은 변경하지 않았다. 커밋·푸시·PR·배포·키 등록/교체·계정/제공자 정책 변경·새 Goal/예약은 하지 않았다.
- `.env`, 키체인, Vercel 환경값, OpenRouter 계정/API-key 상세는 읽지 않았다. 공개 메타데이터는 인증 없이 GET했고, 운영 합성 생성은 기존 서버를 통해 **1회**만 호출했다. 총괄 후속 지시에 따라 추가 실호출을 중단했다.
- 아래 새 증거는 로컬 `work/overnight/N01/`에 있다. 제품 테스트 전체를 다시 실행한 결과가 아니라, 코드 대조·공개 조회·운영 1회·외부 호출 없는 현재 handler 합성 6사례의 결과다. 기존 563개 회귀/E2E/axe/PDF 검수의 최신 재실행으로 표시하지 않는다.

| 증거 | 내용 |
|---|---|
| [local-source-manifest.json](../../../overnight/N01/local-source-manifest.json) | 읽은 핵심 소스·기존 근거 24파일의 바이트/해시, 제품 diff 0, 이전 운영 결과의 안전한 요약 |
| [public-fetch-manifest.json](../../../overnight/N01/public-fetch-manifest.json) | 공식 카탈로그·endpoint GET URL/확인시각/HTTP/해시. 문서 `.md` GET의 403 실패도 보존 |
| [selected-models.json](../../../overnight/N01/selected-models.json) | 공개 카탈로그 중 허용 식별자 4개의 전체 메타데이터 |
| [live-probe-1.json](../../../overnight/N01/live-probe-1.json) | 운영 합성 1회. 원문 요청·응답 헤더·응답 원문은 새 로그에 저장하지 않음 |
| [baseline-cases.json](../../../overnight/N01/baseline-cases.json), [baseline-characterization.json](../../../overnight/N01/baseline-characterization.json) | 현재 handler의 오류 분기 6개를 기대값 고정 후 대조, 6/6. 외부 호출 0 |
| [fix-regression-contract.json](../../../overnight/N01/fix-regression-contract.json) | N02 구현 전 고정한 진단 스키마·공식 enum·독립 회귀 30그룹. 아직 구현/실행 통과가 아님 |
| [official-docs-web-evidence.json](../../../overnight/N01/official-docs-web-evidence.json), [error-type-reference.json](../../../overnight/N01/error-type-reference.json) | 공식 문서를 web 도구로 확인한 응답과 확인시각. 로컬 `.md`의 403을 문서 확인 성공으로 바꾸지 않음 |

## 3. 코드 경로와 현재 계약

| 경로 | 역할·현재 동작 |
|---|---|
| [api/generate.ts](../../prototype/api/generate.ts) 6~9, 106~150행 | 허용 모델 4개, 입력 제한, 키/모델 형식 확인, 기본 3모델 목록, OpenRouter POST, SSE→안전한 텍스트 |
| 같은 파일 12~103행 | SSE 검증·[DONE]·오류 마커·idle/전체 제한·취소·gate 반환 |
| [api/_http.ts](../../prototype/api/_http.ts) | 제공자 세부 내용 없는 `ApiError`/응답, 전체 Operation 예산과 bounded reader |
| [api/_generation.ts](../../prototype/api/_generation.ts) | 인스턴스별 동일 요청 중복 409, 동시 2개·분당 시작 12개 제한. 계정 전체 무료 할당량은 알지 못함 |
| [genai/llmClient.ts](../../prototype/src/genai/llmClient.ts) | proxy 1회, 65초 단일 예산, 128KiB, ERROR 마커 감지. 실패 후 정확한 문맥의 사전 의견 1회 확인 |
| [genai/prompts.ts](../../prototype/src/genai/prompts.ts) | 근거를 포함한 한국어 18 ITEM 구조, 2,500자 이내 지시, 20,000 UTF-16자/JSON 96KiB 사전 제한 |
| [genai/memoContext.ts](../../prototype/src/genai/memoContext.ts), [memoFormat.ts](../../prototype/src/genai/memoFormat.ts), [memoValidation.ts](../../prototype/src/genai/memoValidation.ts) | 전체 v4 문맥 서명, 구조 파싱, 항목별 수치·주요 주장 대조. 구조 충족만으로 적격하지 않음 |
| [components/MemoPanel.tsx](../../prototype/src/components/MemoPanel.tsx) 73~130행 | 실행/revision/현재 문맥 일치, done/error/stopped, 부록 기본 미선택, 기본 보고서 분리 |
| [scripts/precompute_memos.ts](../../prototype/scripts/precompute_memos.ts) | 오프라인 별도 도구. `OPENROUTER_MODEL` 사용; 운영의 `LLM_MODEL`과 다름. 이번에 실행하지 않음 |
| [generate.test.ts](../../prototype/src/test/api/generate.test.ts), [stream-boundaries.test.ts](../../prototype/src/test/api/stream-boundaries.test.ts), [edge-redirect.test.ts](../../prototype/src/test/api/edge-redirect.test.ts), [llmClient.test.ts](../../prototype/src/genai/llmClient.test.ts) | 무료 경로/종결/누출 방지/입력·출력/15·55·65초/취소/중복/redirect/사전 의견 계약의 기존 회귀 |

운영 기본 모델은 코드상 `google/gemma-4-31b-it:free`이며 이 값이 선택되면 `[Gemma 31B, Nemotron 3.5 Lightning, Gemma 26B A4B]`를 `models`로 한 번 전송한다. `openrouter/free`는 허용되어 있지만 기본 세 모델 목록에 자동 포함되지는 않는다. 다른 허용 식별자를 명시하면 단일 목록이다. 이번 운영의 `OpenRouter` 라우트 표시는 현 코드상 복수 모델 기본 경로와 일치한다. 환경값을 읽지 않았으므로 환경변수 미설정과 명시적 기본값 설정은 구별하지 않는다. 실제 응답 모델·제공자·각 fallback 시도 여부도 이 표시로는 알 수 없다.

오프라인 사전 생성 도구는 현재 upstream 오류 본문 앞부분을 `Error` 메시지에 넣고, 모델 환경값도 출력한다(97~112행). 이는 이번 운영 함수의 원인은 아니지만 **안전한 운영 진단을 대신하는 실행 경로로 사용하면 안 된다.** 제품의 runtime allowlist와 별도인 도구이고 이번 범위에서 실행·수정하지 않았다. 현재 번들에는 `precomputed_memos.json`이 없다.

## 4. 실제 관찰과 정확한 실패 분기

| 관찰 | 2026-09-21 23:21:28 KST 기존 기록 | 2026-09-22 00:01:38 KST N01 |
|---|---:|---:|
| HTTP | 200 | 200 |
| 소요 | 11.257초 | 12.692초 |
| 라우트 표시 | OpenRouter | OpenRouter |
| 응답 크기 | 31바이트 | 31바이트 |
| 결과 | ERROR / UPSTREAM_UNAVAILABLE | 동일 |
| 응답 SHA-256 | `9d69029c35e754b8a5a00740f0eb8c03469d1bea394d7a0717fc7ad7ba509744` | 동일 |
| 완성된 비어 있지 않은 의견 | 없음 | 없음 |

이번 합성 요청은 알려진 금융비용 한 문장과 공급·인허가 미확인 표시를 요구하는 짧은 연결 점검이다. 18항목의 실사용 보고서 생성 검증이 아니다. 기존 마지막 Ready/별칭은 총괄 기록 `dpl_6yqoGQBQuNYh5WriL36cWKmk5Mhk`를 참조하며, N01에서 배포 관리 API를 다시 조회하지 않았다.

**현재 코드와 위 운영 응답의 연결:**

1. 입력 오류는 400/413/415, 키 결측·문자열 부적합·모델 allowlist 위반은 503 `SERVER_UNAVAILABLE`, gate는 409/429다. 현재 200+마커와 다르다.
2. `fetch` 자체 reject 또는 upstream 비정상 HTTP는 공개 502 `UPSTREAM_UNAVAILABLE`이다. upstream 2xx라도 body/MIME가 부적합하면 502 `UPSTREAM_INVALID`다. 현재 증거는 이 응답과 다르다.
3. 200 텍스트 응답을 만든 후, 48행 `data.error !== undefined` 또는 57행 non-null `choice.error`/`finish_reason='error'`가 `UPSTREAM_UNAVAILABLE`를 만든다. 일반 SSE JSON/UTF-8/형식 오류는 `UPSTREAM_INVALID`, 자체 시간제한은 `UPSTREAM_TIMEOUT`, 빈/부분/길이 종료는 별도 코드다.
4. 따라서 ‘현재 실패가 위 세 가지 오류 필드/종료 조건 중 하나에 걸렸다’는 코드상 추론은 강하다. 다만 **오류 필드의 실제 모양을 보관하지 않아 공급자의 진짜 오류 객체였는지까지는 입증하지 못한다.**

현재 handler를 외부 호출 없이 실행한 B01~B06은 이 구분을 재현했다. top-level `timeout` 오류, choice의 rate-limit 오류, `finish_reason=error`가 모두 같은 200 마커가 된다. **top-level `error:null`과 정상 content를 함께 보낸 합성 프레임도 같은 마커가 된다.** 이것은 현재 검사식의 경계이며, 실제 운영에서 null이 왔다는 증거는 없다. 이를 이유로 즉시 오류 검사를 완화하지 않는다.

OpenRouter 공식 설명도 provider의 헤더를 받은 뒤에는 토큰이 없어도 200이 확정되고, 이후의 오류가 SSE에 들어갈 수 있다고 설명한다. 토큰이 나오기 전 재시도들이 실패해도 마지막 오류가 본문에 남을 수 있다. **HTTP 200은 인증·계정·공급자 정책의 모든 문제를 배제하는 증거가 아니다.** [공식 Streaming](https://openrouter.ai/docs/api_reference/streaming), [오류와 typed error](https://openrouter.ai/docs/api_reference/errors-and-debugging).

## 5. 현재 무료 모델·라우팅 확인

확인 시각은 2026-09-22 00:00:43~44 KST. [공식 카탈로그](https://openrouter.ai/api/v1/models)와 각 모델의 endpoint 응답을 인증 없이 직접 받았다. 무료 제공 상태는 변할 수 있으며, 공개 목록·uptime은 이번 계정의 요청 성공이나 특정 호출의 선택 제공자를 보장하지 않는다.

| 허용 식별자 | 공개 endpoint | context / 최대 출력 tokens | 현재 요청 파라미터 | 가격 |
|---|---|---:|---|---|
| `google/gemma-4-31b-it:free` | Google AI Studio 1개, tag `google-ai-studio` | 262,144 / 32,768 | reasoning·temperature·max_tokens 있음 | prompt/completion 0 |
| `nvidia/nemotron-3.5-lightning:free` | Nvidia 1개, tag `nvidia/nvfp4` | 1,000,000 / 65,536 | 세 항목 있음 | 0 |
| `google/gemma-4-26b-a4b-it:free` | Google AI Studio 1개, tag `google-ai-studio` | 262,144 / 32,768 | 세 항목 있음 | 0 |
| `openrouter/free` | router의 endpoint 배열은 빈 목록 | 카탈로그 200,000 / 출력 null | 카탈로그에 세 항목 있음; 선택 모델은 가변 | 0 |

직접 근거: [Gemma 31B endpoints](https://openrouter.ai/api/v1/models/google/gemma-4-31b-it:free/endpoints), [Nemotron endpoints](https://openrouter.ai/api/v1/models/nvidia/nemotron-3.5-lightning:free/endpoints), [Gemma 26B endpoints](https://openrouter.ai/api/v1/models/google/gemma-4-26b-a4b-it:free/endpoints), [Free router endpoints](https://openrouter.ai/api/v1/models/openrouter/free/endpoints). 원본과 전체 지원 파라미터 목록은 로컬 JSON에 있다.

고정 세 모델의 출력 상한은 현재 요청 4,000보다 크다. Gemma 두 모델의 reasoning 메타데이터는 mandatory=false/default_enabled=false이며 Nemotron은 mandatory=false다. 파라미터 **이름**과 공개 한도는 맞지만 특정 제공자의 모든 실제 실행을 보증하는 것은 아니다.

해당 시각 endpoint의 5분 uptime은 Gemma 두 모델 각각 100%, Nemotron 약 88.615%였다. status 원값은 각각 0/-2/0이고, -2의 의미는 확인한 공식 schema 설명만으로 정하지 않았다. Nemotron의 수치가 낮다는 이유로 이번 실패 제공자를 Nvidia로 확정할 수 없다. Gemma 두 무료 모델은 같은 제공자를 공유하므로 모델이 세 개라고 세 개의 독립 제공자라고 세면 안 된다.

`openrouter/free`는 현재 가능한 무료 모델 중 요청 기능을 만족하는 모델을 무작위 선택한다. endpoint 배열이 비었다는 사실만으로 폐지·장애로 판정하지 않는다. 이 경로를 후속 후보로 쓰면 모델 구성·품질 변동을 수용하고 실제 18항목 검수를 다시 해야 한다. [공식 Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router).

OpenRouter의 `models`는 우선순위 목록이고 오류 시 다음 모델을 시도할 수 있다. provider fallback도 기본 활성이다. 현재 코드에서 HTTP 요청 한 번은 OpenRouter 내부 시도 한 번과 동의어가 아니다. `require_parameters` 기본값은 false이며, 현재 고정 세 모델은 필요한 파라미터를 공개 지원하므로 이 옵션을 갑자기 true로 바꾸는 복구 근거도 없다. [Model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks), [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

무료 모델에도 분당·일일 한도가 있다. 공식 블로그 안내는 20회/분, 기본 50회/일, 누적 $10 이상 크레딧 구매 시 1,000회/일을 설명하며 실패 요청도 일일 한도를 소모한다고 한다. 최신 limits 문서는 구매액 보정 및 면제 계정·endpoint 예외를 함께 설명한다. 실제 계정의 한도·잔여량·구매 이력은 이번에 확인하지 않았다. 일일 카운터는 UTC 날짜 기준이므로 KST 자정이 일일 한도 초기화 시각이라는 가정도 하지 않는다. 추가 키로 할당량을 우회하거나 결제를 진행하지 않는다. [공식 무료 한도 안내](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/), [Limits](https://openrouter.ai/docs/api_reference/limits).

## 6. 원인 분류

| 후보 원인 | 현재 판단 | 구분할 관측 |
|---|---|---|
| 키 미등록·문자열 부적합·allowlist 밖 설정 | 현 코드의 로컬 503 분기와 이번 관찰은 불일치 | config 단계/localCode. 값은 기록하지 않음 |
| 운영 플랫폼의 기존 `redirect:error` 비호환 | 현재 코드는 manual이고 upstream SSE 단계에 도달한 형태이므로 이번 증거의 직접 설명과 불일치 | 단계별 로그; VWorld 복구와 AI 실패를 분리 |
| 자체 15/55초 시간초과 | 이번 마커와 11~13초 관찰은 해당 자체 timeout 분기와 불일치 | localCode=UPSTREAM_TIMEOUT 여부 |
| 무료 제공자 timeout·overload·rate limit·unavailable | 가능한 가설. 과거 10초 provider timeout 기록과 이번 지연의 유사성은 원인 확정이 아님 | exact typed error + numeric code + phase |
| 계정/키 권한·크레딧·데이터정책·제공자 설정 | 현재 미확인. 200만으로 모두 배제할 수 없음 | typed authentication/permission_denied/payment_required, 또는 upstream HTTP. 타입은 어느 자격정보의 문제인지까지 확정하지 않음 |
| 모델 폐지·일반 파라미터 미지원 | 공개 카탈로그/지원 목록과 현재 일치하지 않는 가설 | not_found/invalid_request 등의 실제 분류 후 범위 재확인 |
| 장문·출력 토큰 부족 | 짧은 운영 점검에서도 실패했고 현재 마커는 EMPTY/INCOMPLETE가 아니므로 직접 근거 부족 | length/context 관련 분류; 짧은 성공과 실사용 긴 출력은 별도 검수 |
| `error:null` 같은 파서 경계 | 로컬 합성으로 재현된 경계. 운영 원인인지는 미확인 | 고정된 errorShape와 errorLocation |
| 일반 SSE 문법/UTF-8/연결 read 오류 | 대부분 현 코드에서는 INVALID로 바뀌므로 이번 unavailable과 구별됨 | localCode 및 phase |

## 7. N02-A 최소 수정 명세: 관측만 추가

**수정 후보 파일:** `prototype/api/generate.ts`, 작은 순수 정규화 helper(예: `api/_generationDiagnostic.ts`), 그 helper/handler 회귀와 인계 문서. `_http.ts` 전체 정책·클라이언트·엔진·프롬프트·모델목록·timeout을 함께 바꾸지 않는다. 기존 라이브러리를 추가하지 않고 Edge에서 동작하는 plain 객체와 console을 사용한다.

### 기록 스키마

| 필드 | 허용값/규칙 |
|---|---|
| event | 고정 문자열 `ai_generation_failure` |
| requestAtUtc | 서버가 생성한 요청 시작 ISO 시각 |
| elapsedMs | 서버 단조 시계의 비음수 정수. 유한 범위로 제한 |
| phase | `request`, `config`, `gate`, `upstream_fetch`, `upstream_http`, `upstream_sse` 중 하나 |
| localCode | 기존 ErrorCode enum 중 하나. 임의 Error.message를 사용하지 않음 |
| upstreamHttpStatus | 실제 받은 upstream Response.status의 100~599 정수 또는 null |
| upstreamCode | SSE error.code가 JSON number이면서 100~599 정수일 때만 유지, 아니면 null |
| upstreamErrorType | 공식 typed error 27개 중 정확히 일치하는 문자열, 그 밖에는 `unknown` |
| errorLocation | `none`, `top_level`, `choice`, `finish_reason` |
| errorShape | `missing`, `object`, `null`, `other`. 원본 내용이 아니라 형태만 |
| requestedModels | 서버 내부의 현재 무료 allowlist와 대조된 요청 식별자 목록. 부적합 설정은 빈 목록 |
| textEmitted | 이미 의미 있는 텍스트가 나갔는지의 boolean. 실제 텍스트는 없음 |

공식 27개 문자열은 [고정 회귀 계약](../../../overnight/N01/fix-regression-contract.json)의 `officialErrorTypes`에 열거했다. 이 값은 `error.metadata.error_type`를 위한 목록이다. `provider_code`, Error.name, finish_reason, 숫자 HTTP를 이 목록의 값인 것처럼 대신 넣지 않는다. 결측/null/객체/배열/빈값/알 수 없는 문자열 및 공백·개행·접미사가 붙은 값은 모두 unknown이다. trim/prefix match나 임의 문자열 잘라내기는 쓰지 않는다. 이 분류는 원인을 관측하기 위한 자료이며 UI 성공·자동 재시도를 결정하지 않는다. [공식 typed error 정의](https://openrouter.ai/docs/api_reference/errors-and-debugging#typed-error-codes).

### 기록 위치와 제어 흐름

1. 요청 시각과 서버가 선택한 허용 목록을 내부 값으로 만든다. 잘못된 환경 모델값은 필터링 전 로그에 넣지 않는다.
2. `upstream_http` 오류에서는 **이미 받은 숫자 status만** 취한다. 원래 즉시 취소하던 오류 body를 새로 읽거나 timeout을 늘리지 않는다. typed error는 unknown으로 남는다. HTTP 본문 진단이 꼭 필요한 별도 사례가 관측될 때만 새로운 bounded-reader 명세를 검토한다.
3. SSE에서는 이미 JSON으로 파싱한 프레임의 오류 객체를 순수 정규화 함수에 전달한다. 48행 top-level → 57행 choice → finish_reason 순서로 현재 분기 우선순위를 보존한다. error:null도 현재대로 실패시키되 형태를 구별한다. 이번 묶음에서 수락 판정을 완화하지 않는다.
4. 요청당 첫 terminal failure **1회만** 고정 객체를 서버 로그에 남긴다. cleanup/cancel/late promise에서 중복 로그를 만들지 않는다. 정상 완료에서는 failure 로그를 남기지 않는다. logger 자체 오류는 삼키고 공개 응답/reader 정리/gate 반환을 방해하지 않는다.
5. 문자열화는 완성된 허용 필드 객체에만 한다. `console.error(error)`, spread한 raw 객체, 템플릿의 임의 message, 전체 Request/Response/headers/body/model/provider를 금지한다. prompt나 duplicate digest의 해시도 로그에 남기지 않는다.
6. 공개 응답은 현재 `## ERROR` 및 safe local code만 유지한다. 세부 분류용 헤더·공개 진단 endpoint·추가 외부 전송·클라이언트 저장을 만들지 않는다. OpenRouter `debug.echo_upstream_body`나 전체 router metadata opt-in은 켜지 않는다.

HTTP 200와 SSE code 429가 동시에 있으면 각각 다른 필드로 보존한다. `upstreamErrorType=authentication`은 제공된 오류 분류이지 ‘사용자의 OpenRouter 키가 틀렸다’는 최종 판정이 아니다. code만 있고 타입이 없으면 숫자만 남기고, 시간 12초라는 이유로 timeout을 보충하지 않는다.

**검수 전 고정한 회귀:** 30그룹(D01~D30)이다. 공식 27타입 각각의 보존, 악성 형제필드·임의 응답모델·개행 타입의 비노출, 코드 범위/형식, null 오류 형태, HTTP body 미독해, 같은 오류의 중복 로그 방지, logger 실패, 3xx, 취소·늦은 완료, 15/55/65초, gate/무료경로/바이트, 성공 SSE, 기본 보고서·사전 의견·revision을 포함한다. 기존 handler 기준 B01~B06만 이번에 실행했고, 새 진단 회귀 통과는 N02의 실제 구현 후 별도 확인해야 한다.

## 8. 진단 후 조건부 복구안

| 관측 결과 | 작은 다음 행동 | 변경/판정 경계 |
|---|---|---|
| provider timeout/overload/unavailable 또는 provider rate-limit 분류 | 무료 모델 목록·endpoint를 다시 확인하고 **기존 허용 모델만** 우선순위 조정 또는 명시된 무료 router 후보를 한 묶음으로 검토 | 기존 서버 55초와 클라이언트 65초 유지. 현재 이미 내부 fallback이 가능하므로 무한/중첩 재시도 추가 금지. 원인·대안·배포 후 결과 비교 필요 |
| 플랫폼 계정 단위 429 의심 | 관측 시각·현재 분류를 보존하고 제한 해제 후 제한된 수동 검증을 계획 | 공급자 429와 계정 전체 한도를 code만으로 동일시하지 않음. 추가 키/다른 계정/유료 모델로 우회하지 않음 |
| authentication/permission_denied/payment_required | 비밀값 없이 확인된 분류와 필요한 계정 소유자 조치를 기록 | 키 교체·권한 확대·데이터정책 완화·결제는 자동 시행하지 않음. 무료 모델이라도 계정 정책 원인은 코드만으로 복구되지 않을 수 있음 |
| not_found | 당시 정확한 허용 요청 모델과 공식 목록을 대조해 사라진 경로만 최소 정리 | ‘unknown:free’를 포괄 허용하지 않음. 유료·auto 경로 금지 |
| invalid_request/invalid_prompt 또는 토큰 관련 | 해당 파라미터/모델의 공식 계약을 대조하고 실제 반례를 먼저 고정 | 근거 원문 임의 삭제, max_tokens/기한 증가, reasoning 기본 복구를 동시 수행하지 않음 |
| errorShape=null/other, typed unknown | 실제 프레임의 원문을 저장하지 않고 shape/분기만으로 정상 nullable 필드 계약 여부를 공식 schema와 합성반례로 검토 | 확인 전 오류 무시 금지. parser 수정이면 기존 malformed·진짜 error·partial 차단을 별도 검수 |
| 정상 짧은 텍스트 | 연결 검증 성공으로만 기록하고 동일 배포의 실사용 18항목 요청을 별도 검수 | 짧은 성공을 AI 보고서 완성/사실 정확성으로 승격하지 않음 |
| 여전히 unknown, 세부 분류 없음 | 미확정 차단을 유지하고 독립적인 기본 기능/문서 검수로 진행 | 원문/secret 로그를 켜거나 반복 호출로 추정 근거를 만들지 않음 |

`openrouter/free`를 기본 목록에 넣는 안은 기존 허용 식별자라는 점에서 후보가 될 수 있지만, **이번 명세의 즉시 수정안은 아니다.** 무작위 무료 모델로 실제 출력이 달라지고, 계정 전체 한도/권한 문제는 그대로일 수 있다. root의 진단 검수 뒤 별도 결정·짧은 연결과 전체 구조/수치/주장 검수·배포 대조를 거쳐야 한다. 유료 모델 전환을 권고하거나 실행하지 않는다.

사전 의견 파일을 새로 만들어 실패를 숨기는 안은 채택하지 않는다. v4 전체 평가문맥/좌표조건이 맞아야 하고, 사전 의견 사용 사실이 표시되어야 한다. 기본 보고서가 정상인 것은 AI 복구와 별개다.

## 9. 후속 수락 기준과 남은 차단

상태는 세 층으로 구분한다.

1. **실패 복구 UI/기본 보고서 정상:** AI 실패 표시, 입력 보존, 기본 보고서와 15,000㎡·5,000㎡·60억원 유지. AI 성공이 아니다.
2. **운영 연결 성공:** 실제 배포의 선택형 생성이 오류 마커/빈값 없이 종료하고 짧은 합성 기대 내용을 만족. mock·사전 생성 의견·HTTP200만으로 인정하지 않는다.
3. **운영 AI 보고서 사용 가능:** 실제 18 ITEM/OVERALL/ACTIONS/CAVEATS 구조, 정상 transport 완료, 현재 입력/근거 revision, 제공 근거와 주요 수치·주장 대조, 명시적 부록 선택을 모두 확인한다. 자동 대조가 모든 자연어 사실을 보증한다고 쓰지 않는다.

N02-A 수락은 고정 회귀 통과와 서버 안전 로그의 실제 배포 관측이다. 모델/클라이언트/UI를 바꾸지 않은 경우, 무관한 53쪽 PDF나 전체 디자인 검수를 반복할 이유는 없다. 관련 API·클라이언트·MemoPanel 회귀와 타입/린트/빌드, 배포 handler/Ready/별칭/공개 오류·기본 기능의 검증을 수행한다. 후속 라우팅이나 실제 AI 출력이 달라지면 18항목 내용과 선택 부록의 실제 A4를 새로 검수한다.

남은 차단은 **현재 운영이 숨긴 upstream 오류의 분류 부재**다. 등록 이름 확인만으로 해결되지 않으며 과거 키 등록/성공 이력으로 현재 인증·할당량을 확정하지 않는다. N01에서 진단 코드를 배포하지 않았으므로 실제 상세 분류·실제 모델/제공자·시도 횟수·계정 할당량은 미확인이다. 안전 관측 이후 계정 소유자의 조치가 필요한 유형이면 그 부분을 분명히 남긴다.

## 10. 소유권 반환

2026-09-22 00:09 KST 자체 검수에서 로컬 링크 24개, 공식 타입 27개/회귀 30그룹의 중복 없음, 모델 4개/0가격/고정 모델의 요청 파라미터 지원, 공개·로컬 소스 해시, 합성 6사례, 실호출 1회, 제품 diff 0을 확인했다. [self-review.json](../../../overnight/N01/self-review.json)에 결과가 있다. 고신뢰 비밀 패턴 검사 결과는 0건이며 가능한 모든 비밀 형식의 부재를 보증하는 검사는 아니다. 총괄은 초안의 SSE200·27개 타입·null 경계·실제원인 미확정과 진단만 추가하는 범위를 별도 확인했다. root 독립 12사례는 root 소유 파일로 유지하고 N02에 함께 인계한다.

N01 소유는 이 문서와 루트 `work/overnight/N01/`의 새 파일뿐이다. 최종 파일·바이트·SHA-256은 [owned-manifest.json](../../../overnight/N01/owned-manifest.json)에 기록한다(자기 자신은 해시 목록에서 제외). 과거 제품/outputs나 root의 동시 상태 갱신은 소유 파일로 세지 않는다. 문서·JSON의 링크/모델/수치/해시 일관성 및 제품 diff 0을 최종 확인한 뒤 편집을 중지하고 총괄에게 반환한다. **N01 진단 완료가 운영 AI 복구 완료를 뜻하지 않는다.**
