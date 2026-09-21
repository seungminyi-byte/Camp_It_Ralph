# N02 — 선택형 AI 안전 진단 구현 인계

인계 기준 시각: 2026-09-22T00:19:09.580996+09:00. 같은 날 하드마감 10:00 KST까지 9.68시간 남았다. 최신 사용자 요청의 최소 09:00까지 후속 작업과 기존 하드마감은 총괄이 이어간다. 이 문서는 N02 산출물 인계이며 야간 작업 전체 종료 선언이 아니다.

**서버 오류 진단만 구현했고, 운영 AI 복구는 아직 확인하지 않았다.** 현재 작업 브랜치는 `codex/ralph-goal-20260921`, 수정 기준 HEAD는 `3c578a17d43d9b4723f94848d635c3eef1ab1a26`다. 커밋·푸시·PR·배포·실제 AI 요청은 수행하지 않았다.

## 변경과 판단

[generate.ts](../../prototype/api/generate.ts)는 기존 입력·설정·gate·upstream HTTP·SSE 오류 경로에 요청별 진단을 연결한다. [_generationDiagnostic.ts](../../prototype/api/_generationDiagnostic.ts)는 원본 오류 객체를 보관하지 않고 숫자 code, 정확한 공식 error_type, 고정 오류 위치·형태로 정규화한다. 공개 본문·헤더에는 진단을 추가하지 않는다.

기록은 `event`, `requestAtUtc`, `elapsedMs`, `phase`, `localCode`, `upstreamHttpStatus`, `upstreamCode`, `upstreamErrorType`, `errorLocation`, `errorShape`, `requestedModels`, `textEmitted` 12필드뿐이다. 객체를 완성한 뒤 단일 JSON 문자열로 `console.error`에 전달한다. 정상 종료는 0회, 실패·취소 경합은 요청당 최초 terminal failure 1회다. 기록이나 JSON 직렬화가 실패하면 삼키고 응답·abort·reader 취소·gate 반환·타이머 정리를 유지한다. 로그가 실패했을 때 재시도해 중복하거나 원본 오류를 별도로 출력하지 않는다.

