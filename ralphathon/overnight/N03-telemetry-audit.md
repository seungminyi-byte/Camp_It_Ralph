# N03 — 선택형 AI 진단의 독립 보안·수명 검수

검수 시작 2026-09-22 00:21 KST, 합성 실행 00:24 KST, 인계 시각은 아래 봉인 기록을 따른다. 최소 후속 진행 시각 09:00, 하드마감 10:00 KST를 유지한다. 이 문서는 N03 단위의 인계이며 전체 야간 작업 종료 선언이 아니다.

**판정: N02 제품 변경에서 배포를 막을 실제 누출·응답 계약·수명 회귀를 발견하지 않았다. 운영 수집기의 건수 판정 보완을 총괄에게 권고했고, 총괄 수정본을 독립 합성 검수했다. N04 배포·운영 관측으로 진행할 수 있다. AI 복구와 운영 Edge 실행 성공은 아직 입증되지 않았다.**

## 검사 기준과 범위

- 저장소 HEAD `3c578a17d43d9b4723f94848d635c3eef1ab1a26`의 미커밋 N02 두 제품 파일과 새 테스트가 대상이다. 루트/저장소 AGENTS, 런북·목표 원문, OVERNIGHT/STATE/HANDOFF, G023/G024, EVIDENCE의 최신 후속 기록, N01/N02 인계를 읽었다. 오래된 준비 메모의 awaiting_goal 상태를 현재 상태로 적용하지 않았다.
- 변경 diff와 실제 `generate.ts` → `GenerationDiagnostic` → `_http.ts`/`_generation.ts`의 호출·정리 경로를 대조했다. 제품 수정, 새 테스트의 제품 저장소 추가, 커밋·푸시·PR·배포, 실제 AI 호출·실로그 조회, 계정·환경값·키 조회, 새 Goal·예약·중첩 에이전트는 하지 않았다.
- 총괄이 품질 우선으로 지정한 Astra/xhigh 실행자다. 도구 설명상 복잡한 분석·코딩의 정확성과 회귀 안전성을 우선했고, 다른 모델의 실측 가격·속도·품질 벤치마크나 모델 전환은 하지 않았다. 총괄 외 실행자 한 명의 순차 인계를 따른다.
- N02의 285검사/type/lint/build와 총괄 676검사·데이터 검증은 기존 근거로 유지한다. 이 검사들을 다시 돌리지 않았다. 제품 SHA가 총괄 검수 당시와 같음을 직접 확인하여 기존 결과와 연결했다.

| 제품 파일 | N03 실행·인계에서 대조한 SHA-256 |
|---|---|
| `prototype/api/generate.ts` | `52e0f7edb31a19e0ecf378ac63349ea9a11bbfb6bfcf7482df21d59ea37f45a5` |
| `prototype/api/_generationDiagnostic.ts` | `6bad3658343d43d9e76ab0bac3237e8668a0ef6c8a3e957fa3a08825f492bd5e` |

## 실제 데이터 흐름 검수

| 경로 | 확인 내용과 한계 |
|---|---|
| `generate.ts:117`, helper `:26-39` | 요청마다 진단 객체가 새로 만들어진다. 동시 요청이 phase·model·errorType을 공유하지 않는다. 시작 시각과 경과 시간은 서버 생성값이다. |
| `generate.ts:49-63`, helper `:46-51` | JSON.parse 결과에서 선택된 오류의 정수 code, 정확한 27타입, 위치·형태만 복사한다. 원문 객체·message·metadata의 다른 필드·model·provider는 저장하지 않는다. JSON의 `__proto__`/`toJSON` 문자열 속성은 실행 가능한 getter나 함수가 아니다. |
| helper `:54-75` | 고정 12필드 객체를 한 JSON 문자열로 기록한다. terminal을 기록 시도 전에 설정하여 같은 실패의 재기록을 막고, 직렬화·로거 예외를 삼킨다. 기록 실패 시 전달 보장은 없으므로 best-effort 관측이다. |
| `generate.ts:96-111`, `:169-173` | 성공 완료 후의 취소는 실패 기록을 추가하지 않는다. 실패·취소 경합은 첫 terminal 관측을 유지한다. cleanup은 기존 reader 취소·lock 해제·Operation dispose·gate 반환 경로와 동일하다. |
| `generate.ts:154-160` | 늦게 도착한 fetch 응답 취소는 기존 코드다. HTTP 오류에서는 body를 새로 읽지 않고 status만 추가한다. 늦은 body pull 결과도 새 진단 경로로 원문을 전달하지 않는다. |
| helper 전체/import | 새 의존성·Node 전용 import 없이 Set/Date/performance/JSON/console만 사용한다. N03은 Node 24의 Web API로 실행했고 실제 Vercel Edge에서의 로거 전달은 N04에 남아 있다. |

