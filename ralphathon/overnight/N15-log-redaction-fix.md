# N15 — 로그 제출본 마스킹·무결성 감사 수정

2026-09-22 01:36–01:44 KST. 최소 계속 시각 09:00, 하드 마감 10:00은 유지한다. 이 문서는 N15의 제한된 구현 인계이며 야간 후속 전체 완료가 아니다. 총괄이 지정한 Astra/xhigh 작업을 수행했고 하위 위임·전역 모델 변경은 하지 않았다. 실제 실행 모델 확인은 총괄의 세션 메타데이터 기록을 따른다.

**N14의 F01/F02/F03을 별도 N15 경로에서 수정했다.** 고정 합성 회귀 89개, 추가 다중 세션 검사 11개, 환경참조 문자열 검사 4개가 최종 코드에서 통과했다. 독립 N16 검수와 총괄 수락은 아직 전이며 실제 로그 내보내기는 수행하지 않았다.

## 수정 범위와 보존

- 새 생성기: [build_submission.py](../../../overnight/N15/build_submission.py)
- 새 독립 감사기: [audit_submission.py](../../../overnight/N15/audit_submission.py)
- 합성 회귀: [regression.py](../../../overnight/N15/regression.py), [multisession.py](../../../overnight/N15/multisession.py)

N13와 기존 `work/logs`의 생성기·감사기 4파일은 읽기 전용으로 사용했고 시작/종료 크기와 SHA-256이 일치했다. 제품 코드, 상태 문서, N12 후보, 기존 outputs, 실제 원시 세션·제출 사본, 계정·설정·비밀키를 수정하거나 실제 세션 본문을 읽지 않았다. 기존 outputs의 바이트 보존을 N15가 직접 전수 해시 검사했다는 뜻은 아니다. 그 범위는 총괄의 별도 검수에 남긴다. 네트워크·설치·커밋·푸시·배포도 없다.

새 스크립트의 ROOT는 자신의 위치 `parents[3]`로 확인했다. 실제 출력 경로는 기존 N13 계획대로 `outputs/overnight-20260922/session-logs/<새 날짜 label>`이며 09:00 전 차단과 기존 cutoff 폴더 재사용 거절을 유지한다. 감사 결과와 실패 재검사 위치는 각각 `work/overnight/N15/log-independent-audit.json`, `rescan-findings.json`이다. 합성 하니스는 스크립트를 자기 sandbox에 복사하고 시계만 메모리에서 바꿨다. 실제 ROOT 출력에 생성하지 않았다.

## F01 — 민감 필드 문맥과 원래 값 추적

`api_key`, `access_token`, `refresh_token`, `client_secret`, `authorization`, `cookie`, `set-cookie`, `password`, `connection_token`, `token`, `secret` 및 대소문자·하이픈/밑줄 변형을 구조적으로 인식한다. 민감 키 문맥을 배열·객체의 값으로 전달하며, 문자열 안 JSON을 여러 번 파싱하는 경우에도 같은 처리를 적용한다. 생성기의 `walk`와 `scan`, 생성기를 import하지 않는 독립 감사기가 각각 이 문맥을 확인한다.

민감 키 아래 **null·빈 문자열·정확히 일치하는 환경변수 참조**만 보존한다. 환경 참조는 `${NAME}`, `$NAME`, `process.env.NAME`, `import.meta.env.NAME` 및 해당 두 객체의 정적인 문자열 대괄호 참조다. 이름은 식별자 형식이며, 뒤에 다른 문자열이 붙거나 연산식인 경우는 예외가 아니다. 환경변수 값을 조회하거나 코드를 실행하지 않는다.

숫자·불리언도 `password:123456`처럼 자격값일 수 있어 민감 키 아래에서는 가린다. 일반 업무 데이터의 0·false·null과 일반 `summary`·`instructions`·domain 필드는 보존한다. 이 선택은 비밀이 아닌 민감 필드 설정까지 가릴 수 있다. 모두 보존하는 대안은 가독성이 높지만 숫자 자격값을 놓칠 수 있어 채택하지 않았다.

첫 고정 하니스는 민감 0/false도 보존하는 가정이었다. 이후 총괄의 명시적 보완 지시에 따라 그 기대값을 개정하고 숫자·불리언 6개 사례를 추가했다. [원래 기대값](../../../overnight/N15/expectations.json), [개정 기록](../../../overnight/N15/expectations-policy-v2.json), 원래 하니스와 baseline 결과를 모두 남겼다. 실패를 숨기려고 원래 결과를 바꾸지 않았다.

