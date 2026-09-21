# N20 — 오전 검증 도구의 네 결함군 보완

2026-09-22 02:20 KST 전후 작성. **실제 오전 외부 관측은 0회이며 총괄 독립 수락 전 준비본이다.** N19의 F01–F04는 검증 도구의 누락이므로 제품 코드는 수정하지 않았다. 제품 789개 검사는 다시 실행하거나 새 도구 검사에 합산하지 않았다.

총괄이 지정한 모델을 유지했다. 복잡한 배포·시간·본문 판정의 정확성, 기존 제품 계약과의 일치, 도구 검증 가능성을 속도·비용보다 우선했다. 이 작업 안에서 모델 전환·추가 에이전트 위임은 없었다. 루트·저장소 AGENTS, G041, 원문 목표, 런북·상태·인계, N19 감사 및 총괄의 고정 12요구사항을 적용했다. 원래 저장소 AGENTS와 기존 소스/증거는 보존했다.

## 수정 범위

`work/overnight/N20/`에 N06 v4 실행 도구 7개를 복사한 뒤 수정했다. 추가 공통 guard와 실제 제품 파서 호출 브리지만 넣었다. 실제 관측 결과는 아직 없는 `N20/morning/`에 앞으로 생성되며 준비·시험 자료와 분리한다.

| N19 결함 | N20 변경 | 판정 경계 |
|---|---|---|
| F01 별칭과 요청 출처 연결 | `guard.py`가 exact-SHA release를 확인하고 각 관측 묶음 전후 READY 별칭 ID/URL을 대조한다. release 수집 자체에도 전후 확인을 적용했다. | 변경·후검사 실패는 `accepted=false`; 관측 ID/URL/SHA는 null, 요청한 source SHA만 별도 보존. 같은 전후 상태도 시간창 상관관계이며 원자적 요청 증명이 아니다. |
| F02 하한만 있는 시각 검사 | 외부 CLI·HTTP·리다이렉트·브라우저 요청 시작마다 09≤now<10. release≤관측≤현재와 실제 그룹 범위 및 timezone을 수락기에서 검사한다. 각 실패/중단 시도를 보존한다. | 관측 시각 허용 오차 없음. 정각 OS 강제 종료 보장은 아님. 기한 종료로 후검사를 못 하면 미수락이다. |
| F03 queried/재해 본문 약한 검사 | 제품의 `parseGeocodeHit`, `parseZoningLookup`, `parseRestrictionLookup(...,500)`, `parseDisasterLookup`를 직접 호출한다. 저장 본문 bytes/SHA/JSON도 대조한다. | 정상 false/null/0건을 유지한다. zoning/restrictions/disaster incomplete는 기본 검사 미완료로 분리한다. |
| F04 주변 후보 계약 누락 | 제품 `parseNearbySites`를 직접 호출해 ID, 유한 숫자, 환산값, 좌표, ring, 개수 등을 같은 기준으로 검사한다. | 정상 0후보도 허용한다. truncated는 유효한 부분 탐색이며 모두 조사했다는 뜻이 아니다. |

`fetchedAt`는 관측 시각과 분리한다. 실제 서버 캐시 상한은 geocode/zoning/restrictions/disaster 3,600초, nearby 1,800초다. 수신 시각에 대한 age를 기록하며 제품 파서의 미래 +60초 허용을 유지한다. 09시 이전 캐시도 유효 범위면 수락한다. 화면 evidence TTL 10분과 이 서버 캐시 상한을 혼동하지 않는다. 파서 5개, 공통/전이 의존 5개, 서버 핸들러 5개의 bytes/SHA-256은 `product-parser-basis.json`에 남겼다. 새 스키마를 Python에 복제하지 않았다. Node24와 저장소 기존 tsx를 사용했으며 설치하지 않았다.

기존 16 UI 흐름, 기본 API 6개+잘못된 입력 2개, 정적 파일 34개는 유지한다. 16 UI는 이름이 있는 13개와 missing-resource 3개이며 실제 브라우저 실행은 오전의 별도 관측이다. 정적 수집은 파일별 기한 확인을 위해 순차 실행한다. `localBuildHead`는 현재 HEAD 관측일 뿐 dist를 그 HEAD로 재빌드한 증거가 아니라는 한계를 README에 유지했다.

짧은 AI는 별도 1요청·자동 재시도 0을 유지한다. nonempty 또는 60억원 문자열만으로 `reviewedSemanticSuccess`·`full18ItemSuccess`를 바꾸지 않아 두 값은 계속 null이다. 한국어 계산과 미확인 문장의 직접 검수, 전체18항목/UI/부록 검수는 따로 필요하다. 전송 예외는 `results.json`·실패 기록·그룹 기록을 보존하고, 진단기는 상관관계를 확인할 응답이 없으면 로그 조회/재추론 없이 미확인을 기록한다. 별칭 후검사가 실패한 응답도 진단 귀속을 주장하지 않는다.

