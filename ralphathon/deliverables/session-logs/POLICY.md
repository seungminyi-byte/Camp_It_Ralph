# 실제 세션 제출 사본 정책

이 묶음은 실제 root와 parent_thread_id가 일치하는 직계 실행자 세션의 JSONL 사본이다. 합성 대화가 아니다. 원본 행 순서·시각·ordinal·type·session/id/call 연결 및 실제 사용자 요청·외부 설명·도구 행동·결과·실패를 유지한다. 각 행의 원본/사본 해시는 row-map.jsonl에서 연결된다.

원본은 로컬 work/logs/original/cutoffs/에 보존한다. 제출 JSONL에서 시스템/개발자 지침 본문은 hidden_instruction, 내부 추론은 internal_reasoning, 압축 내부문맥은 internal_context로 치환했다. 사용자 자신의 AGENTS·Goal 원문은 유지한다. 미디어는 media, 비밀 후보는 secret, 무관한 메모리 문맥은 unrelated_private_context, 필요 없는 이메일은 unrelated_personal_identifier로 구분한다. gAAAA 형태의 암호화 payload는 opaque_encrypted로 표식 처리하며 복호화하거나 읽었다고 주장하지 않는다. 각 표지는 원문 SHA-256·UTF-8 바이트 길이·종류·사유를 기록한다. transformations.json에는 값 없이 위치와 건수만 담는다. 큰 비미디어 도구 결과는 길이만으로 삭제하지 않는다.

문자열 안의 중첩 JSON도 파싱해 같은 규칙을 적용했다. provider-token/JWT/Bearer/민감 query/키·쿠키 대입/private-key와 큰 base64를 선별 검사했고 전체 사본을 재검사했다. 코드·테스트의 가짜 토큰도 후보로 가려질 수 있다. 모든 비밀 형식이나 사내 사실의 부재를 보장하지 않는다. 환경변수·키체인·.env·무관한 세션 본문을 읽지 않았다.

manifest의 cutoff는 수집을 시작한 시각이다. 각 파일은 해당 읽기 시점의 정확한 바이트 스냅샷이며 끝의 불완전 행이 있으면 그 길이를 기록한다. 실행 중 root/감사 에이전트의 뒤 사건과 root의 최종 응답은 아직 포함되지 않는다. root가 감사 에이전트 종료 후 재수집·재생성하면 더 늦은 cutoff 묶음을 만들 수 있다. 최종 제출 규격은 인증된 팀별 공지를 확인한 것이 아니며 대회 제출은 하지 않았다.
