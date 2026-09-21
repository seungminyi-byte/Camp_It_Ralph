# N11 — OpenRouter 400 응답과 공개 요청 계약 대조

2026-09-22 01:17 KST 기준. 공개 공식 문서·OpenAPI·공식 SDK와 기존 안전 진단을 읽었다. 새 모델 호출·계정 조회·비밀값 열람·제품 수정은 하지 않았다. 총괄이 지정한 Astra/xhigh로 조사하며 실제 세션 설정은 총괄이 별도 기록한다. 전체 후속 작업은 최소 09:00까지, 하드 마감은 10:00이며 이 문서는 개별 조사 인계다.

**결론: 네 개의 `models` 때문에 400이 발생했다고 확정할 공개 근거는 없다. 무료 라우터와 일반 모델의 혼합을 보장하는 명시적 계약도 확인하지 못했다.** 실패한 네 경로 확대를 복구 성공으로 처리할 수 없으며, 세 경로 복원과 원인 미확정 기록을 유지한다. 공개 스키마에 드러난 형식과 실제 서버 수락·모델 생성 성공은 별개다.

## 실제 요청과 관측

PR13 후보 `1c41b2359fd3cb65d2c7c18ee91e5646d3edaf24`의 `generate.ts`는 PR12 `e7a33e7d37f3a9e42937cea043cb153f80cc1e89`와 비교해 기본 모델 배열에 `openrouter/free` 하나만 추가했다. 현재 읽은 파일은 PR12와 바이트가 같다. 실패 후보와 기존 코드의 요청 본문 구성은 다음과 같으며, 아래는 소스 기반 재구성이지 외부 통신 원문 캡처가 아니다.

```text
POST https://openrouter.ai/api/v1/chat/completions
models = [Gemma 31B free, Nemotron 3.5 free, Gemma 26B free, openrouter/free]
stream = true; temperature = 0.3; max_tokens = 4000
reasoning = { enabled: false }
messages = [{ role: user, content: 비어 있지 않은 합성 문장 }]
model, fallbacks, provider, tools, reasoning_effort, response_format 필드 없음
```

정확한 모델 ID와 소스 해시는 [요청 형상](../../../overnight/N11/request-shape.json), [대조 결과](../../../overnight/N11/contract-comparison.json)에 있다. 헤더 값·합성 프롬프트·원시 오류 본문은 이 산출물에 복사하지 않았다.

| 관측 | 확인한 값 | 판단 한계 |
|---|---|---|
| 기존 세 경로 | 00:33 요청에서 상위 HTTP 200 뒤 SSE `504`·`timeout`, 10,909ms, 텍스트 전 실패 | 요청이 스트림 단계에 이르렀다는 근거다. 모델 생성·세 후보 모두 시도·특정 공급자 선택의 증거는 아니다. |
| 네 경로 확대 | 01:07 요청에서 서비스 HTTP 502, 상위 HTTP 400, `upstream_http`, 290ms, 텍스트 없음 | 서비스의 502와 상위 서버의 400을 구분한다. 290ms만으로 OpenRouter 검증기·공급자 중 누가 거절했는지 알 수 없다. |
| 오류 세부 정보 | 비정상 HTTP 본문은 즉시 취소, 진단의 code는 null·type은 unknown | 분류를 수집하지 않았다는 뜻이다. 상위 응답에 상세 사유가 없었다는 뜻이 아니다. 취소한 과거 본문은 이 근거에서 복원할 수 없다. |

두 관측은 [기존 세 경로 진단](../../../overnight/N04/api/safe-runtime-diagnostic-v2.json)과 [네 경로 진단](../../../overnight/N02-B/short-probe/safe-runtime-diagnostic.json)에 근거한다. 배포·경로·도메인·상태·좁은 시간창의 상관은 확인됐지만 플랫폼 ID와 클라이언트 헤더의 정확한 일치는 확인되지 않았다. 요청 시각·공급자 상태가 다르므로 통제된 인과 실험은 아니다.

## 공식 계약 근거표

조회는 01:14:16~01:15:17 KST. 원문 URL·최종 URL·UTC 조회시각·HTTP 상태·바이트·SHA-256은 [출처 목록](../../../overnight/N11/sources.json)에 고정했다.

