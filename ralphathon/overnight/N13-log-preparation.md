# N13 — 야간 로그 개정 생성 준비

2026-09-22T01:24:02.017115+09:00. 실제 새 제출본은 아직 생성하지 않았다. 오전9시이후 새 cutoff에서 수집한다. 사용자 요청에 따른 야간 후속 중 준비 단계다.

기존 검수된 `work/logs/build_submission.py`의 `Transformer`, `scan`, `self_test`, JSON/해시 helper는 AST가 동일하다. 이전 `audit_submission.py`의 `sig`, `audit` 함수도 동일하다. 변경은 새 출력 경로,9시전 생성 차단, 날짜형 label 검증, 도움말용 자체검수 분기, 새 감사 결과 경로와 적용대상 제한이다. 10개 이름의 합성 selfcheck가 pass를 반환했고,9시전 실제 생성 실행은 exit2로 막혔으며 새 outputs폴더를 만들지 않았다.

- 새 생성기: `work/overnight/N13/build_submission.py`. `--self-test`는 원시세션·계정·기존출력에 접근하지 않는다.
- 새 감사기: `work/overnight/N13/audit_submission.py`. 새야간 session-logs 디렉터리만 수락하며 이전 감사파일을 덮어쓰지 않는다.
- 오전 실행 순서: 기존 `work/logs/collect_sources.py`로 실제 root/직계실행자 메타데이터·완료 원본을 수집한 뒤 새 생성기, 새 감사기를 순서대로 실행한다. 중간값·로그 자체는 터미널에 출력하지 않고 집계·위치만 확인한다.
- 새 전달 위치: `outputs/overnight-20260922/session-logs/`. 이전 `outputs/session-logs/`의 고정이름ZIP/manifest/정책/안내는 그대로 보존한다.
- cutoff는 파일별 수집시각의 완전한행까지만 포함한다. root의 그이후 대화와 최종응답은 포함되지 않는다. 세션수·행수·변환수·ZIP해시는 실제수집 전에는 미확정이다.

AST 동일성과 합성 자체검수는 새 원문 전체의 비밀값 부재를 보증하지 않는다. 오전 실제 export에서 전행 연결·원본/사본SHA·마스킹재검사·중첩JSON·ZIP재읽기/CRC를 확인한 다음 독립 검수 결과와 연결한다. 원시로그는Git/일반전달ZIP에 넣지 않고 별도 로컬 원본으로 보존한다. 대회 제출·업로드는 수행하지 않는다.

근거: [준비검수](../../../overnight/N13/preparation-verification.json). 새로그검수와최종 cutoff는pending이다.
