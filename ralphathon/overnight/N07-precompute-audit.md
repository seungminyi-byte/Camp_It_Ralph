# N07 — 수동 사전 의견 생성 도구 독립 감사

감사 기준: 2026-09-22 00:39:20 KST, `e7a33e7d37f3a9e42937cea043cb153f80cc1e89`, `codex/ralph-goal-20260921`. 총괄이 정확성·회귀 안전성을 우선하여 Astra/xhigh 실행자로 지정했다. 이 실행자는 모델 전환·중첩 위임·새 Goal·예약을 수행하지 않았다. 저장소 `AGENTS.md`, 야간 계획·상태·인계, N01 지적, README/RUNNING 및 현재 관련 코드를 읽고 적용했다.

## 결론과 범위

**현재 사용하지 않는 수동 도구를 다시 실행하기 전에 수정할 결함이 있다. 운영 AI 실패의 원인이나 실제 비밀 유출이 확인된 것은 아니다.** 우선순위는 모두 수동 실행이 전제인 P2/P3다. 운영 API·진단 helper·제품 코드는 수정하지 않았다.

핵심은 세 가지다. 임의 모델 설정과 정제되지 않은 오류를 허용하고, 현재 화면과 다른 입력으로 v4 서명을 만들며, 구조만 완성되면 검수에서 탈락하는 의견도 저장한다. 추가로 두 출력 파일의 갱신은 하나의 트랜잭션이 아니다. 기존 출력이 없다는 사실과 별개로 재사용 전에 다뤄야 할 문제다.

현재 `prototype/public/data/precomputed_memos.json`과 `data-pack/out/precomputed_memos.json`은 모두 없다. package scripts·Vite 설정·GitHub workflow·`build_all.py`에서 이 생성 도구의 실행 연결을 찾지 못했다. `tsconfig.scripts.json:7`의 타입 검사 포함은 실제 실행 검증이 아니다. 실행 시작점은 사람이 `prototype`에서 스크립트를 직접 실행하는 경우이며, 이때 OpenRouter를 직접 호출한다. 운영 `/api/generate`를 통과하지 않는다.

감사는 [고정 기대값](../../../overnight/N07/expectations.json) 25개를 실행 전에 저장하고, 원본 사본을 VM에서 합성 `fetch`·환경변수·메모리 파일시스템으로만 실행했다. 현재의 순수 계산·파서·서명·검증 함수는 실제 코드를 격리 로드했다. **실제 네트워크 0회, 실제 환경·키·계정값 조회 0회, 원래 출력 경로 쓰기 0회**다. 두 출력 경로 이름은 VM 안의 `/audit/...` 가상 경로다. 4초 간격은 가짜 타이머로 진행했으며 실제 공급자 지연·과금·리다이렉트는 측정하지 않았다.

최종 결과는 **25개 계약 중 6개 충족, 19개 미충족**이다. 경계 사례들이 중복되는 집계이며 독립 취약점 19개를 뜻하지 않는다. 결과와 관찰 원문은 [results.json](../../../overnight/N07/results.json), 재현 도구는 [audit.cjs](../../../overnight/N07/audit.cjs)에 있다.

## 위험 우선순위와 실행 영향