| 질문 | 공개 공식 근거 | 현지 요청과 대조·한계 |
|---|---|---|
| Chat Completions `models` 최대 개수 | [API reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)와 [OpenAPI JSON](https://openrouter.ai/openapi.json)의 `ChatModelNames`는 문자열 배열이다. 조회본에는 `maxItems`가 없다. | 네 항목이라는 이유만으로 공개 스키마 위반이라고 판정할 수 없다. 미공개 서버 제한의 부재까지 증명하지는 않는다. |
| 공식 SDK의 제한 | [고정 커밋의 SDK 소스](https://github.com/OpenRouterTeam/typescript-sdk/blob/181c6c3588b633e6d969fba8d698faaf723d86f9/src/models/chatrequest.ts#L638)는 `models`를 선택적 문자열 배열로 정의한다. 길이 제한은 없다. | 클라이언트 직렬화 계약의 보조 근거다. 서버 구현의 검증 코드가 아니며 현재 제품은 이 SDK를 사용하지 않는다. |
| `model`과 `models` 조합 | [Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)의 OpenAI SDK 예제는 두 필드를 함께 보내며, `model`을 먼저 시도한 뒤 `models` 순으로 대체한다고 설명한다. `models`만 쓰는 fetch 예제도 있다. | 둘 중 한 형상만 허용한다는 근거는 없다. 실제 실패 요청에는 `model`이 없어 조합 충돌도 관측되지 않았다. |
| 문서의 최대 3개·400 규칙 | 같은 가이드의 Anthropic Messages 항목은 `/api/v1/messages`의 `fallbacks`를 최대 3개로 제한하고 `fallbacks`와 `models`의 동시 사용을 금지한다. OpenAPI `MessagesRequest.fallbacks` 설명도 같다. | 실제 경로는 `/chat/completions`이고 `fallbacks`도 없다. 이 규칙을 Chat Completions의 `models`로 옮겨 적용할 수 없다. |
| 무료 라우터의 명시적 형상 | [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router)의 Usage 네 예제는 모두 단일 `model: openrouter/free`다. 저장본 31·58·85·106행이며 `models` 키 예제는 0개다. | 확인한 가이드에는 `models: [openrouter/free]` 또는 일반 모델과 혼합한 배열 예제가 없다. 혼합 금지의 증거도 아니다. 현재 제품의 명시적 free 설정도 `models` 한 항목을 보내므로 공식 예제와 완전히 같은 형상은 아니다. |
| 무료 라우터 보장 범위 | 같은 무료 라우터 가이드는 필요한 기능을 지원하는 무료 후보를 골라 무작위 선택하며, 가용성과 지연·사용량 제한이 달라질 수 있다고 설명한다. | 공개 목록 존재·무료 가격·기능 필터링은 이 계정과 해당 시점의 성공을 보장하지 않는다. 어떤 모델이 골라졌는지는 이번 관측에서 알 수 없다. |
| 나머지 매개변수 | [요청 개요](https://openrouter.ai/docs/api/reference/overview)는 스트리밍·temperature·max_tokens를 설명한다. [Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)는 `reasoning.enabled` 설정과 모델별 추론 지원 차이를 설명한다. | 값은 이전 세 경로 요청과 같다. 조회한 OpenAPI의 reasoning 명시 속성은 effort·summary이며, 추가 속성을 금지하지 않는다. 이 불완전한 스키마만으로 enabled의 모든 모델 호환성을 보증하거나 400 원인으로 지목할 수 없다. |
| HTTP 400 및 오류 본문 | [Errors and Debugging](https://openrouter.ai/docs/api/reference/errors-and-debugging)는 400을 잘못된 입력 등으로 설명하며 여러 typed error를 구분한다. 스트림 중 오류는 HTTP 200 상태에서도 본문에 들어갈 수 있다. | 현재 안전 진단은 SSE의 typed 오류를 읽지만 비정상 HTTP 본문은 읽지 않는다. 이번 400은 상세 유형이 미관측이다. |

오래된 Chat reference 주소는 위 현재 주소로 리디렉션됐다. 이전 Anthropic `create-messages` 주소의 웹 열람은 실패했으므로 해당 페이지를 확인한 근거로 쓰지 않았다. 최신 문서 색인은 `create-a-message`를 안내하며, 이 조사에서는 fallback 가이드와 실제 OpenAPI `MessagesRequest`를 대조했다. 공개 검색에 섞인 제3자 이슈는 원인 판단에 사용하지 않았다.

## 원인 구분과 후속 권고

현재 소스와 문서로 배제할 수 있는 것은 **Anthropic `fallbacks` 규칙을 위반했다는 주장**과 **`model`·`models` 동시 전송 때문에 거절됐다는 주장**이다. 실제 요청에 해당 필드 조합이 없다. 네 경로 개수 제한, 가상 무료 라우터의 배열 혼합 처리, 선택된 모델·공급자의 매개변수 거절 중 어느 것인지 판단할 직접 근거는 없다. 계정 권한·잔액·한도도 조회하지 않았고 HTTP 400만으로 확정하지 않는다.

**권고는 한 가지다.** 비정상 HTTP의 원인 분류가 다음 의사결정에 꼭 필요하면, 원문을 남기지 않는 제한된 JSON 오류 분류 수집을 합성 HTTP 400 반례로 먼저 검수한다. 기존 전체 제한시간·작은 본문 한도·고정 허용 code/type만 사용하고 `message`·`metadata.raw`·요청값은 수집하지 않는 조건이다. 이것은 향후 필요한 요청의 관측을 위한 후보이며 여기서 구현·배포하지 않았다. 네 경로 재시도나 단일 무료 모델의 추가 실호출은 권고하지 않는다. 복원 배포 검수는 총괄의 별도 작업이다.

총괄은 01:17 복원 배포 PR14/`944ef3457a7c00f71890aad1499d2351ea7db681`·Actions `35624343833`·Vercel Ready와 짧은 요청 11.374초·HTTP 200 본문 `ERROR UPSTREAM_UNAVAILABLE`를 후속 메시지로 알렸다. 이 행은 총괄 보고이며 N11이 실서비스를 직접 조회한 결과가 아니다. 세부 로그 상관 확인은 당시 진행 중이었고 AI 성공으로 해석하지 않는다.

## 검수와 인계

[읽기 전용 대조 스크립트](../../../overnight/N11/inspect_contract.py)의 20개 구조·근거 대조를 모두 통과했다. 이는 전체 JSON Schema 검증기를 실행한 결과가 아니며 공식 SDK 실행·실제 공급자 수락 시험도 아니다. 공개 원문은 내부 근거 보존용으로 저장했고, 새 전달본에는 이 결론과 필요한 출처·검수 요약만 선별하면 된다. 소유 파일은 [manifest](../../../overnight/N11/manifest.json)로 봉인한다. 기존 제품·전달 outputs·설정·계정·원시 세션은 수정하지 않았다.