공개 status/body/header, 파서의 `error:null` 수락 조건, 무료 경로·파라미터, 55/15/65초, 입력·출력 크기와 gate 정책은 변경 diff에서 유지됐다. `textEmitted`는 handler가 의미 있는 내용을 출력 경로에 넣었는지를 나타내며 브라우저 표시·사용자 열람을 증명하지 않는다. 오류 로그가 없다는 것만으로 정상 성공을 확정할 수도 없다.

## 독립 반례와 실제 결과

실행 전에 [expectations.json](../../../overnight/N03/expectations.json)에 기대값을 고정했다. [audit.mts](../../../overnight/N03/audit.mts)는 수정본 실제 handler와 실제 gate 클래스를 불러오고, 케이스 사이에는 새 gate 인스턴스로 격리한다. fetch 전체를 합성 함수로 교체하고 자식 프로세스에 합성 설정 두 개만 쓴다. 기존 환경값을 읽거나 복구용으로 저장하지 않는다. 실제 55초 대기는 하지 않았으며 이번 새 검사의 timer 검증은 정상·취소 후 정리 확인이다.

| 반례 | 미리 정한 기대값 | 결과 |
|---|---|---|
| A01 동시 두 요청의 실패 순서를 뒤집고 서로 다른 모델/타입/code/text 상태 부여 | 요청별 값 분리, 실패당 1기록, 반환 후 같은 요청 재진입 성공 | 통과. 2기록, 3회 gate 반환, 후속 성공은 0추가기록 |
| A02 한 chunk의 DONE 뒤에 오류 프레임을 붙이고 이후 parent 취소 | 기존 성공 본문, 0기록, 1회 정리 | 통과 |
| A03 parent 취소 후 body pull resolve, upstream cancel은 영원히 pending | REQUEST_CANCELLED 1기록, 응답·정리는 cancel 완료를 기다리지 않음 | 통과 |
| A04 parent 취소 후 body pull reject, upstream cancel도 reject | REQUEST_CANCELLED 1기록, unhandled rejection 없음 | 통과 |
| A05 typed upstream 오류 뒤 downstream/parent 취소 | 첫 typed 오류만 남고 정리 1회 | 통과 |
| A06 downstream/parent 취소, logger throw, upstream cancel reject를 겹침 | 로거 시도 1회, 취소·반환 1회, 응답 정리 유지 | 통과 |
| A07 공개 JSON에 `__proto__`, `constructor`, `toJSON`, private 문자열을 넣음 | prototype 변화·원문 기록 없이 12필드만 유지 | 통과. 공개 입력으로 가능한 JSON 속성만 사용 |
| A08 한 chunk에 서로 다른 오류 두 개 | 최초 오류 1개 유지 | 통과 |

[실행 결과](../../../overnight/N03/handler-audit-results.json): **8/8 통과**, 합성 fetch 10회, 실제 외부 호출 0, 모든 케이스에서 잔여 timer 0·unhandled rejection 0. 진단 문자열은 12필드·1인수·1,000자 미만이며 합성 입력/키 표식이 포함되지 않았다. 성공 출력 자체에 요청한 합성 텍스트가 나타나는 것은 의도된 정상 경로이며 로그와 구분했다.

## 운영 수집기 검수와 보완

제품 취약점과 구별하여 총괄 소유 `work/overnight/N04/collect_diagnostic.py`의 관측 정확성을 검토했다. 원본 수집기·제품은 N03이 수정하지 않았다.

