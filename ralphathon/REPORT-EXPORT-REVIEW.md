# 보고서·A4 PDF 내보내기 반론 검수

작성일: 2026-09-21  
대상: `REPORT-EXPORT-PROPOSAL.md`와 HEAD `605bddb`의 `MemoPanel`, `ChecklistReport`, `checklist`, `ReviewWorkspace`, `CompareDialog` 대조. 설계 검수만 수행했으며 코드·패키지·글꼴·PDF·브라우저 상태는 변경하지 않았다.

## 결론

제안의 목표(기본 보고서 진입 → 후보별 보고서 → 실제 A4 PDF 내려받기, 기존 인쇄 보존)는 유지한다. PDF는 현재 `ScoreResult`와 한 번 만든 18개 `ChecklistRow[]`만 받아 그리며, 후보 보고서도 후보를 현재 작업공간에 복원한 뒤의 동일 결과만 사용해야 한다. `scoreSite()` 재실행, PDF 전용 checklist/AI 상태 캐시, 범용 문서 스키마는 추가하지 않는다.

## 핵심 반론과 최소 수정 권고

1. `zoningName`과 `landUseSource`를 보고서에서 다시 조합하면 이미 수정된 엔진 계약을 되돌린다. 엔진은 zoning evidence의 `detail`에 “현재 적용”, `사용자 입력`/`공개 조회`/`출처 미확인`을 넣고 `status`도 결정한다. `permit.landUse`의 verdict·evidence와 ChecklistReport의 입력조건 문장을 모두 그 단일 evidence의 `status`·`detail`로 바꾼다. `zoningName`은 AI 문맥 외 보고서 표시 판정에서 제거한다.

2. 18행 누락을 검출하는 것은 필요하지만 `buildReportViewModel()`이 MemoPanel 렌더에서 throw하면 AI가 없어도 기존 화면 보고서와 인쇄가 함께 깨진다. `CHECKLIST_KEYS` 완전성은 `buildChecklist`/view-model 단위 테스트와 PDF 생성 시작 경계에서 검증하고, 내보내기 오류는 버튼의 오류 상태에 국한한다. 화면 기본 보고서는 계속 렌더되어야 한다.

3. 비동기 PDF 완료 콜백은 클릭 당시 closure의 `active`/route/result를 다시 읽는 것으로는 오래된 상태를 막지 못한다. 현재 값으로 갱신되는 ref와 증가 토큰을 두고, 시작 시의 view-model 서명(사이트 label·좌표, input/result/rows, 포함 가능한 완료 AI의 상세 문자열·생성정보 또는 `base-report`)을 저장한다. 다운로드 직전에 active·review route·site key·서명·토큰을 모두 대조한다. raw AI는 표시/복사용일 뿐 PDF용 별도 상태가 아니다.

4. Object URL을 `<a>.click()` 직후 즉시 revoke하면 브라우저 다운로드 시작과 경합할 수 있다. 링크는 클릭 후 제거하되 URL revoke는 짧은 다음 작업/타이머로 지연하고, 정상·취소 모두 한 번만 정리한다. 다운로드 실패가 기존 `브라우저 인쇄`를 열거나 기본 보고서를 숨기게 해서는 안 된다.

5. 제안 본문에는 PDF 코드·글꼴을 “보고서를 열거나 내려받을 때” 불러온다는 표현과 “다운로드 클릭 때” 불러온다는 표현이 섞여 있다. 실제 적용은 **`PDF 파일 받기` 클릭 때만** lazy import/fetch한다. 보고서 기본 진입과 후보별 `보고서 보기`는 화면 보고서만 열며 다운로드·print를 호출하지 않는다. 이는 마감 축소 때 후보별 보고서 흐름 자체를 없애도 된다는 뜻이 아니다.

6. 후보 열기 요청은 `openPin()`의 복원과 비동기 zoning/restriction/disaster 재조회 사이에 있다. `pendingReportPinId` 같은 일회성 요청(ref 또는 상태)을 pin id에 묶어 저장하고, 후보 복원 후 render에서 그 id·site·현재 report target이 일치할 때만 `<details>`를 열고 제목에 초점을 둔다. 다른 지점 선택, home 이동, 후보 제거 시 요청을 지운다. 비교 dialog 클릭에서는 다운로드/인쇄를 시작하지 않는다.

7. OFL Regular TTF를 실제 자산으로 확정하기 전에는 해당 파일의 fontkit embed/subset, 한글·숫자·기호·긴 URL을 검증한다. subset 실패는 전체 포함으로만 후퇴하고 파일 크기를 기록한다. 고정 2페이지를 통과 조건으로 삼지 말고 실제 내용의 페이지 수와 A4 크기·텍스트 누락·전 페이지 렌더를 검사한다.

## 인수 검사

1. 주소만 선택한 AI 없는 상태에서 화면 보고서를 열고 `PDF 파일 받기`로 A4 portrait 파일을 얻으며, 기존 `브라우저 인쇄`도 제목 복원과 함께 남아 있다.
2. `CHECKLIST_KEYS` 18개가 view-model, 화면, layout manifest, PDF에 같은 순서로 한 번씩 있고, 각 근거와 URL 및 `result.evidence`의 출처·기준일·공간 단위·한계가 보존된다.
3. zoning manual, 정상 auto, lookup 실패, auto 불일치, source 생략 각각에서 엔진 zoning evidence와 checklist·화면·PDF의 status/detail이 일치하며, `zoningName`만으로 공개조회 성공을 표시하지 않는다.
4. 완료·현재 서명 일치 AI만 PDF에 포함한다. streaming/stopped/error/incomplete/stale AI는 제외되며, AI raw를 포함한 별도 보고서 상태는 생기지 않는다.
5. 긴 한국어 협의 기록, 공백 없는 문자열, 긴 URL, 긴 유효 AI에서 페이지 수가 늘고 모든 code point가 layout 기록과 추출 텍스트에 남는다. 최소 페이지 수 가정은 두지 않는다.
6. 생성 중 입력 변경, 후보 전환, home 이동, 두 번째 다운로드 클릭에서 stale download 호출은 0회다. 정상 클릭은 1회 저장하고 Object URL은 지연 정리된다.
7. 최대 4후보에서 서로 다른 2후보 이상을 `보고서 보기`로 열어 주소·조건·근거가 그 후보와 일치하고, 재조회 중에는 최신 결과로 갱신된 뒤에만 다운로드한다.
8. 실제 다운로드 PDF마다 hash, `pdfinfo` A4 검사, `pdftotext` 핵심 내용/URL 검사, 전 페이지 PNG 육안 검수 기록을 남긴다. 클릭 전에는 pdf-lib/fontkit/글꼴 요청이 없고, 실제 build chunk·글꼴 크기·생성 시간을 기록한다.