| 우선순위 | 근거·트리거 | 실제 확인한 동작 | 영향과 운영 경계 |
|---|---|---|---|
| P2 | `precompute_memos.ts:98–105, 109–112, 181–183`. 비정상 HTTP·네트워크 오류 또는 임의 `OPENROUTER_MODEL`을 지정해 수동 실행 | HTTP 오류 JSON의 합성 표식과 합성 네트워크 예외 내용이 stderr로 출력됨. 승인 목록 밖 모델과 줄바꿈 포함 모델 값이 stdout·요청 본문으로 그대로 전달됨(E03–05). | 수동 실행 로그에 제공자·입력 관련 내용이 섞일 수 있다. 유료 모델을 설정했을 때 차단하는 코드가 없어 제공자가 받아들이면 비용 발생 가능성이 있다. 실제 키·유료 모델·과금은 조회/시험하지 않았다. 운영의 무료 모델 목록과 안전한 진단을 우회하는 별도 경로다. |
| P2 | `precompute_memos.ts:83–105, 147–169`. 응답 지연·과대 응답·HTTP200 오류·redirect | 요청 signal과 애플리케이션 제한시간이 없고 `res.text()`/`res.json()`은 제한 없이 읽는다. 141,739바이트 메모를 저장했다. `Request.redirect` 기본값은 `follow`다(E13–16). | 취소·시간·메모리·외부 전송 경계를 제공자/Node 기본 동작에 맡긴다. Node 자체 시간제한이 전혀 없다는 주장은 아니다. 리다이렉트의 실제 발생이나 다른 출처로 Authorization이 전달됐다는 증거도 없다. |
| P2 | `precompute_memos.ts:124–138, 165`, `ReviewApp.tsx:94–114`, `memoContext.ts:15–35`. 현재 화면에서 생성본 fallback 사용 | 스크립트 input에는 `landUseSource`가 없다. 화면에는 `unknown/manual/auto`가 항상 있다. 같은 좌표·기본조건과 온라인 null 상태에서 3개 예제 모두 서명이 다르다(E18). | 현재 UI에서는 이 스크립트 생성본이 exact-context 검사에서 거절된다. v4 포맷 번호는 맞지만 정상 fallback으로 사용할 수 없는 준비본을 만들게 된다. 일치 검사를 완화하면 안 된다. |
| P2 | `precompute_memos.ts:148–167`, `memoFormat.ts:151–152`, `memoValidation.ts:109–121`. 구조를 갖춘 부적격 응답 | top-level error+content, `finish_reason=length/error/content_filter/null`, 완성 구조+`## ERROR`, 수치·확정 주장 위반 텍스트를 모두 저장했다(E09–12). | 생성 파일을 검수 완료로 오인할 수 있다. 현 client는 ERROR/과대 본문을 거절하고 화면의 검증은 수치·주장 위반을 부록에서 제외한다. 따라서 이것을 현재 운영 보고서에 부적격 AI가 자동 첨부되는 결함으로 서술하지 않는다. |
| P2 | `precompute_memos.ts:117–123, 172–178`. 두 번째 출력 쓰기 실패·빈 fixture | 두 번째 쓰기를 합성 실패시키면 첫 파일은 신규 내용, 둘째는 기존 내용이다. 빈 scenarios는 호출 없이 빈 memos를 두 파일에 덮어쓰고 성공 종료한다(E20–21). | 수동 생성물의 일관성·기존본 보존 문제다. 실제 출력은 생성하지 않았다. 일단 전체 생성에 성공하면 기존 파일을 백업 없이 덮어쓰는 코드다. |
| P3 | `precompute_memos.ts:29–41, 59`, `useAppData.ts:88`. 번들 자료 로드 | `public/data/data/data_centers.json`을 조회하므로 현재 존재하는 `public/data/data_centers.json`을 읽지 못하고 null로 처리한다(E17). | 로더 불일치다. 현재 엔진·메모 프롬프트·서명에서 dataCenters를 사용하지 않아 경로를 바로잡은 3개 예제의 결과·프롬프트·키는 모두 동일했다. 점수 오류나 v4 불일치 원인으로 과장하지 않는다. |

`precompute_memos.ts:5`의 실행 예시는 키 값을 명령행의 환경변수 대입문에 넣도록 보인다. 실제 키는 없지만 이 예시를 그대로 사용하는 절차는 README:101의 비밀값 명령 인수 금지 취지와 맞지 않는다. 이미 안전하게 설정된 환경을 전제로 한 값 없는 실행 예시로 바꾸는 것이 적절하다.

## 응답·중단·저장 경계의 세부 결과

