# 보고서 흐름·표시 정합성 검사

기준: 2026-09-21, 작업 브랜치 `codex/ralphathon-complete-20260921`, 시작 HEAD `605bddb`.

## 구현 범위

- `result.evidence`의 `zoning`을 용도지역 체크리스트 행과 보고서 입력조건의 유일한 상태·상세 원천으로 사용했다. 유효 자동조회일 때만 원본 `zoning.name`을 엔진 근거 상세에 보존하며, 수동·실패·불일치·출처 생략에는 조회 이름을 섞지 않는다.
- `report/viewModel.ts`가 현재 `ScoreResult`, 하나의 18행 checklist 배열, overview 앞 3개 issue/action, 완결·현재 AI만 받아 화면/인쇄 보고서에 전달한다. 일반 화면 렌더는 18행 불완전성으로 throw하지 않는다.
- 검토 요약 근처의 `보고서 보기`는 현재 화면 내 보고서 영역을 열고 제목으로 이동한다. AI는 보고서와 분리된 접힌 선택 영역이며 상태는 `MemoPanel` 한 곳에 있다. 기존 브라우저 인쇄는 유지했다.
- 비교 표의 각 후보 머리에는 보고서 보기·조건 수정·제거 행동을 두고, 이름 있는 키보드 포커스 가능 가로 스크롤 영역을 만들었다. 표는 참고점수보다 확인된 제약·미확인 조건·다음 행동을 먼저 보인다.
- 모바일에서는 분석 패널과 보고서 미리보기를 자연 문서 흐름으로 두어 중첩 미리보기 스크롤과 하단 고정 행동 영역 가림을 없앴다. 지도 캡션은 화면 방향을 가정하지 않는다.

## 자동 검사

| 명령 | 결과 |
| --- | --- |
| `npm --prefix prototype run typecheck` | 통과 |
| `npm --prefix prototype run lint` | 통과 (경고 0) |
| `(cd prototype && node node_modules/vitest/vitest.mjs run)` | 21 파일, 200 테스트 통과 |
| `python data-pack/scripts/validate_out.py` | 통과 |
| `npm --prefix prototype run build` | 통과 |

추가한 `viewModel.test.ts`는 manual/유효 auto/failed/mismatch/omitted의 zoning detail·verdict가 엔진 evidence와 정확히 같은지, 18행·overview 우선순위와 AI 포함 경계를 검사한다. `CompareDialog.dom.test.tsx`는 jsdom + ReactDOM에서 후보별 보고서·조건수정·제거 버튼이 클릭한 같은 pin/id를 전달하고 스크롤 영역 이름을 가지는지 검사한다.

## 한계와 다음 단계

- 이번 단계는 화면 흐름과 공통 표현 모델까지만 구현했다. 실제 `pdf-lib`/글꼴 lazy load, 파일 생성 및 A4 파일 검수는 다음 PDF 단계의 범위다.
- 실제 Chrome의 390/768/1440px 렌더, 후보 복원 후 포커스, 브라우저 인쇄/A4 파일 검수는 총괄의 CUA 검수가 필요하다. 여기서는 브라우저를 조작하지 않았다.
