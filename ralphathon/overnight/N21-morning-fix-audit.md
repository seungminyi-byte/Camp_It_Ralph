# N21 — N20 오전 검증 수정본의 독립 감사

2026-09-22 02:26 KST 기준. **N20에는 저장 원문과 판정용 JSON의 타입 불일치를 오수락하는 잔여 결함 1군이 있다. 수정 후 해당 경계를 다시 검수해야 한다.** 신규 고정 사례 18개 중 15개가 기대와 일치했고, 동일 원인의 3개는 기대한 거절 대신 전체 수락됐다. 실제 오전 관측·외부 CLI·네트워크·브라우저 실행·AI 추론은 모두 0회다. 현재 운영 장애나 제품 파서 결함을 관측한 결과가 아니다.

## 범위와 방법

루트·저장소 AGENTS, 실행 런북·상태·인계·목표 원문, G042, N19/N20 보고서와 N20 README, 총괄의 `root-morning-fix-contract.json`을 적용했다. 지정된 모델을 유지했으며 N21 안에서 모델 전환·추가 에이전트 위임은 없었다. 계약의 정확성과 실제 파서 호출 가능성을 속도·비용보다 우선했다. 모델별 성능을 별도로 측정하지 않았다.

N20의 기존 39사례·브라우저 4경계·집중 6검사를 반복하지 않았다. `work/overnight/N21/expectations.json`에 **실행 전 18개 기대값을 고정**하고, 변경하지 않았다. 신규 16사례는 원본 `accept_basic_checks.main()`을 호출했다. 제품 Node/tsx 파서 브리지도 원본을 호출했으며 원문 대조 4번을 포함해 로컬 파서 프로세스는 20회다. 나머지 2사례는 원본 `browser_guard.mjs`의 실제 라우트 함수에 모의 요청과 변화하는 시계를 넣었다(총 모의 요청 4개).

- 수락기 입력은 N20의 정상 합성 통제 한 묶음을 N21 안에 복사하고 시험 변수만 바꿨다. UI 16개·정적 34개 항목은 기존 합성 통제이며 이번에 실제 화면이나 정적 바이트를 관측한 것이 아니다.
- C16에서는 실제 `live_api.main()`을 실행하고 HTTP 8개·별칭 확인 2개를 모의 응답으로 대체했다. 실운영 명령이나 요청은 실행하지 않았다.
- Python의 HTTP/socket 연결·허용되지 않은 subprocess는 금지했고, 허용한 실제 subprocess는 기존 Node+tsx 파서뿐이다. Node 네트워크는 N20의 금지 preload를 사용했다. 브라우저 검사도 같은 네트워크 금지 preload로 실행했다.
- OBS·시계·입출력 의존만 대체했으며 N20 실행기/파서 소스는 바꾸지 않았다. 시험 결과는 제품 789개 회귀검사, 기존 N20 검사, 실제 오전 성공 횟수에 더하지 않는다.
- 최초 입력 스냅샷은 N19 manifest의 개수 키가 달라 `KeyError: fileCount`로 중단됐다. 키 대신 실제 항목 수를 세어 원본 해시를 확인했다. N21 실행기의 괄호 한 개는 구문 사전검사에서 수정했으며 실제 사례 실행 전에 끝났다. 최종 사례 실행은 한 번이며 중간 결과를 지워 재실행하지 않았다.

## F01 — JSON 불리언과 숫자가 같은 원문으로 인정된다 (P2)

위치: `work/overnight/N20/accept_basic_checks.py:46–57`, 특히 **52행**, 이어지는 `parse_rows` 14행. 비교는 `json.loads(raw) == row['body']`이고, 실제 제품 파서에는 원문에서 읽은 객체 대신 `row['body']`를 보낸다. Python에서 `True == 1`, `False == 0`이므로 중첩 JSON 타입 차이가 가려진다.

| 사례 | 저장 원문 값 | 판정용 row 값 | 원문 직접 제품 파서 | N20 원문 일치/전체 수락 |
|---|---|---|---|---|
| C02 | nearby 첫 후보 `distanceKm: true` | `distanceKm: 1` | 거절 | true / true |
| C03 | disaster `found: 0` | `found: false` | 거절 | true / true |
| C04 | zoning `complete: 1` | `complete: true` | 거절 | true / true |

각 원문 파일의 bytes·SHA-256은 그 실제 원문과 일치하고, 나머지 배포·시각·응답 항목은 정상 통제로 유지했다. `bodyText`도 원문을 보존했다. 원문과 row의 **단일 타입 차이**만 있어도 `*-saved-body-integrity`, 해당 `*-product-parser`, 전체 `pass`가 모두 true가 된다. 같은 원문을 실제 제품 파서에 직접 넘긴 `raw-product-verdicts.json`에는 `parserAccepted=false`가 남는다.

최소 재현은 C02다. 정상 주변 후보의 거리를 숫자 1로 준비하고 저장 원문에서만 true로 바꾼다. 원문 bytes/SHA는 해당 바이트로 계산한다. 원문 파서는 거절하지만 N20 수락기는 row의 숫자 1을 파싱해 전체 수락한다. 재현 파일은 `work/overnight/N21/cases/raw-nearby-boolean-row-number/`의 `audit-result.json`, `raw-product-verdicts.json`, `morning/api/nearby-sites.txt`, `morning/api/results.json`, `morning/basic-acceptance.json`이다.

