# 보고서 단계 총괄 검수

2026-09-21. 기준 HEAD 605bddb의 후속 작업 트리.

## 독립 확인

- 실제 diff와 `viewModel.ts`, 체크리스트, MemoPanel, ChecklistReport, CompareDialog, ReviewWorkspace를 검토했다. 용도지역은 engine evidence에서 전달되고 MemoPanel의 같은 rows 배열이 AI 서명·화면·인쇄에 전달된다. 산식·감점·점수 계산을 복제하지 않는다.
- `completedReportMemo`는 done·complete·현재 서명·오류 없음 조건을 통과한 AI만 전달한다. 기본 보고서는 AI 요청 없이 모델을 구성한다.
- 18행·출처 경계 테스트와 후보별 동작 ReactDOM 테스트가 무엇을 검증하는지 소스를 확인했다. 초기에 전달된 200개 테스트 결과만으로 실제 브라우저 완료를 판단하지 않았다.
- 예약 rAF의 cleanup 누락과 일반 후보 복원 시 보고서 요청이 남는 경계를 발견해 `report_focus_hardening`에 분리 위임했다. 최종 새 18개 테스트가 수정 전 11실패/7통과를 재현했고, 보완 후 22파일 218개 테스트와 타입·린트·build exit 0을 실제 로그로 확인했다. 후보 1 보고서 요청에서 후보 2 조건 수정 후 다시 후보 1로 돌아오는 경계까지 포함한다. 이 테스트는 지도/온라인 응답을 mock한 DOM 전환 검사이지 실제 브라우저 검사와 같지 않다.
- 보완은 요청 site/pin 일치, report DOM 연결·open 확인, layout-effect cleanup, home/새 위치/일반 후보 복원/제거 시 요청 초기화를 적용한다. 실제 데이터/계산 변경이 없어 이전 데이터 검증을 이유 없이 반복하지 않았다.
- 원격 `prototype`를 다시 fetch했으며 현재 HEAD에 없는 추가 원격 커밋은 없었다.

## 남은 필수 검수

지정 브라우저 연결이 policy 로딩 오류/timeout을 반환해 이번 변경의 실제 390/768/1440px·키보드·후보별 보고서 화면 검수는 아직 못 했다. 시험 글꼴 PDF는 별도 검증했지만 제품의 A4 PDF 생성·다운로드·모든 페이지 검수는 다음 구현 단계다. 이번 커밋을 전체 완료나 배포 완료로 표시하지 않는다.
