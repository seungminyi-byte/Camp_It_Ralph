# 보고서 포커스 예약 회귀 검증

2026-09-21 · 실행 담당 `report_focus_hardening` · Node v24.21.0 · 기존 작업 브랜치 `codex/ralphathon-complete-20260921`

AGENTS.md, GOAL.md, DECISIONS D013, REPORT-FLOW 인계를 읽고 적용했다. 이 작업의 제품 코드 변경은 `prototype/src/pages/ReviewWorkspace.tsx`에 한정한다. 착수 전 미커밋 변경을 보존했으며 계산·엔진·번들 데이터·보고서 내용은 수정하지 않았다.

## 수정 내용

- 보고서 후보 복원과 보고서 열기를 동일 React 갱신에 넣었다. 별도 후보 대기 상태와 중첩 rAF를 제거했다.
- 보고서 포커스 요청은 선택 객체와 후보 ID를 가진다. DOM 반영 뒤 active, reportOpen, 현재 선택, 후보 ID·존재를 검사하고 단일 rAF를 예약한다. layout effect cleanup으로 화면·후보·요청 변경 및 해제 때 예약을 취소한다.
- 포커스 대상은 해당 보고서 ref 안의 제목으로 제한한다. 실행 직전 연결 상태와 실제 details.open도 확인한다.
- 홈 이동은 render에서 비교창·보고서·포커스 요청을 초기화한다. 빠른 재진입 뒤 과거의 홈 정리 rAF가 새 창을 닫는 동작을 제거했다.
- 일반 후보 열기/조건 수정은 보고서·포커스 요청을 초기화한다. 새 지점, 제거, 수동 접기도 예약을 취소한다.

착수 직전 소스와의 한정 차이는 [workspace.patch](workspace.patch)다. Git HEAD 차이는 앞선 보고서 구현도 포함하므로 이 patch와 구분한다.

## 상태 전환 테스트와 재현

새 `prototype/src/pages/ReviewWorkspace.dom.test.tsx`는 ReactDOM root, 실제 ReviewWorkspace·CompareDialog·MemoPanel·계산 엔진을 사용한다. 네트워크 조회와 지도는 대체하고 선택/조건 입력 경계만 작은 테스트 컨트롤로 제공한다. rAF를 직접 진전시키고 DOM toggle 이벤트를 처리해 열린 보고서·현재 후보·복원 조건·document.activeElement·스크롤을 확인한다.

18개 사례: 현재 보고서 정상 열기, 후보·저장 조건 복원, 각 진입의 홈 이동, 빠른 홈 왕복 후 새 비교창 보존, 각 진입의 새 지점 선택, 첫 프레임 뒤 홈/지점/조건 수정 전환, 같은/다른 후보 조건 수정, 이미 열린 보고서에서 조건 수정, 다른 후보를 수정했다가 원래 후보로 복귀, 마지막 보고서 요청 우선, 후보 제거, 수동 접기, 해제 시 예약 취소.

같은 18개 테스트를 착수 직전 ReviewWorkspace 복사본에 적용하면 **11개 실패·7개 통과**한다. 특히 첫 프레임 후 숨겨진/다른 후보 보고서에 초점 이동, 같은 후보 조건 수정 중 보고서 열림, 다른 후보를 거쳐 돌아온 뒤 과거 요청 복원, 빠른 홈 왕복 후 새 비교창 닫힘을 재현한다. 원래 제품 파일을 덮어쓰지 않고 같은 폴더의 임시 모듈·테스트 사본으로 실행했으며 사본은 검사 직후 제거했다. [수정 전 재현 로그](baseline-regression.log)

## 최종 검사

| 검사 | 결과 | 기록 |
|---|---|---|
| 타입 검사 | 종료 코드 0 | [typecheck.log](typecheck.log) |
| 린트 | 종료 코드 0, 진단 없음 | [lint.log](lint.log) |
| 전체 Vitest | **22개 파일 · 218개 테스트 통과**; 새 18개 포함 | [tests.log](tests.log) |
| 프로덕션 빌드 | 종료 코드 0 | [build.log](build.log) |

명령은 저장소 기준 `npm --prefix prototype run typecheck`, `npm --prefix prototype run lint`, prototype 폴더의 `node node_modules/vitest/vitest.mjs run --reporter=verbose`, `npm --prefix prototype run build`다. 각 로그 끝에 실제 종료 코드를 저장했고 [checks.json](checks.json)에 취합했다. 계산·코드 데이터가 바뀌지 않아 이 한정 작업에서는 데이터 검증을 재실행하지 않았다.

소스 SHA-256:

- 착수 직전 ReviewWorkspace: `6BA154E483EFF294A6A52536DF6B4ADF5AB4C19B73DF2CEF620DA69BCCEC7146`
- 최종 ReviewWorkspace: `36CC2356400ED20558AF05B0D81F48C430A595796B255EB1BFCD90FA5BD03370`
- 최종 DOM 테스트: `7370C8E79B8E42F989689056CC89BC7FD479F1E3479B188E418D6216D83177DB`

## 남은 검증 경계

jsdom 검증은 실제 브라우저의 화면 배치·native dialog focus trap·스크롤 위치 검수를 대체하지 않는다. 총괄이 지정 Chrome 연결의 header-policy 오류/timeout을 보고했으며 이 담당은 브라우저를 제어하지 않았다. 실제 Chrome에서 후보 보고서→홈/새 후보/조건 수정과 키보드 이동은 다음 PDF 단계의 통합 검수에 남긴다. 커밋·푸시·배포는 수행하지 않았다.