- `requestAtUtc`는 서버 ISO 시각, `elapsedMs`는 `performance.now()` 차이의 비음수 정수이며 최대 86,400,000ms다. 비유한 값은 0이다. 이 상한은 기록 숫자의 방어 범위이고 실행 시간제한이 아니다.
- 공식 타입 27개는 [N01 사전 고정 계약](../../../overnight/N01/fix-regression-contract.json)과 정확히 일치한다. 숫자 code는 JSON number 정수 100~599만 유지한다. 타입의 공백·개행·접미사·배열·객체·결측은 `unknown`이고 숫자 code에서 타입을 추론하지 않는다. [공식 typed error 문서](https://openrouter.ai/docs/api_reference/errors-and-debugging#typed-error-codes)는 N01이 확인한 근거를 계승했다.
- HTTP 오류는 이미 받은 status만 기록하고 body를 새로 읽지 않는다. MIME·Location·본문·응답 모델·제공자·헤더·원본 메시지·stack·환경값·중복 digest를 로그에 넣지 않는다.
- 모델 목록은 실제 내부 선택 목록을 기존 `FREE_MODELS`와 다시 대조한 결과다. 부적합 설정은 빈 목록이다. 기본 3모델/명시 1모델, 유료 차단, 요청 파라미터와 재시도 횟수는 그대로다.
- top-level → choice → finish_reason 우선순위와 `error:null` 실패를 유지한다. choice.error=null 자체는 기존처럼 정상 처리되며 finish_reason=error를 동반하면 실패한다. 이 관측 코드가 nullable 오류를 새로 수락하지 않는다.
- `redirect: manual`, 서버 55초, 본문 idle 15초, 클라이언트 65초, 입력 20,000자·96KiB/출력 128KiB/SSE 1MiB, 동시 2개·분당 12시작·동일 요청 409는 유지했다. `_http.ts`, `_generation.ts`, 클라이언트·프롬프트·MemoPanel·엔진·의존성·저장소 AGENTS는 HEAD 바이트와 동일하다.

총괄 지정 Astra/xhigh로 실행했다. 모델 설명상 정확성·복잡한 분석/코딩·회귀 안전성을 우선한 선택이며 다른 모델의 실측 속도·가격·정확도 벤치마크는 하지 않았다. 이번 실행에서 모델 전환·중첩 에이전트·새 Goal·예약·전역 설정 변경은 없었다. 루트/저장소 지침, 런북, 원문, 상태·인계·근거와 G023/N01을 확인했다. 기존 출력·사진·원본 저장소·총괄 상태 파일은 수정하지 않았다.

## 실제 실행과 검증

검증은 Node.js 24.20.0의 실제 바이너리와 설치된 의존성으로 실행했다. 새 설치는 없다. 전체 명령·cwd·종료 코드·로그의 대응은 [commands.json](../../../overnight/N02/commands.json)에 있다.

| 실행 | 결과 | 근거 |
|---|---|---|
| 구현 전 1차 반례 | 85건 중 정상 스트림 1 통과, 84건 로그 부재로 실패 | [baseline-red.json](../../../overnight/N02/baseline-red.json) |
| 구현 전 수명·취소 반례 확장 | 98건 중 정상 스트림 1 통과, 97건 로그 부재로 실패 | [baseline-red-lifecycle.json](../../../overnight/N02/baseline-red-lifecycle.json) |
| 최소 구현 후 동일 진단 검사 | 98/98 통과 | [diagnostic-green.json](../../../overnight/N02/diagnostic-green.json) |
| 방어 경계 추가와 관련 회귀 최종 실행 | 11파일 285/285 통과, 그중 신규 진단 113/113 | [related-regression.json](../../../overnight/N02/related-regression.json) |
| 타입 검사 | 최종 종료 0 | [typecheck.log](../../../overnight/N02/typecheck.log) |
| 린트 | 종료 0 | [lint.log](../../../overnight/N02/lint.log) |
| 프로덕션 빌드 | 종료 0, 128모듈 | [build.log](../../../overnight/N02/build.log) |
| 소유 경계·타입목록·비노출·HEAD 불변·diff | 35개 확인 통과 | [self-review.json](../../../overnight/N02/self-review.json) |

초기 타입 검사는 새 테스트의 동적 표가 tuple로 추론되지 않아 TS2345로 실패했다. 명시적 tuple 타입을 붙여 해결했고 [초기 로그](../../../overnight/N02/typecheck-initial.log)를 보존했다. 기대값을 현재 출력에 맞춰 변경하거나 제품 동작을 완화한 수정은 아니다. 빌드 뒤 `rg`가 진단 식별자를 클라이언트 자산에서 찾지 못해 종료 1을 반환한 것은 정상적인 no-match이며 빌드 실패와 구분한다.

신규 진단 검사는 27개 타입, 알 수 없는 메타데이터/악성 형제필드, 숫자 경계, null/other 형태, 정상 문자열 비저장, HTTP body pull 0/cancel 1, 리디렉션 1회 요청, MIME/본문 없음, malformed JSON/UTF8/read 오류, 빈/부분/잘린 출력, 오류 우선순위, 성공 한국어 분할·usage·stop·DONE, 기본/명시 모델, 입력/출력 크기, method/입력/config/gate, 15/55초, 부모/본문 취소, 늦은 fetch resolve/reject, sink/직렬화 실패와 시간값 방어를 포함한다. 실제 로그에 새 합성 private 표식이나 합성 키값이 섞이지 않는지 모든 새 JSON/로그를 확인했다. 비밀값은 조회하지 않았고 테스트에는 합성 키만 썼다.

기존 관련 회귀는 handler·stream·redirect·reliability, `llmClient`의 단일 65초 예산과 정확한 v4 사전 의견, memoContext/Format/Validation/Prompts, 실제 React DOM MemoPanel의 revision/취소/늦은 callback/부록 차단/기본 보고서 유지다. [30그룹 대응표](../../../overnight/N02/contract-coverage.json)는 이 범위를 그룹별로 구분한다. D27의 신규 실제 브라우저/PDF/산식 재측정과 D30의 운영 짧은/18항목 생성은 실행하지 않았다. 엔진/보고서 변경이 없어 관련 없는 디자인·53쪽 PDF를 반복 검수하지 않았다. 총괄은 00:18 KST 독립 40사례에서 수정 전후 status/body/headers/upstream 호출의 동일성과 안전 로그를 확인했다. [총괄 검수 해시](../../../overnight/N02-root/verified-product-hashes.json)의 두 제품 파일과 현재 파일이 동일함을 00:19 KST 대조했다. 이후 총괄의 [전체 Vitest](../../../overnight/N02-root/full-vitest.json)도 48파일 676/676 통과, 실패 0을 실제 JSON으로 확인했다. 데이터 검증 exit 0은 총괄 인계로 확인했다. 전체 테스트를 중복 실행하지 않았으며 새 독립 검수자 N03의 코드 검수·추가 반례는 남긴다.

## 후속 운영 검증과 제약

1. 총괄이 소유 파일의 해시·diff와 독립 기대값을 검수한다. N02 검사는 실제 handler의 합성 외부 응답이며 운영 제공자 원인의 증거가 아니다.
2. 승인된 기존 절차의 PR·Vercel 배포 후 정확한 커밋/Ready/alias와 공개 API를 대조한다. 그 배포에서 제한된 합성 요청의 시간대를 정해 안전한 `ai_generation_failure`만 관측한다. 새 공개 진단 endpoint·헤더를 만들지 않는다.
3. HTTP status와 SSE code·typed category를 별개로 읽고 인증/정책/할당량/제공자/파서 원인을 과도하게 단정하지 않는다. `authentication`조차 어느 자격정보의 문제인지는 이 로그만으로 확정하지 못한다. 실제 모델·제공자·내부 fallback 횟수는 기록하지 않으므로 계속 미확인이다.
4. 관측된 분류에 근거해 후속 복구안을 별도 결정한다. 짧은 정상 텍스트는 연결 확인이고 실사용 18항목의 구조·수치·주장·현재 revision 검수를 대신하지 않는다. 기본 보고서 정상도 AI 생성 성공을 뜻하지 않는다.

현재 남은 항목은 배포 전 독립 검수, 실제 배포와 제한된 운영 관측, 그 결과에 따른 후속 복구 여부다. 신규 결제·권한 확대·키 교체·계정 정책 변경·최종 대회 제출은 하지 않았다. 소유 파일은 아래 manifest만으로 인계하며 이후 편집을 중지한다.

- 제품: [generate.ts](../../prototype/api/generate.ts), [_generationDiagnostic.ts](../../prototype/api/_generationDiagnostic.ts)
- 회귀: [generation-diagnostic.test.ts](../../prototype/src/test/api/generation-diagnostic.test.ts)
- 인계: 이 문서
- 중간 근거: [owned-manifest.json](../../../overnight/N02/owned-manifest.json), [설계](../../../overnight/N02/design.md), [자체 검수 스크립트](../../../overnight/N02/self_review.py). manifest는 자기 자신을 해시에서 제외한다.