| 사례 | 고정 기대 | 실제 결과 |
|---|---|---|
| E01 키 없음 | 외부 호출·출력 없이 실패 | 충족. 0회 호출·0회 쓰기. |
| E02 정상 합성 메모 | 동일한 v4 두 출력, 64자리 SHA-256 contextKey | 충족. 기본 free 식별자로 1회 합성 호출, 동일한 두 출력. 실제 AI 성공 검증은 아님. |
| E06 빈 문자열 | 최대 두 번 시도 후 기존 출력 보존 | 충족. 2회, 4초 대기 지정 1회, `0/18` 오류. |
| E07 HTTP200 error만 존재 | 오류를 분류하여 즉시 실패 | 미충족. 빈 content로 간주해 재호출한 뒤 `response missing item sections (0/18)`로 종료. 이 사례의 error 원문은 로그에 나오지 않음. |
| E08 content가 number/object/array/null | 고정 형식 오류 | number/object/array는 `text.replace is not a function`, null은 빈값처럼 2회 시도. 파일은 보존됨. |
| E09–12 오류·미완성 종료·무근거 의견 | 저장 제외 | 모두 저장. 999999㎡와 공급 확정 주장 반례는 현 `validateMemo`에서 `number`, `claim` 두 flag이며 부록 적격은 false. |
| E13–14 출력/요청 크기 | 메모 128KiB·프롬프트 20,000자/96KiB와 호환 | 141,739바이트 메모 저장. 20,001자 요청도 직접 전송. 현재 실제 fixture 프롬프트는 11,122–11,449자, UTF-8 17,120–17,624바이트이며 기존 promptSizeIssue는 null이었다. 현재 정상 fixture가 너무 크다는 지적은 아님. |
| E15 헤더·본문 대기 | 유한 예산과 AbortSignal | 두 대기 구간 모두 signal/타이머 없음. 가짜 응답을 직접 풀어 종료했다. 실제 장시간 기다려 실패를 관찰한 시험은 아님. |
| E16 redirect | 명시적 거절 | redirect 옵션 없음, 표준 Request의 기본 follow 확인. 실제 리다이렉트 호출 없음. |
| E19 첫 fixture 성공·다음 HTTP 실패 | 두 기존 출력 보존 | 충족. 파일 쓰기는 0회. 성공한 첫 결과는 메모리에만 있어 프로세스 종료 시 사라짐. 재개/checkpoint 없음. |
| E20 둘째 출력 실패 | 두 기존본 보존 또는 안전한 게시 단계 | 미충족. 첫 신규/둘째 기존으로 나뉘며 종료코드 1. |
| E21–22 빈 목록·중복 id | 호출 전에 거절, 기존본 보존 | 빈 목록은 빈 파일로 덮어씀. 중복 id 두 건은 2회 호출 후 memos 한 건으로 덮어씀. |
| E23 잘못된 로컬 JSON | 원문 없이 로드 오류 | 호출·쓰기는 0회이나 JSON.parse 오류에 입력의 `L_CANARY` 일부가 출력됨. 현재 공개 번들의 실제 비밀 노출은 아님. |
| E24 optional 자료 없음/손상 | 없음과 손상 구별 | 없음은 null, 손상은 예외로 전체 중단. 현재 코드가 optional 손상을 조용히 정상 자료로 처리하는 것은 아님. |
| E25 원본 보존 | 원본 해시·출력 부재 유지 | 37개 감사 기준 파일과 원래 두 출력 부재 유지. 추가 순수 모듈 15개의 해시도 기록함. |

Ctrl+C/SIGTERM의 별도 처리나 실행 중 fetch에 연결된 AbortController는 없다. 일반적인 프로세스 종료 자체를 막지는 않지만 취소의 정리·정해진 오류 분류·부분 결과 인계는 제공하지 않는다. 완료된 fixture도 마지막 일괄 저장 이전에는 보존되지 않는다. 마지막 fixture 뒤에도 코드상 4초 대기가 한 번 더 있다. 이 대기를 제거하는 것은 핵심 결함 수정의 필수 범위가 아니다.

HTTP 실패 본문은 `await res.text()` 전체 읽기 **이후** 300자로 자른다. 따라서 로그 300자 상한은 응답 읽기 크기 상한이 아니다. JSON content의 타입 단언 또한 응답 스키마 검증이 아니다. 별도 top-level error나 choices 구조, 종료 사유를 검사하지 않는다.

## 데이터와 v4 계약

모든 자료 기준 디렉터리는 `prototype/public/data`다. 필수 파일은 `cases.csv`, `regulations.csv`, `emd_power.json`, `emd_centroids.json`, `substations_osm.json`, `schools.json`, `pop_grid.json`, `dc_stats.json`, `constants.json`이고, main은 추가로 `scenarios.json`의 배열을 사용한다. optional은 `terrain_grid.json`, `protected_zones.json`, `households_grid.json`, `permit_delay.json`, `news_signal.json`, 그리고 잘못 지정된 `data/data_centers.json`이다. optional의 의미는 부재 시 null이며 파싱 실패까지 무시한다는 뜻이 아니다. 필수/optional 대부분은 TypeScript 단언으로 읽고 전체 shape 검증은 없다. 지형·보호구역은 각 decoder의 검사를 거친다.

실제 번들에는 세 fixture가 있고 두 출력의 부모 디렉터리도 존재한다. 이 감사는 번들 재수집·갱신을 하지 않았다. `scenarios.json`의 expectedGrade/story는 생성 로직에 사용되지 않는다.

| fixture | 스크립트→화면 서명 일치 | landUseSource | 추가 확인 |
|---|---|---|---|
| 고양 덕이동 | 불일치 | 누락→unknown | score 결과 자체는 같아도 입력 직렬화가 달라짐. |
| 인천 청천동 | 불일치 | 누락→manual | 입력뿐 아니라 기존 엔진의 용도지역 근거 판정도 달라짐. |
| 세종 반곡동 | 불일치 | 누락→manual | 동일. |

