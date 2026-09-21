# 보고서 흐름 인계

## 변경 지점

- `prototype/src/report/viewModel.ts`: 보고서가 사용하는 하나의 표현 모델. `MemoPanel`이 AI 서명에 사용한 `rows` 배열을 그대로 넘겨 화면·인쇄가 같은 18행 순서를 쓴다.
- `prototype/src/scoring/engine.ts`, `report/checklist.ts`: 용도지역 출력은 `result.evidence.zoning`의 status/detail만 사용한다. 유효 auto의 `zoning.name`은 engine detail에만 합친다.
- `ReviewWorkspace.tsx`: 보고서 CTA, inline details 상태, 후보 보고서 요청의 pin-id 대기·복원 후 스크롤/포커스, home·다른 지점·제거 시 요청 해제.
- `CompareDialog.tsx`: 후보별 보고서 보기/조건 수정/제거와 비교 우선순위 재배치.

## PDF 단계 연결 규칙

PDF 생성기는 `buildReportViewModel()`이 만든 model만 입력으로 받는다. `scoreSite()`나 `buildChecklist()`를 다시 호출하지 않는다. `completedReportMemo()`를 지난 완료·현재 AI만 전달하며, streaming/error/stopped/stale는 기본 보고서를 막지 않고 제외한다.

다운로드 구현은 D013에 따라 클릭 시에만 PDF/글꼴을 lazy import하고, 현재 route/site/model signature와 요청 token을 저장 직전에 대조해야 한다. 비교의 `onOpenReport`은 다운로드나 인쇄가 아니라 pin 복원 후 inline 보고서 열기만 한다.

## 검사 인계

상세 기록: `ralphathon/evidence/report-flow/RESULTS.md`.
