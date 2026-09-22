# 선택형 AI 오류의 운영 확인

2026-09-22 기준. 개발·운영 담당자를 위한 안내입니다. 기본 조회·비교·보고서는 AI 없이 사용할 수 있습니다. 이 진단 기능은 실패 원인을 좁히기 위한 것이며 AI 생성 성공을 보장하지 않습니다.

## 응답과 진단 기록

[`api/generate.ts`](../prototype/api/generate.ts)는 공개 응답에 안전한 오류 코드만 반환합니다. 스트리밍을 시작한 뒤 실패하면 HTTP 200 본문에도 `## ERROR`가 들어갈 수 있습니다. 상태 코드만 보고 성공으로 판정하지 않습니다. 실제 연결 성공과 18항목 의견의 구조·수치·주장·현재 입력 일치도 별도 검수합니다.

[`_generationDiagnostic.ts`](../prototype/api/_generationDiagnostic.ts)는 실패할 때 다음 12필드만 서버 로그에 한 번 남깁니다. 정상 완료는 이 오류 기록을 만들지 않습니다. 로깅 실패는 공개 응답이나 요청 정리를 방해하지 않습니다.

| 필드 | 의미 |
|---|---|
| `event` | 고정값 `ai_generation_failure` |
| `requestAtUtc`, `elapsedMs` | 서버의 시작 시각과 경과 시간. 입력·제공자 원문에서 가져오지 않음 |
| `phase`, `localCode` | 서버 내부 처리 단계와 기존의 안전한 오류 코드 |
| `upstreamHttpStatus` | 실제 받은 upstream HTTP 상태 또는 null |
| `upstreamCode` | SSE 오류의 100~599 정수 code 또는 null |
| `upstreamErrorType` | 공식 오류 타입 27개와 정확히 일치하는 값 또는 unknown |
| `errorLocation`, `errorShape` | 오류 필드 위치와 object/null/other/missing 구분 |
| `requestedModels` | 서버가 요청한 허용 무료 식별자 목록. 실제 선택 모델·제공자와 다름 |
| `textEmitted` | 오류 전에 의미 있는 텍스트를 이미 전송했는지 여부 |

입력 본문, 키, 헤더, 응답 원문, 오류 메시지·stack, 제공자 이름·고유 코드, 실제 응답 모델, 중복 요청 해시는 이 기록에 넣지 않습니다. HTTP 오류 body를 추가로 읽지 않습니다. 시작 20초·서버 전체 180초·본문 수신 대기 15초·클라이언트 전체 195초 제한을 적용합니다. 시간 로그의 상한은 실행 제한을 연장하는 설정이 아닙니다.

`GEMINI_API_KEY`가 설정되면 고정 모델 `gemini-3.5-flash-lite`에 Google 네이티브 SSE로 요청하며 다른 공급자로 자동 전환하지 않습니다. `STOP`과 비어 있지 않은 본문을 확인해 전송을 종료합니다. `MAX_TOKENS`·안전 차단·잘린 응답은 실패이고 추론 부분은 출력하지 않습니다. Google의 403은 인증·권한 오류로 구분하며, 그 밖의 HTTP/SSE 오류는 기존 안전 코드를 사용합니다. Google 키가 없는 기존 환경에서만 OpenRouter 기본 3개/명시 1개 무료 모델 경로와 `[DONE]` 종료를 유지합니다. [Google 스트리밍 응답 계약](https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent).

## 범위를 좁혀 확인하기

1. 검증할 커밋과 현재 운영 배포 ID·Ready·별칭을 대조합니다. Vite의 `/api`는 운영 서버로 전달되므로 로컬 API 파일을 바꿨다는 이유만으로 새 진단이 실행됐다고 판단하지 않습니다.
2. 공개·합성 내용으로 직접 보낸 요청의 UTC 시작·종료 시각을 기록합니다. 반복 호출로 원인을 추정하지 않습니다.
3. 기존 인증으로 해당 배포와 좁은 시간 구간, 고정 이벤트를 함께 검색합니다. 아래 자리표시는 실제 확인한 값으로 바꿉니다. 명령 인수에 토큰이나 키를 추가하지 않습니다.

```sh
vercel logs --deployment <배포-ID> \
  --since <요청-직전-UTC-ISO> --until <요청-직후-UTC-ISO> \
  --query ai_generation_failure --limit 5 --json
```

4. Vercel의 전체 조회 결과에는 플랫폼 메타데이터도 있을 수 있습니다. 공유용 증거에는 위 12필드 중 허용된 값만 추출하고 요청·배포·시간의 대응을 확인합니다. 다른 요청과 구분되지 않거나 로그가 없으면 원인 미확정으로 남깁니다. 접근 실패나 로그 보존 범위도 생성 실패 원인과 구별합니다. [Vercel 로그 명령](https://vercel.com/docs/cli/logs).

## 기록의 해석과 다음 행동

HTTP 200과 SSE code 429는 서로 다른 관측이므로 각각 보존합니다. 타입이 없을 때 숫자나 경과 시간만으로 타입을 만들어 넣지 않습니다. `authentication`이 관측돼도 어느 계층의 자격정보 문제인지까지 확정되지는 않습니다. 공식 스트리밍 계약상 헤더 전송 이후의 실패는 토큰이 나오기 전에도 본문에 나타날 수 있습니다. [OpenRouter 오류 계약](https://openrouter.ai/docs/api_reference/errors-and-debugging).

- 인증·권한·결제 분류: 확인된 분류와 필요한 계정 소유자 조치를 남깁니다. 자동 키 교체·권한 확대·결제를 하지 않습니다.
- 제공자 과부하·시간초과·사용 불가: 현재 허용된 무료 모델의 제공 상태를 확인하고, 작은 변경의 효과를 같은 배포 조건에서 대조합니다. 무한 재시도나 유료 경로를 추가하지 않습니다.
- `unknown` 또는 nullable 필드: 실제 오류 형태와 공식 응답 계약을 먼저 대조합니다. 오류를 무시하거나 성공으로 바꾸지 않습니다.
- 짧은 생성 성공: 연결 확인으로 기록합니다. 실제 검토 의견의 내용과 보고서 부록 사용 가능 판정은 별도로 확인합니다.

회귀는 [`generation-diagnostic.test.ts`](../prototype/src/test/api/generation-diagnostic.test.ts), 기존 API·클라이언트·MemoPanel 검사에 있습니다. 합성 응답의 테스트 통과는 실제 운영 제공자의 성공 증거가 아닙니다.
