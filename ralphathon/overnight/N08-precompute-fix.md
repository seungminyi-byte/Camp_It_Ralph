# N08 — 수동 사전 생성 도구 복구 및 검수 후보 계약

완료 검수 시각: 2026-09-22 00:52 KST. 하드 마감 10:00까지 약 9시간 8분이다. 야간 전체 작업의 최소 계속 시각 09:00와 구분하며 이 산출물만 인계한다. 시작 HEAD는 `e7a33e7d37f3a9e42937cea043cb153f80cc1e89`이고 작업 브랜치는 `codex/ralph-goal-20260921`이다.

총괄의 G026 결정과 N07 감사를 적용했다. 총괄은 복잡한 경계 분석·회귀 정확성을 우선해 Astra/xhigh를 지정했고 실제 실행 모델 대조 기록은 총괄이 담당한다. 이 실행자는 모델 전환·중첩 위임·새 Goal·예약·설치·커밋·푸시·PR·배포를 하지 않았다. 현재 운영 AI 복구는 별도 총괄 작업이다.

## 변경 결과

[생성 스크립트](../../prototype/scripts/precompute_memos.ts)를 현재 UI v4 입력과 안전한 수동 실행 계약에 맞췄다. **명시한 새 후보 파일 하나만 생성하며 원래 두 배포 파일은 갱신하지 않는다.** [사용 안내](../../docs/PRECOMPUTED_MEMOS.md)에 실행 조건, 실패 경계, 별도 내용·서명·게시 검수를 정리했다. 이 수정에서 실제 제공자 생성이나 실제 게시를 수행하지 않았다.

- 무료 모델 네 개의 정확한 허용 목록을 적용하고 서버 handler를 import하지 않았다. `OPENROUTER_MODEL`은 단일 모델 설정이며 `LLM_MODEL`을 읽지 않는다. 허용 목록의 서버 소스와 별도 대조 시험을 두었다. 총괄의 기본 fallback 목록 수정과 서로 다른 변경이다.
- Node 전용 의존성이 없는 기존 `api/_http.ts`의 `Operation`, `boundedBytes`, `ApiError`, `cleanString`, `isRecord` 등을 그대로 재사용했다. 해당 helper·runtime handler·제품 화면 소스는 수정하지 않았다.
- 예제당 요청부터 마지막 JSON 본문까지 55초, 부모 취소 신호, `redirect: manual`, UTF-8 입력 96KiB·프롬프트 20,000자·JSON 전체 1MiB·원문 의견 128KiB를 적용했다. 비스트리밍 요청이므로 SSE의 15초 idle 정책을 복제하지 않고 유한 총 예산을 쓴다. 재시도·대체·체크포인트 확장은 하지 않았다.
- HTTP 오류, JSON 콘텐츠 유형/shape/UTF-8, HTTP200 명시적 오류, 단일 choice, `finish_reason=stop`, 문자열·비어 있지 않은 본문을 확인한다. 이후 `parseMemo.complete && !error`, `buildMemoFacts`/`validateMemo` flag 0이 모두 필요하다. ERROR·불완전 구조·잘못된 수치·확정 주장은 저장하지 않는다.
- `landUseSource`를 `scoreSite` 이전 입력에 넣고 온라인 미조회는 모두 `null`로 구성했다. 현재 ReviewApp의 같은 좌표·기본조건·출처·온라인 null 상태를 독립 조립한 입력과 세 예제의 전체 결과·체크리스트·v4 서명이 일치했다. `data_centers.json` 경로를 수정하고 화면의 기존 bundle validator를 재사용했다. 손상 선택 자료를 정상 부재로 취급하지 않는다.
- 키·모델·전체 fixture·출력 경로·자료·모든 프롬프트를 요청 전에 점검한다. 빈/중복 id·잘못된 좌표/용도지역 등을 거절하고 원시 예외·응답·키·모델값 대신 고정 코드만 출력한다. 인수 없음/`--help`는 환경·자료·네트워크 없이 사용법만 반환한다.
- 필수 `--output`은 기존 부모 안의 새 경로여야 한다. 부모 `realpath`, 보호된 두 대상 및 대소문자/심볼릭 링크 별칭, 기존 파일·디렉터리·dangling link를 검사한다. 모든 생성·내용 검수가 끝나면 후보 2MiB 상한과 경로를 다시 확인하고 `wx`/0600으로 배타적 생성한다. 부모 폴더를 만들거나 기존 출력을 덮어쓰지 않는다. 저장 실패 때 자신이 만든 inode만 정리하고 교체된 다른 파일은 삭제하지 않는다.

정리 실패나 강제 종료에는 새 경로에 부분 후보가 남을 수 있다. **종료코드 1의 후보는 게시하지 않는다.** 무관한 파일시스템 전체 트랜잭션이나 복구 프레임워크는 추가하지 않았다. 온라인 근거·조회시각·조건이 달라지면 후보 서명이 거절되는 것이 정상이며, 좌표만으로 fallback을 넓히지 않는다. 자동 flag 0은 모든 자연어와 원자료 검증 완료를 뜻하지 않는다.

## 독립 기대와 실제 검증

[기대값](../../../overnight/N08/expectations.json)은 **00:42:05 KST, 구현 전에** 저장했다. SHA-256은 `fd7f65ed1652e178de99981bb010f1c823dde069b1e265eb48215b39291a5072`다. N07 E01–25를 이어받되 E02/E20은 G026의 단일 신규 후보, E06은 한 번의 요청 후 종료, E25는 허용 소유 파일만 변경으로 명시했다. E26 도움말, E27 정리, E28 무료 목록 대조, E29 소비 코드의 파일 크기 한도를 추가했다. 기대값을 결과에 맞추어 바꾸지 않았다.