이는 모든 증거를 위조한 사람을 탐지하는 인증 요구가 아니다. N20이 명시적으로 약속한 **저장 원문 JSON과 판정용 JSON의 의미 일치** 검사가 한 필드 타입 불일치도 놓친다는 결과다. 그 불일치가 있는 산출물을 받으면 제품이 거절할 원문을 기본 API 성공으로 보고할 수 있다.

영향 범위도 한정한다. N20 `live_api.py:63–66`은 `json.loads(text)`를 그대로 row에 저장한다. C16에서 모의 HTTP 원문 `distanceKm=true`를 실제 수집기에 주면 row도 bool이고, 실제 수락기는 제품 파서 단계에서 거절했다. **정상 수집기가 true를 1로 자동 변환한다거나 현재 제품이 bool 거리를 수락한다는 주장은 아니다.** 현재 그대로 생성된 수집 결과는 이 재현처럼 저절로 불일치하지 않는다.

최소 보완 방향은 bytes/SHA로 확인한 원문 JSON을 제품 파서의 기준으로 사용하고, row와도 타입을 보존해 비교하는 것이다. 불리언/숫자는 분리하되 JSON 숫자 `1`과 `1.0`의 동등성, 키 순서·공백 차이는 과잉 거절하지 않아야 한다. C05/C06은 그 양성 통제로 모두 수락됐다. 이 감사에서는 수정하지 않았다.

## 나머지 고정 사례

| 사례 | 확인한 경계 | 실제 결과 |
|---|---|---|
| C01 | 원문·row 숫자 1 동일 | 수락 |
| C05–C06 | 숫자 표기 1.0/1, JSON 키 순서·공백 | 모두 수락 |
| C07 | browser 후확인의 배포 ID만 다른 경우 | browser 그룹 거절 |
| C08 | static 전확인의 URL만 다른 경우 | static 그룹 거절 |
| C09 | API보다 늦게 release 확인, browser/static은 이후 관측 | API 그룹만 거절 |
| C10 | API 후확인 시작이 관측 종료보다 이른 경우 | API 그룹 거절 |
| C11 | browser 요청이 오전 범위 안이지만 자체 그룹 밖인 경우 | browser 그룹 거절 |
| C12 | 동일 순간을 timezone -04:00으로 표시 | 수락 |
| C13 | 서버 캐시 나이가 정확히 3,600초/1,800초인 09시 이전 본문 | 모두 수락 |
| C14 | 캐시·zoning false/null/0건·disaster false/0건·nearby 0후보+truncated | 수락, nearby `complete=false,truncated=true` 유지 |
| C15 | 재해 hit가 있는 유효 부분 응답, 조회 실패·complete=false | 제품 파서 허용, 기본 complete 검사 거절 |
| C16 | 실제 모의 수집기로 받은 bool 거리 | 원문 타입 보존, 제품 파서 거절 |
| C17–C18 | 요청 사이 시계가 09:02→08:59:59.999 또는 09:59:59.999→10:00 이동 | 각 첫 요청 진행·다음 요청 차단 |

합계는 **수락기 16례 중 기대 일치 13 / 오수락 3**, **브라우저 경계 2례 중 일치 2**, 총 **18례 중 일치 15 / 잔여 결함 재현 3**이다. 브라우저 시계 시험은 `Date.now`만 대체했다. 차단 결정은 합성 시계로 검증했지만 차단 기록의 `new Date()`는 실제 실행 시각을 사용하므로 그 로그를 실관측 시각의 정확성 증거로 쓰지 않는다.

## 유지한 한계와 인계

N20의 같은 READY 별칭 ID/URL 전후 확인은 제한된 시간창의 상관관계다. 요청별 원자적 출처나 창 안의 별칭 변경 후 복원까지 증명하지 않는다. 그 공개된 한계를 새 결함으로 확대하지 않았다. AI는 이번에 재생하지 않았다. 기존 README/도구의 수동 의미 검수와 `reviewedSemanticSuccess=null`, `full18ItemSuccess=null` 경계를 유지하며 짧은 문자열을 18항목 성공으로 올리지 않는다.

N19 232개·N20 1,464개 선언 파일을 시작과 종료에 bytes/SHA-256으로 대조했고 입력 manifest 자체도 불변이다. N20 manifest SHA-256은 `2c144a5f6d6c79b6a14432370af4a14411314a3721c432a4c3e5e9a22f1d1a6c`다. 제품·N06/N19/N20·outputs·설정·git·원시 세션은 변경하지 않았다. N21 보고서와 `work/overnight/N21/`만 소유한다.

실행기 `audit_holdouts.py`, `browser_clock_holdouts.mjs`, 기대값 `expectations.json`, 결과 `acceptance-results.json`·`browser-clock-results.json`, 보존 확인 `input-preservation.json`, 봉인 `owned-manifest.json`을 총괄에 인계한다. N21은 수정 권한을 사용하지 않았으며 봉인 후 편집을 중지한다. 오전에 사용하기 전에 F01을 제한적으로 보완하고 새 독립 사례로 확인해야 한다.