`memoContext.ts`는 zoning/restrictions/disaster의 undefined와 null을 정규화하지만 `landUseSource`를 채우지는 않는다. `engine.ts:501–504`는 출처가 생략된 예전 offline fixture와 현재 화면의 수동 가정을 구분한다. 출처를 서명에만 덧붙이거나 결과를 과거 수치로 고정해서는 안 된다. **현재 화면과 같은 input을 먼저 만든 다음 scoreSite→체크리스트→프롬프트→v4 서명을 같은 자료에서 계산해야 한다.**

그렇게 고쳐도 최신 온라인 근거·사용자 조건이 다르면 사전 의견이 거절되는 것이 정상이다. 정상 운영 화면의 조회 성공 시각·근거를 임의로 복제하거나 전체 서명을 좌표-only로 완화해서 fallback 범위를 넓히면 안 된다. 0.3km 거리 조건은 정확한 contextKey 일치 후 적용되는 추가 제한이다(`llmClient.ts:112–117`).

README:90 및 AGENTS의 “v4와 전체 평가조건·근거 일치” 원칙은 현재 소비 코드와 맞다. 그러나 생성 스크립트가 현 input을 만들지 못하고 있으므로 도구 사용 안내만으로 사용 가능한 생성본을 보증할 수 없다. RUNNING:31의 사전 생성 타입 검사 설명도 실제 생성·호환성 검사를 뜻하지 않는다. README의 서버 무료 모델 fallback 설명과 달리 이 도구는 설정한 단일 model만 보낸다. 운영 모델 변수 `LLM_MODEL`과 수동 변수 `OPENROUTER_MODEL`의 차이는 문서대로다.

## 권고하는 최소 변경과 회귀 인계

총괄이 수동 도구를 유지·재사용할 필요를 결정한 뒤 새 실행자에게 맡긴다. 이번 감사에서 수정·실행 승인을 추가로 요청하거나 제품 범위를 늘리지 않았다. 현재 운영 AI 복구는 별도 N04 관측에 따라 처리한다.

1. **실행 전 안전 경계:** 키·모델·fixture·출력 대상의 사전 점검을 요청보다 먼저 수행한다. 무료 식별자 허용 목록을 적용하고 원시 모델·키·예외·응답을 로그에 출력하지 않는다. 허용한 코드·HTTP status·검증된 fixture id 정도로 제한한다. 줄바꿈·빈 모델·알 수 없는 모델·빈/중복/잘못된 좌표 fixture를 거절한다. 환경값을 조회·교체하거나 새 키를 만드는 작업은 필요 없다.
2. **공유 가능한 수명·읽기 도구 검토:** `api/_http.ts`의 `Operation`, `boundedBytes`, `ApiError`, `isRecord`는 Node 전용 API가 없는 기존 순수 helper다. CLI가 이를 사용할 수 있는지 먼저 검토하여 같은 timeout/reader를 새로 복제하지 않는다. CLI의 SIGINT/SIGTERM을 parent signal로 연결하고 timer/listener/reader를 finally에서 정리한다. redirect는 `manual`+3xx 거절 또는 `error`로 막는다. JSON 전체 바이트 제한과 128KiB 메모 제한, 프롬프트 기존 크기 검사를 각각 적용한다. 불완전 응답 재시도만 정해진 총 예산 내에서 허용하고 인증·할당량·명시적 provider error를 구조 부족으로 재시도하지 않는다.
3. **허용 모델 공유의 범위:** 현 `FREE_MODELS`는 `api/generate.ts:8`의 비공개 상수이며 독립 순수 policy 모듈이 아니다. handler 전체를 CLI에서 가져오지 않는다. 단일 순수 model policy로 추출하면 중복을 줄일 수 있지만 검증된 runtime import에 변경이 생긴다. 총괄이 별도 범위를 수락하지 않으면 CLI의 제한 목록과 runtime 목록을 독립 검사로 대조하는 작은 수정으로 시작할 수 있다. runtime 라우팅·대체 모델·진단 코드를 자동 리팩터링하지 않는다.
4. **정확한 생성·내용 검수:** `landUseSource`를 계산 전에 input에 넣고 온라인 미조회는 null/미확인으로 남긴다. dataCenters 파일명 한 곳을 바로잡는다. 응답 shape·명시적 error·종결을 검증한 뒤 `parseMemo.complete && !error`, `buildMemoFacts`/`validateMemo`의 flag 0을 확인하고 저장한다. 검수 실패는 원문을 로그로 내보내지 않는다. 자연어 전체 정확성을 보장한다는 표현은 추가하지 않는다.
5. **출력 보존:** 두 파일을 즉시 순차 덮어쓰기 전에 모두 검증하고 staging한다. 기존본 보존·실패 복구 전략을 명시한다. 두 번의 rename만으로 두 파일의 원자성이 생기지는 않는다. 필요하면 검수 가능한 하나의 버전 산출물을 만들고 별도 동기화 단계에서 게시하는 더 작은 계약을 선택한다. 승인 없이 원래 파일을 삭제하거나 생성하지 않는다. checkpoint/추가 재시도 기능은 필요한 근거가 없으면 넣지 않는다.
6. **문서:** 키를 명령문에 넣는 예시를 제거하고, 직접 외부 호출·정확한 fixture 한정·생성 후 내용 검수·출력 보존 절차를 명시한다. 생성물이 현재 번들에 없다는 상태와 실제 생성 성공 여부를 구분한다. RUNNING 전체·발표·PDF를 무관하게 재작성할 필요는 없다.