[새 회귀](../../prototype/src/test/scripts/precompute-memos.test.ts)는 실제 계산·파서·서명·내용 검증·수명 helper를 사용하고 `fetch`·환경변수는 합성값을 주입한다. 실제 global fetch는 시험마다 차단하며 호출되지 않았음을 검사한다. 파일 시험은 `work/overnight/N08` 아래 임시 격리 폴더에서 수행했고 공개 번들은 읽기 전용 심볼릭 링크로 연결했다. 변형이 필요한 fixture/JSON은 격리 파일 또는 링크를 제거한 새 사본에만 썼다. 실제 CLI 진입도 비밀값 없는 `env={}`와 도움말/인수 없음으로만 확인했다.

| 확인 | 결과·증거 |
|---|---|
| 새 도구 신뢰성 회귀 | 106/106 통과. HTTP·명시 오류·형식·종결·크기 경계, 헤더/본문 stall, late response, 취소·timer/listener/reader 정리, 경로·충돌·부분 쓰기·검증 내용·3개 v4 일치 |
| 기존 관련 메모 회귀 | llmClient 15, memoContext 6, memoFormat 10, memoValidation 27: 58/58 통과 |
| 총 관련 회귀 | 5파일 164/164, [최종 JSON](../../../overnight/N08/tests-final.json), [요약](../../../overnight/N08/verification-summary.json) |
| 타입·린트·프로덕션 빌드·diff 공백 | 모두 exit 0, [명령 결과](../../../overnight/N08/checks.json). 총괄 동시 소유 API 변경이 있는 checkout에서 확인 |
| 보존 검수 | 기준 48파일에서 이 실행자의 script 및 총괄의 README/generate 변경 외 예상 밖 변경 0. [보존 대조](../../../overnight/N08/preservation-check.json) |
| 원래 배포 출력 | 두 경로 모두 시작/종료 시 부재. 실제 원래 경로 쓰기 0 |
| 외부·계정 | 실제 외부 호출 0, 실제 키/계정값 조회 0. 제공자 성공·속도·과금이나 운영 fallback 검증을 주장하지 않음 |

전체 제품 suite는 총괄의 최종 통합 검사 범위이며 이 실행자는 중복 실행하지 않았다. UI/PDF/E2E의 동일 검사를 이 수동 도구 수정 때문에 반복하지 않았다.

재현은 Node.js 24와 이미 설치된 의존성으로 `prototype`에서 실행한다.

```sh
node node_modules/vitest/vitest.mjs run src/test/scripts/precompute-memos.test.ts src/genai/memoContext.test.ts src/genai/memoFormat.test.ts src/genai/memoValidation.test.ts src/genai/llmClient.test.ts
npm run typecheck
npm run lint
npm run build
```

## 실패 이력과 한계

[run-history.json](../../../overnight/N08/run-history.json)에 초기 실패를 보존했다. 첫 타입 검사에서는 arrow `never` helper의 제어 흐름 좁힘이 적용되지 않아 오류가 났고, 선언형 함수로 고쳐 재검사했다. 첫 시험 명령은 cwd가 저장소 루트여서 Vitest 경로를 못 찾았으며 실제 제품 실행 전 실패했다.

첫 시험 99통과 이후 자체 검수에서 배열 기반 fixture 시험표 일부가 개별 인수로 확장돼 의도한 중복/잘못된 배열을 검사하지 않는 문제를 발견했다. 표를 입력 하나씩 감싸도록 고쳤고 기존 99통과를 최종 검증으로 세지 않았다. 이후 관련 158통과, CLI 실제 진입·고정 로그·과대 프롬프트를 추가한 최종 164통과를 각각 보존했다. 최종 제품 기대값 자체는 바꾸지 않았다.

시험은 합성 모델 본문과 오류이며 실제 모델이 현재 이 형식·내용 검수를 통과한다는 보장이 아니다. 55초 총 예산은 도구가 요청을 기다리는 한계이고 제공자 내부 처리가 같은 시점에 반드시 중단됐다는 측정은 아니다. 코드상 단일 free 요청은 자동 유료 전환을 만들지 않으며 제공자 자체 정책은 실제로 조회하지 않았다.

## 소유권 반환

소유 변경은 다음 네 저장소 파일과 `work/overnight/N08/`뿐이다.

- `prototype/scripts/precompute_memos.ts`
- `prototype/src/test/scripts/precompute-memos.test.ts`
- `docs/PRECOMPUTED_MEMOS.md`
- `ralphathon/overnight/N08-precompute-fix.md`

원본 스크립트 사본·48파일 기준 해시·실패 로그·결과는 N08 작업 폴더에 있다. N07 원본 증거는 읽기 전용으로 보존했다. README/RUNNING/API/제품 src/다른 ralphathon 상태 문서는 수정하지 않았다. 소유 파일 편집 중지 후 [owned-manifest.json](../../../overnight/N08/owned-manifest.json)에 파일 바이트와 SHA-256을 기록하며 manifest 자신의 해시는 제외한다. 총괄의 독립 검수 전 N08 완료를 제품 게시·운영 AI 복구·야간 전체 종료로 확장하지 않는다.