## 검증 결과와 기대값 경계

`offline-results.json`의 최종 검사는 **39개 고정 사례**다. N19 원문 16례를 그대로 읽어 새 도구의 의존만 대체했고, 추가 통제 23례를 검사했다. 원래 N19 입력·기대값·결과를 수정하지 않았다.

- N19 13개 기본 사례 중 정상 명시적 재해 false는 계속 수락한다. 미래 관측, release 이전 관측, 10시 이후, 과거/미래 fetchedAt, 조회집합 축소, found 누락, null hit, bool 숫자, 빈 ring, ID 누락은 거절한다. incomplete 거절도 유지한다.
- N19 짧은 AI 3례에서 alias가 이미 바뀐 경우와 10시 이후 시작은 mock 추론 요청 0회다. 잘못된 확정 문장이 들어 있는 nonempty+60억원 사례도 의미/18항목 상태는 null이다.
- 새 23례는 09시 전의 정상 캐시, canonical 과거 시각, 캐시 1초 초과, 미래 +60/+61초, 정상 zoning 0건/nearby 0후보, 유효한 불완전 규제 응답, alias 전/후 변경 및 후검사 실패, 기한 도중 도달, 전송 실패와 진단/중복시도 거절, exact release mock CLI, 정적34 모의비교와 중단, naive/그룹 밖 관측을 포함한다.
- `browser-offline-results.json`은 실제 브라우저 대신 mock route로 실제 요청 guard **4경계**를 확인했고 기존 **13+3 흐름** 문자열 보존을 대조했다.
- 최종 HTTP guard/진단 시각 연결은 `focused-guard-results.json` **6개 집중 검사**로 확인했다. 남은 시간으로 timeout을 제한하는지, 정각 HTTP/리다이렉트를 차단하는지, 진단 CLI가 창 안에서만 시작하고 정각에는 실패 기록만 남기는지를 확인했다.
- 실제 외부 명령·네트워크·브라우저 실행·AI 추론은 전부 0회다. Python socket/subprocess/HTTP는 mock 또는 금지 함수이며, 실제로 실행한 Node+tsx는 로컬 제품 파서만 읽고 네트워크 금지 preload를 적용했다. 제품 테스트·설정·git·제출본·원시 세션 로그는 건드리지 않았다.

시험 적응은 N20의 OBS 경로·시계·CLI·HTTP를 mock으로 바꾼 것이며, N19 수집기 소스를 결과에 맞게 변형한 것이 아니다. 과거 UI/정적 fixture는 유효 그룹/시각을 갖는 **합성 통제**로만 사용했다. N19에서 오수락하던 반례의 기대값이 거절로 바뀐 것은 이번 수정의 목적이다. 정상 0건을 허용한 것은 총괄의 명시적 보충 기준과 제품 파서 계약을 반영한 변경이다.

처음 기본 Python 실행은 PIL import 단계에서 실패하여 관측/검사 사례 실행 전 종료했다. 이미 있는 번들 Python으로 전환했고 설치하지 않았다. 중간 두 모의 실행 디렉터리는 보존했으며 최종 회귀 경로는 `offline-run-verified/`다. 마지막 변경인 공통 HTTP timeout 계산 표현과 진단 관측 시계 연결은 6개 집중 검사로 확인했다. Python AST 및 Node 구문 검사도 통과했다.

## 오전 인계와 남은 검수

실행 명령 전체와 한 줄씩 결과를 확인하는 절차는 `work/overnight/N20/README.md`에 있다. 핵심 순서는 **09시 이후 최종 SHA·제품 빌드 계보 확인 → verify_release → static → live_api → browser → accept_basic_checks → 직접 화면 검수 → 짧은 AI 1회 및 수동 의미 검수**다. AI 오류 진단은 같은 관측의 허용 필드만 조회하며 새 추론을 하지 않는다. 별도 전체18항목은 여기서 자동 시작하지 않는다.

실제 오전 release·34바이트·6API·16UI·스크린샷·AI는 아직 확인하지 않았다. 테스트 통과로 현재 운영 성공을 주장하지 않는다. 총괄은 별도 독립 감사 뒤 이 준비본을 수락해야 한다. 동일한 전후 alias 사이 내부 이동 가능성, dist 빌드 계보, 수동 AI 의미/18항목 검수, 정각 OS 종료 비보장은 남는 한계다.

N06의 원래 39파일(총괄이 나중에 추가한 `DO_NOT_RUN.md`는 원래 목록 밖), N19 소유 232파일 및 N19 manifest를 시작/종료 bytes/SHA로 대조한다. 확인 결과는 `input-preservation.json`이며 N20 자체는 보고서를 포함한 root-relative bytes/SHA `owned-manifest.json`으로 봉인한다. 봉인 후 편집을 중지한다. 실제 결과 출력·외부 호출·추가 제품 작업은 총괄에게 인계한다.