표지는 원래 **파싱된 값**을 기준으로 만든다. 문자열은 디코딩된 UTF-8 값의 길이·SHA-256, 비문자열 스칼라는 compact JSON 바이트의 길이·SHA-256을 기록한다. 원시 JSON의 따옴표·이스케이프·개행을 포함한 정확한 행 바이트는 별도 row-map 해시로 추적한다. 한글·다중 JSON 문자열·숫자·불리언과 토큰 패턴 중첩을 검사해, 이미 만든 표지의 해시를 원래 값 해시로 기록하지 않는지 확인했다.

## F02 — 명시적인 추론 이벤트

`agent_reasoning`을 기존 `Reasoning`/`reasoning`, compaction, analysis/reasoning 채널, system/developer 역할 본문과 함께 처리한다. type·ID·호출 연결·시각 등 메타데이터는 유지한다. 내부 본문이 남아 있으면 생성기 재검사와 독립 감사가 각각 거절한다. 일반 `summary`·`instructions` 필드 전체를 가리는 규칙으로 확대하지 않았다.

N14가 인용한 총괄의 25세션 이벤트 메타데이터에서 `agent_reasoning`은 0건이었다. 이 형식의 실제 현재 노출을 확인했다는 뜻이 아니다. N15는 실제 세션 본문을 읽지 않았다.

## F03 — 선언된 해시·행 연결·ZIP 집합 검증

독립 감사는 다음을 별도로 확인하며 실패 시 값 없이 위치·고정 오류 종류를 기록하고 비정상 종료한다.

- 각 원본과 사본의 실제 바이트 크기·SHA-256, 원본의 마지막 완전한 개행 경계와 제외 tail 길이.
- 모든 원본/사본 행의 개행 포함 바이트 해시. CRLF와 LF 차이도 해시에 반영한다.
- manifest 세션 순서에 따른 row-map의 정확한 세션·행 번호·ordinal·시각·행 해시. 중복·누락·순서 변경·다른 세션 행 삽입과 추가 필드를 거절한다.
- 원본/사본 주요 연결 ID, 세션의 root/직계 parent 관계, turn context의 model·effort·turn ID와 주요 item ID.
- manifest의 전체 세션·행·원본/사본 바이트 합계.
- 예상 파일 집합과 실제 폴더·ZIP 집합. ZIP 중복/누락/추가 항목, 파일 크기·해시·CRC 불일치를 거절한다.

사본과 ZIP을 함께 바꾸면서 manifest/row-map 선언을 그대로 둔 N14 방식의 반례는 이제 실패한다. 선언 해시를 갱신해도 민감 값·agent_reasoning 본문이 남은 합성 사례는 독립 내용 검사에서 실패했다. **모든 파일과 모든 선언을 함께 교체한 공격까지 인증하는 전자서명은 아니다.**

## 검증 근거와 한계

[초기 baseline](../../../overnight/N15/baseline-results.json)은 83개 중 14통과·69실패, 정책 개정 후 [baseline](../../../overnight/N15/baseline-policy-v2-results.json)은 89개 중 14통과·75실패였다. [최종 회귀](../../../overnight/N15/final-results.json)는 89/89, [최종 다중 세션 검사](../../../overnight/N15/multisession-final-results.json)는 11/11, [자체 검수](../../../overnight/N15/self-review.json)의 환경참조 문자열 사례는 4/4다. 이는 겹치는 단위·파이프라인 검사 묶음이며 제품의 789개 회귀검사와 합산하지 않는다. 기존 생성기 self-test 10항목도 유지해 통과했고, 해당 묶음은 89개 회귀 안에 이미 포함된다.

최초 baseline 하니스는 예상한 ZIP 추가 항목 거절이 `FileNotFoundError`로 끝나는 경우를 수집하지 못해 중단됐다. 하니스의 예외 수집만 고쳐 재실행했으며 기대값은 유지했다. 중단 sandbox는 별도로 보존했다. 이는 제품 결함 수에 더하지 않는다. 개정 전후 합성 export 시도는 총 7개 sandbox에 남아 있고, 마지막 두 묶음은 1세션 6행 및 2세션 10행이다. 실제 원시 세션 읽기·실제 export·실제 outputs 쓰기는 모두 0이다.

선택한 키·패턴과 명시적 추론 형식에 대한 검증이다. 모든 가능한 비밀 형식, 사내 사실, 임의의 미래 로그 스키마를 보장하지 않는다. 과거 실제 로그의 유출이나 변조를 확인한 것도 아니다. 실제 오전 자료는 새 N16 독립 검수와 총괄 수락 후 총괄만 새 cutoff로 내보내고 감사해야 한다.

소유 파일은 [owned-manifest.json](../../../overnight/N15/owned-manifest.json)에 ROOT 상대 경로·크기·SHA-256으로 봉인한다. manifest 자신은 목록에서 제외한다. 봉인 후 편집을 중지하고 다음 독립 검수로 인계한다.
