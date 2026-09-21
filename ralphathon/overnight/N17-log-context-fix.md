# N17 — 예외 재귀의 민감 문맥 전달 수정

2026-09-22 01:52–01:55 KST. 오전 09:00까지 후속 작업과 10:00 하드 마감을 유지한다. N17 범위만 완료했으며 전체 후속 작업 완료나 실제 로그 내보내기 수락을 뜻하지 않는다. 총괄은 이 실행자의 실제 Astra/xhigh를 세션 메타데이터로 확인했다고 통보했다. 실행자는 모델 전환·하위 위임·전역 설정 변경을 하지 않았다.

**N16 F01의 두 예외 재귀 호출에 상위 `sensitive`를 전달했다.** N15 원본을 보존하고 [N17 생성기](../../../overnight/N17/build_submission.py)와 [감사기](../../../overnight/N17/audit_submission.py)에 복사했다. 생성기의 94행 KEEP 메타데이터 재귀와 105행 type 없는 일반 message 재귀에 인자 하나씩만 추가했다. 추가 변경은 재검사 결과와 독립 감사 보고서를 N17 경로에 저장하도록 하는 진단 경로 두 곳이다. [생성기 diff](../../../overnight/N17/build_submission.py.diff), [감사기 diff](../../../overnight/N17/audit_submission.py.diff), [정확한 치환 기록](../../../overnight/N17/changes.json)을 남겼다.

일반 로그의 공개 ID·사용자 본문·업무 데이터의 0/false/null은 유지한다. 민감 키 아래 객체의 KEEP 필드도 상위 민감 문맥을 적용하므로 `cookie` 아래 `type`과 `id`는 가린다. 일반 추론 이벤트의 type·연결 ID는 계속 보존하고 본문은 가린다. 기존 null·빈 문자열·정확한 환경참조·전체 유효 WITHHELD 표지 계약과 오전 09시 전 내보내기 차단은 그대로다. 감사 로직·출력 묶음 구조·정책 문구는 변경하지 않았다.

## 재현과 실제 진입점 확인

| 검증 묶음 | 결과 | 해석 |
|---|---|---|
| N16 독립 하니스 경로 사본 | 44/44 통과 | 이전 40통과·4실패가 모두 통과. 4실패는 두 분기의 단위·전체 실행 중복 재현이었다. |
| N15 최종 회귀 하니스 경로 사본 | 89/89 통과 | 일반 본문/ID, 민감 스칼라, 추론, 원본·사본·row-map·ZIP 변조 검사 포함 |
| N15 다중 세션 하니스 경로 사본 | 11/11 통과 | 2세션 10행, 원문 해시, 순서·기존 cutoff 보호 |
| 명시적으로 재구성한 환경참조 문자열 | 4/4 통과 | 원래 N15 4개 입력 소스는 보존돼 있지 않아 같은 입력 재실행이라고 주장하지 않음 |
| N16 감사기 실제 main | 정상 0 / 중복행 변조 1 / 복원 0 | 실제 main 진입점의 종료 코드와 감사 상태 확인 |
| 생성된 N16 묶음별 감사기 실제 main | 3/3 exit 0 | 정상 3세션 21행, 수정 대상 두 가지 각 1세션 2행 |

하니스는 [N16 audit.py](../../../overnight/N17/audit.py), [N16 cli-check.py](../../../overnight/N17/cli-check.py), [N15 regression.py](../../../overnight/N17/regression.py), [N15 multisession.py](../../../overnight/N17/multisession.py)에 복사했다. 도구를 읽고 복사하는 경로만 N17로 바꿨고 테스트 입력·판정식·기대값은 바꾸지 않았다. 각 `.adaptation.diff`와 원본/사본 해시가 [changes.json](../../../overnight/N17/changes.json)에 있다. [N16 기대값 사본](../../../overnight/N17/N16-expectations-unchanged.json)은 원본과 바이트가 같다. 따라서 이번 재실행을 새로운 독립 감사로 표현하지 않으며, 총괄의 후속 독립 검수가 남아 있다.

[N16 결과](../../../overnight/N17/results.json), [89개 결과](../../../overnight/N17/final-results.json), [11개 결과](../../../overnight/N17/multisession-final-results.json), [환경참조 4개](../../../overnight/N17/literal-reference-results.json), [CLI 결과](../../../overnight/N17/cli-results.json)를 보존했다. 검사 묶음은 서로 겹치는 로그 도구 검증이며 제품의 789개 검사에 더하지 않는다. 제품 검사는 새로 실행하지 않았다.

N16 하니스의 `syntheticExportsCompleted: 1`은 기존 코드에 하드코딩돼 있다. 경로만 바꾸는 원칙에 따라 이를 조용히 고치지 않았다. 실제 관측은 **동 하니스에서 3회 합성 내보내기 모두 완료**다. [별도 실제 관측](../../../overnight/N17/repaired-export-observation.json)은 세 묶음 각각의 manifest·완전한 JSONL·ZIP 바이트/CRC·감사 exit 0을 확인한다. 전체 N17 실행에서 완료한 합성 export는 N16의 3회와 N15 하니스의 각 1회로 5회다. 감사 호출 수와 export 생성 수를 구분한다.

수정 대상 두 사례에서는 합성 미가림 값이 JSONL에 남지 않았고 완전한 2행 및 manifest·ZIP이 생성됐다. message 값, cookie 아래 type/id 및 추론 본문 가림과 공개 call ID 보존을 별도 확인했다. 재검사 실패 파일도 없다. 이는 **두 유효 합성 fixture의 기존 부분 후보 문제 해결**이며, 다른 모든 종류의 실패에서 부분 파일이 남지 않는 원자적 export를 보장하지 않는다. 생성기 시계는 N17 sandbox 안에서만 메모리로 09시 이후로 바꿨다. 실제 도구의 시간 가드는 수정하지 않았다.

## 보존과 한계

[실행 전 보존 검사](../../../overnight/N17/source-preservation-before.json)와 [실행 후 보존 검사](../../../overnight/N17/source-preservation-after.json)에서 N15의 161개와 N16의 45개 소유 파일 크기·SHA-256이 모두 원래 manifest와 일치했다. 두 원본 manifest 자체 해시도 전후 같았다. [최종 검증](../../../overnight/N17/final-verification.json)은 선언된 네 치환을 되돌리면 N15 두 도구 원문과 정확히 같고, 세 sandbox에서 사용한 도구가 인계본과 일치함을 확인한다.

N16 I01의 변환표 event 해시 의미 검증은 범위 밖이다. 감사기는 `transformations.json`의 ZIP·로컬 바이트 일치를 확인하지만 모든 event 해시를 원문 값과 독립적으로 연결하지는 않는다. 이 보장 한계를 고치거나 통과로 승격하지 않았다. 해시 선언과 모든 파일을 함께 바꾼 공격의 인증이나 모든 비밀 유형·미래 스키마 부재를 보장하지 않는다.

실제 세션과 실제 제출 사본 읽기, 실제 export, 실제 `outputs/` 쓰기, 네트워크 요청, 설치, Git 변경, 제품 코드·상태 문서 변경은 모두 하지 않았다. 합성 자료는 N17 소유 sandbox 안에만 있다. 편집을 중지하고 [소유 manifest](../../../overnight/N17/owned-manifest.json)에 ROOT 상대 경로·바이트·SHA-256으로 봉인한다. 실제 export는 총괄 검토와 새로운 독립 감사 수락 전까지 보류한다.