1. **P2, 보완 완료 — 원시 건수의 소실.** 최초 검토본 81~83행은 12필드 전체가 동일한 두 이벤트를 dedup한 뒤 1개로 판정했다. 시간값은 ms 단위여서 중복 전달이나 동일한 기록을 구별할 근거가 없는데도 단일 이벤트처럼 집계할 수 있었다. 원문 내용 노출 문제는 아니다. 권고는 raw/unique 수를 모두 저장하고 원시 1개일 때만 단일 기록으로 판정하는 것이었다. 총괄 수정본 84~94행을 실제 main으로 실행한 C01은 **raw 2 / unique 1 / unconfirmed**를 유지했다.
2. **P3, 보완 완료 — 잘못된 달력 날짜.** ISO 모양만 맞고 월/일이 잘못된 값은 최초 39행의 fromisoformat에서 수집을 중단할 수 있었다. 총괄이 ValueError를 거부 처리했다. C02에서 잘못된 값은 버리고 뒤의 정상 이벤트는 보존했다. 기존 server Date가 만드는 값으로는 발생하지 않는 방어 경계이며 운영 공격·유출이 재현된 것은 아니다.
3. C03은 추가 private 필드, 시간대 밖 기록, boolean code, 허용되지 않은 모델의 네 변형을 모두 거부했다. stdout/stderr의 private 합성값은 저장·출력된 요약에 없었다.

[collector_audit.py](../../../overnight/N03/collector_audit.py)는 subprocess 실행을 합성 결과로 교체한 뒤 실제 수집기 main을 호출했다. **3/3 통과, 실제 Vercel 명령·실로그 조회 0.** 최초 중복 판정은 정적 검토에서 찾았으며 수정 전 원본을 실행한 red 결과가 있는 것처럼 표현하지 않는다. [결과](../../../overnight/N03/collector-audit-results.json)에 검수한 수집기 SHA가 있다. 수집기는 root가 계속 소유한다.

배포 ID·시간 구간·고정 event는 상관관계만 제공한다. 같은 구간의 다른 요청을 개별 식별하지 못하므로 단일 기록이 보여도 곧바로 자체 요청의 유일한 로그라고 확정하지 않는다. CLI 접근 실패·로그 지연/누락·원시 라인 해석 실패도 upstream 원인과 구분해야 한다.

## 남은 운영 증거와 인계

- 정확한 새 커밋·Vercel Ready·별칭·기본 API/익명 핵심 흐름을 총괄이 확인해야 한다. 로컬 합성 통과와 진단 배포는 별개다.
- 승인된 범위의 제한된 자체 합성 요청으로 새 배포의 안전 로그를 관측해야 한다. 현재 오류가 인증·정책·할당량·provider·nullable 필드 중 무엇인지는 N03에서도 미확정이다.
- 짧은 연결 성공과 실사용 18항목 의견의 구조·수치·주장·현재 revision 검수는 구분한다. 새 관측 뒤에만 복구 여부를 결정한다.
- 별도 helper의 raw 타입 경계를 넘어선 prototype/getter 변조나 로깅 API 교체는 공개 JSON으로 재현하지 못하므로 제품 취약점으로 보고하지 않았다.

N03 소유는 이 문서와 `work/overnight/N03/`뿐이다. Python의 모듈 import 과정에서 N04의 기존 `__pycache__`가 갱신될 수 있어 총괄에 알렸고, 총괄은 자기 검수에서도 만든 중간 캐시로 확인했다. N04 원본 수정은 0이며 N03 스크립트는 이후 bytecode 쓰기를 끈다. 다른 소유자의 동시 문서 변경은 N03 변경으로 세지 않는다.

근거·실행 명령·해시는 [source-manifest.json](../../../overnight/N03/source-manifest.json), [validation-commands.json](../../../overnight/N03/validation-commands.json), [self-review.json](../../../overnight/N03/self-review.json)에 있다. [owned-manifest.json](../../../overnight/N03/owned-manifest.json)은 N03 중간 근거를 봉인하며 SHA-256은 `b2cd3b12c3a8132357c7b645bd852412d420f9a3db5865710caa01060daebb9f`다. 자기참조 해시를 피하기 위해 본 문서와 manifest 자신, 최종 봉인 파일은 그 manifest 해시 목록에서 제외한다. [handoff-seal.json](../../../overnight/N03/handoff-seal.json)은 본 문서와 manifest의 실제 해시, 인계 KST와 마감 잔여시간을 함께 고정한다. 봉인 후 편집을 중지하고 총괄에 소유권을 반환한다.