최소 회귀는 E01–25의 계약을 사용하되 목적에 맞게 독립적으로 구현한다. 특히 다음을 수락 기준으로 고정한다: 금지 모델·raw 오류 비노출, HTTP200 error와 비문자 content의 고정 분류, 헤더/본문 stall·취소·redirect·크기 경계, 3개 fixture의 현재 input 동등성, 현재 검증기가 거절하는 숫자/주장·ERROR의 저장 금지, 빈/중복 id 사전 거절, 둘째 출력 실패 시 기존본 보존. 정상 구조·동일 v4·빈 응답 실패·생성 중 실패의 기존본 보존은 회귀 없이 유지한다. 실제 무료 모델 호출은 이 합성 감사의 후속 필수 시험으로 간주하지 않는다.

## 재현·검수·소유권 반환

- 기대값 고정 시각: `2026-09-22T00:32:37.715186+09:00`. 기대값 SHA-256: `2ade4478675e6f8667d410c027d58b92e0a76feed2d75d7c2b622b7ccd1081ed`.
- 원본 script: 6,390바이트, SHA-256 `8f232c3514739c6d897bed8d19baa374a41e4bc06a6dd26495c452f6a1763b40`.
- [source-manifest.json](../../../overnight/N07/source-manifest.json): 원본·문서·공개 번들 37개 해시. [pure-module-manifest.json](../../../overnight/N07/pure-module-manifest.json): 격리 로드한 순수 소스 15개 해시.
- VM은 원본 사본의 import.meta.dirname을 가상 경로로 치환하고 자동 main 실행을 수동 entry로 노출했다. 모든 fs·fetch·process.env·stdout/err·타이머는 합성 객체다. 재현기 자체의 실제 fs 쓰기는 N07 소유 폴더의 JSON 결과만 허용한다. 원본 스크립트를 직접 실행하지 않는다.
- 재현: 이 작업 루트에서 `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin/node work/overnight/N07/audit.cjs`. 실제 환경변수 설정은 필요 없다. 관련 설치는 기존 TypeScript만 사용했다.
- 첫 harness 시도는 host/VM Promise 경계 대기 오류로 중단됐다. 두 번째는 25개 실행 후 E23에서 전체 canary만 찾는 자체 검사의 누락을 발견했다. 기대값은 그대로 두고 잘린 CANARY도 판정하도록 고쳤다. 초기 결과는 [results-initial-assertion-review.json](../../../overnight/N07/results-initial-assertion-review.json)에 보존했고, 최종 결과는 6/19다. 이는 제품 수정을 통해 통과시킨 결과가 아니다. [run-history.json](../../../overnight/N07/run-history.json)에 기록했다.
- 제품 `git diff -- prototype`은 0이고 원래 두 출력 파일은 계속 없다. 전체 제품 테스트·E2E·PDF·빌드는 변경이 없어 반복하지 않았다. 총괄의 상태문서 동시 갱신은 이 실행자의 변경으로 세지 않는다.

최종 자체 검수는 [self-review.json](../../../overnight/N07/self-review.json), 소유 파일의 바이트·SHA-256은 [owned-manifest.json](../../../overnight/N07/owned-manifest.json)에 기록한다. manifest 자신의 해시는 순환을 피하기 위해 목록에서 제외한다. **소유 범위는 이 문서와 작업 루트 `work/overnight/N07/`뿐이다. 감사 완료 후 편집을 중지하고 총괄에게 반환한다.** 구현은 총괄의 범위 결정과 새 실행자의 인계 후 수행한다.
