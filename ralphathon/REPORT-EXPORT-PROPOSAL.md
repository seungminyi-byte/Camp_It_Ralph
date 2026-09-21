# 보고서·A4 PDF 내보내기 제안

작성일: 2026-09-21  
작성 범위: 설계와 구현 인계만. 이 문서 작성 단계에서는 라이브러리 설치, PDF 생성, 제품 코드 수정, 브라우저 조작, 커밋·배포를 하지 않았다.  
검토 기준: HEAD `605bddb`, 총괄 확인 19파일 192테스트 및 production build 통과. 기존 브라우저 인쇄 버튼은 문서 제목 변경까지 확인됐으나 인쇄 미리보기나 저장 파일을 확보하지 못했다. 따라서 **기존 인쇄의 실패로 단정하지 않으며 실제 A4 파일 검수만 미완료**로 본다.

## 1. 결론

**기존 `window.print()`를 보조 경로로 유지하고, `pdf-lib` + `@pdf-lib/fontkit` + 저장소에 포함한 OFL 한국어 글꼴로 실제 `.pdf` 파일을 직접 받는 기능을 추가한다.** 직접 다운로드를 기본 행동인 `PDF 파일 받기`로, 현재 경로를 `브라우저 인쇄`로 표시한다.

PDF 코드는 보고서를 열거나 내려받을 때만 동적 import하고, 한국어 글꼴도 같은 클릭 뒤에만 같은 출처에서 읽는다. 초기 홈·지도·기본 검토에는 PDF 라이브러리와 글꼴을 싣지 않는다. 서버 함수, 외부 PDF API, 새 키, 결제, 상태관리·라우터·차트 라이브러리를 추가하지 않는다.

화면 보고서와 PDF가 서로 계산하지 않게 현재 `ScoreResult`, `buildChecklist()`의 18개 `ChecklistRow`, 완료·유효한 AI 의견을 받는 작은 `ReportViewModel`을 둔다. 이 모델은 표현에 필요한 순서와 문장 배열만 묶고 점수·산식·판정·출처 상태를 재계산하지 않는다. 별도 범용 문서 스키마나 보고서 엔진으로 확장하지 않는다.

## 2. 세 대안 비교

| 안 | 장점 | 이 프로젝트의 문제 | 결정 |
|---|---|---|---|
| 기존 브라우저 인쇄만 유지 | 코드와 의존성이 가장 작고 현재 화면용 CSS를 그대로 사용한다. 브라우저가 한글·CSS·페이지 나누기를 처리한다. | 사용자가 인쇄 대화상자에서 PDF 저장을 다시 선택해야 한다. 현재 CUA 경로에서 저장된 파일을 확보하지 못해 실제 파일·모든 페이지를 검수하는 종료 조건을 충족시키지 못했다. 자동 파일명도 브라우저에 따라 달라질 수 있다. | 보조/폴백으로 유지. 직접 다운로드의 유일 경로로는 부족하다. |
| `pdf-lib` + `@pdf-lib/fontkit` + OFL 한국어 글꼴 | 브라우저에서 `Uint8Array` PDF를 만들고 Blob으로 바로 저장할 수 있다. 글자와 선은 벡터이며 텍스트 선택·검색이 가능하다. A4 크기, 여백, 줄바꿈, 페이지 수를 코드와 테스트가 결정한다. | 한국어 사용자 글꼴과 fontkit이 필요하고 HTML/CSS를 자동 변환하지 않으므로 작은 PDF 배치 코드를 작성해야 한다. 글꼴과 라이브러리의 다운로드·생성 비용, 화면과 PDF 문구의 이탈을 통제해야 한다. | **채택.** 동일 엔진·동일 체크리스트 행 공유, 작은 view-model, 동적 import, 글꼴 subset, 순수 페이지 배치 테스트로 위험을 제한한다. |
| jsPDF + `html2canvas` | 현재 DOM을 이미지로 옮기므로 짧은 시연에서는 화면과 비슷해 보일 수 있고 jsPDF의 `save()`가 편리하다. | `html2canvas` 공식 문서도 실제 화면 캡처가 아니라 DOM을 다시 구성하며 100% 일치하지 않고 이해하는 CSS만 렌더링한다고 설명한다. 긴 문서를 캔버스로 만든 뒤 A4로 자르면 메모리·해상도·행 중간 절단·선택 불가능한 래스터 텍스트 문제가 생긴다. 교차 출처 이미지·오염된 canvas 제약도 있다. jsPDF의 `html`은 `html2canvas` 등을 선택 의존성으로 동적 로드하므로 의존성 수도 줄지 않는다. | 채택하지 않음. 실제 보고서의 긴 한국어·URL·18개 행과 모든 페이지 검수에는 불리하다. jsPDF로 직접 벡터 배치를 하면 결국 채택안과 같은 수동 배치이며 기존 의존성 이점도 없다. |

서버에서 headless Chromium으로 PDF를 만드는 안은 브라우저 렌더링과 가까울 수 있으나 새 서버 실행환경·대용량 의존성·요청 실패면을 만들고 “새 외부 API 없이 브라우저에서 실제 파일 받기”라는 현재 범위를 넘으므로 제외한다.

## 3. 조사 근거와 라이선스

- [pdf-lib 공식 문서](https://pdf-lib.js.org/)는 브라우저를 포함한 JavaScript 환경에서 PDF 생성, 텍스트·이미지·벡터 그리기, 사용자 글꼴 포함과 `save()` 바이트 생성을 지원한다고 설명한다.
- [pdf-lib 공식 Fonts and Unicode 설명](https://github.com/Hopding/pdf-lib#fonts-and-unicode)은 표준 PDF 글꼴의 문자 범위가 제한되어 Unicode에는 사용자 글꼴이 필요하다고 밝힌다. 한국어에는 번들 글꼴을 사용해야 한다.
- [pdf-lib 공식 Fontkit 설치 설명](https://github.com/Hopding/pdf-lib#fontkit-installation)은 사용자 글꼴을 위해 `@pdf-lib/fontkit`을 별도로 등록해야 하고 번들 크기를 늘리므로 기본 포함하지 않는다고 밝힌다. 따라서 두 패키지와 글꼴을 모두 클릭 뒤 동적 로드한다.
- [pdf-lib 공식 Font Subsetting 설명](https://github.com/Hopding/pdf-lib#font-subsetting)은 `embedFont(..., { subset: true })`로 사용 글자만 PDF에 포함할 수 있다고 설명하며, 모든 글꼴에서 동작하는 것은 아니라고 경고한다. 선정 글꼴로 한국어·숫자·기호·긴 URL subset을 실제 검증하고 실패하면 subset을 끄되 이유와 파일 크기를 기록한다.
- `pdf-lib`와 [`@pdf-lib/fontkit`](https://github.com/Hopding/fontkit#license)은 MIT 라이선스다. 설치 시 실제 lockfile에 들어온 전이 의존성까지 라이선스 목록을 다시 확인하고 고지 파일을 남긴다.
- 한국어 글꼴 후보는 Noto Sans KR Regular 한 종이다. [Noto CJK Sans의 OFL 1.1 원문](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE)은 소프트웨어와 함께 번들·포함·재배포할 수 있으나 각 사본에 저작권 고지와 라이선스를 포함하도록 요구한다. 실제 채택 파일의 저장소·커밋·SHA-256·OFL 원문을 함께 기록하고, 다른 파일을 택하면 그 파일의 라이선스를 다시 확인한다.
- [jsPDF 공식 README](https://github.com/parallax/jsPDF#optional-dependencies)는 `html` 메서드가 `html2canvas`에 의존한다고 명시한다. [html2canvas 공식 문서](https://html2canvas.hertzen.com/documentation)는 실제 스크린샷이 아니라 DOM 정보로 표현을 다시 만들며 지원하지 않는 CSS가 있고, 교차 출처 이미지에도 제약이 있다고 설명한다.

외부 CDN은 사용하지 않는다. 라이브러리는 lockfile로 고정하고 글꼴은 저장소 자산으로 포함한다. 배포 시에도 브라우저는 같은 Vercel origin에서만 코드와 글꼴을 받는다.

## 4. 데이터와 상태의 단일 경계

### 4.1 작은 `ReportViewModel`

`prototype/src/report/viewModel.ts`에 다음 정도만 둔다.

```ts
interface ReportViewModel {
  signature: string;
  at: Date;
  site: SiteSelection;
  input: ScoreInput;
  result: ScoreResult;
  rows: readonly ChecklistRow[];
  overviewIssues: readonly ReviewIssue[]; // result.review.overview.issues.slice(0, 3)
  overviewActions: readonly string[];     // result.review.overview.actions.slice(0, 3)
  zoningRow: ChecklistRow;                // permit.landUse
  memo: ValidCompletedMemo | null;
  generatedBy: string | null;
  generatedAt: Date | null;
}
```

- `buildReportViewModel()`은 받은 `result`와 `rows`를 그대로 보유하고, 화면/PDF의 공통 순서와 첫 장 일부만 선택한다. `scoreSite()`를 다시 호출하거나 점수·면적·비용·등급·출처를 계산하지 않는다.
- `rows`는 `CHECKLIST_KEYS` 18개와 같은 순서·중복 없음이 아니면 개발 오류로 실패시킨다. 누락된 행을 조용히 건너뛰지 않는다.
- AI는 현재 MemoPanel이 판정한 `!stale && status === 'done' && parsed.complete && !parsed.error`만 `memo`로 전달한다. 생성 중·중지·오류·불완전·서명 불일치 의견과 raw 텍스트는 `null`이다.
- React 화면의 `ChecklistReport`와 새 PDF 생성기는 같은 모델을 입력으로 받는다. UI 상태에 PDF용 사본을 저장하지 않으며, 후보별 보고서 state도 만들지 않는다.
- 첫 장은 `result.review.overview.issues.slice(0, 3)`와 `result.review.overview.actions.slice(0, 3)`를 사용한다. 현재 `result.review.issues.slice(0, 3)` 및 `actions.slice(-2)`는 제거한다. 상세 장의 `result.review.actions` 전체는 그대로 유지한다.

### 4.2 용도지역은 엔진 evidence만 사용

현재 `checklist.ts`의 `permit.landUse`와 `ChecklistReport`의 “입력 조건” 문장은 각각 `ctx.landUseSource`를 다시 해석하여, HEAD에 반영된 엔진의 단일 출처 규칙과 어긋날 수 있다. 둘 다 `result.evidence.find(e => e.key === 'zoning')`에서 같은 상태·상세·출처를 읽는다.

- 체크리스트 verdict: zoning evidence `available`만 `good`, `partial`은 `caution`, `unknown`은 `na`.
- 체크리스트 evidence 문장: 엔진의 zoning `detail`을 그대로 사용한다. 화면/PDF 상세의 용도지역 문장도 `zoningRow.evidence`를 사용하고 `VWorld 자동 조회` 문장을 별도로 조합하지 않는다.
- 자동 공개조회 표시는 엔진 규칙인 `landUseSource === 'auto'`, `zoning.found`, 적용값과 조회값 일치, 적용값 non-unknown을 모두 만족한 때만 유지한다.
- 수동 입력은 `사용자 입력`, 조회 실패·미해당·값 불일치·source 생략은 `출처 미확인` 상태를 유지한다. 보고서가 `zoningName`만 보고 성공으로 올리지 않는다.
- source URL을 보여주는 정책도 한곳에서 정한다. 최소 구현은 `ChecklistRow.sources`를 그대로 화면과 PDF에 출력하되, 공개조회 성공 링크로 읽힐 수 있는 라벨은 붙이지 않는다. 필요하면 `available`일 때만 “조회 출처”로 표시하고 나머지는 “자료 정의”로 표시한다.

`landUseSource`와 `zoningName`은 AI 프롬프트의 기존 문맥에 필요하면 유지할 수 있으나, 보고서의 표시 판정에는 사용하지 않는다.

## 5. PDF 배치 방식

`prototype/src/report/pdf/`에 브라우저와 무관한 줄바꿈·페이지 배치와 pdf-lib 어댑터를 분리한다.

1. A4 portrait를 PDF point 기준 `595.28 × 841.89`로 만들고 고정 여백 안의 사용 폭과 높이를 계산한다.
2. 한국어 글꼴 Regular 한 종을 등록하고 `subset: true`를 우선 사용한다. 굵게 보일 부분은 동일 글꼴을 한 번 더 넣지 않고 크기·색·선으로 위계를 만든다. 꼭 필요한 경우에만 Bold 한 종을 추가한다.
3. `wrapText()`는 `font.widthOfTextAtSize()`로 실제 폭을 측정한다. 명시적 줄바꿈을 먼저 보존하고, 공백 단위로 맞지 않는 한국어·긴 URL·공백 없는 문자열은 Unicode code point 단위로 쪼갠다. UTF-16 중간을 잘라 서로게이트를 깨뜨리지 않는다.
4. `ensureSpace(requiredHeight)`는 다음 블록을 그리기 전에 남은 높이를 확인하고 페이지를 추가한다. 한 페이지보다 긴 블록은 줄 배열을 여러 페이지로 계속 그린다. 행 전체를 억지로 한 페이지에 묶어 하단을 자르지 않는다.
5. 18개 근거 행은 표의 복잡한 셀 병합 대신 “분야 · 항목 · 상태” 머리와 근거·출처 URL을 잇는 블록으로 그린다. 페이지가 바뀌어도 키 순서를 유지한다. 모든 URL을 생략 없이 텍스트로 넣고 긴 URL도 줄바꿈한다.
6. 첫 장 뒤에는 입력 조건·협의 기록, 사업비·금융비용, 전체 추가 확인사항, 18개 항목별 근거와 각 출처, 엔진 evidence의 출처·기준일·공간 단위·한계를 모두 넣는다. 화면에 있는 장식보다 정보 보존을 우선한다.
7. 유효 AI가 있으면 18개 행별 의견, 전체 의견, 행동, 유의사항을 마지막에 넣고 같은 페이지네이터를 거친다. AI가 길어도 잘라내지 않는다. 유효 AI가 없으면 AI 제목이나 빈 구획도 만들지 않는다.
8. 각 페이지에 페이지 번호와 “스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가”를 넣는다. 첫 장/상세 장을 고정 2장으로 가정하지 않는다.

내용을 자르는 `maxLines`, CSS 높이, canvas crop을 사용하지 않는다. 매우 긴 협의 메모·AI·URL은 PDF 페이지 수가 늘어나는 방식으로 전부 보존한다. 생성 중 UI에는 진행 중임을 표시하고 같은 버튼의 중복 실행만 막는다.

## 6. 직접 다운로드와 오래된 스냅샷 방지

`MemoPanel`의 클릭 흐름은 다음과 같다.

1. 클릭 시 현재 `ReportViewModel`과 서명을 캡처한다. 서명에는 기존 `memoContextSnapshot(input, result, rows)`뿐 아니라 PDF 포함 대상인 유효 AI 내용·생성 정보 또는 `base-report` 상태를 포함한다.
2. `import('../report/pdf/generateReportPdf')`로 PDF 코드를 불러오고 같은 출처의 번들 글꼴을 읽는다. `AbortController`는 글꼴 fetch에 전달한다.
3. PDF 바이트가 완성된 뒤 자동 저장 직전에 `active === true`, 현재 route가 review, 현재 서명과 시작 서명이 같음, 현재 site key가 같음을 다시 확인한다.
4. 그 사이 입력·근거·후보·AI 유효성이 바뀌거나 home으로 이동하면 바이트를 폐기하고 자동 저장하지 않는다. “조건이 변경되어 PDF 생성을 취소했습니다. 다시 받아 주세요.”를 표시한다. home 이동 시 진행 중 fetch도 중단한다.
5. 조건이 그대로면 `application/pdf` Blob과 기존 `reportFileTitle()`로 임시 `<a download>`를 클릭한다. 클릭 뒤 노드를 제거하고 Object URL을 즉시 revoke한다.
6. 동적 import·글꼴·생성·다운로드 중 하나라도 실패하면 오류를 사용자에게 보이고 `브라우저 인쇄`는 계속 사용할 수 있게 둔다. 실패했다고 자동으로 인쇄 대화상자를 열어 사용자를 놀라게 하지 않는다.

버튼은 `PDF 파일 받기`(기본), `브라우저 인쇄`(기존 `printWithTitle`), `AI 검토 의견 생성`(별도 선택)으로 구분한다. PDF 생성은 네트워크 API나 AI 성공에 의존하지 않는다.

## 7. 후보별 보고서 흐름

`CompareDialog`의 각 후보 열에 `보고서 보기`를 `조건 수정·지도 보기`와 별도 행동으로 둔다.

- `onOpenReport(pin)`은 기존 `openPin(pin)`과 같은 복원 경로로 선택 지점·부지조건·수동 용도지역·저장 lookup을 먼저 현재 작업공간에 적용하고 비교 dialog를 닫는다.
- React 상태가 반영되어 `site`와 `openedPinId`가 후보와 일치한 뒤 effect가 보고서 `<details>`를 열고 제목으로 스크롤·초점 이동한다. 비교 버튼의 같은 이벤트에서 PDF 생성이나 `print()`를 호출하지 않는다.
- 재조회 중이면 보고서를 먼저 열어 현재 조회 상태를 보이고, hooks가 끝나 `scoreSite()` 결과가 바뀌면 동일 보고서 모델이 갱신된다. 사용자는 갱신이 끝난 현재 모델에서 내려받는다.
- 후보 보고서도 현재 화면의 `input/result/rows`만 쓴다. 4곳 일괄 PDF, 후보별 보고서 캐시, 별도 계산은 추가하지 않는다.

## 8. 단계별 파일 변경 계획

### 단계 A — 표시 정합성과 공통 모델

- `prototype/src/report/checklist.ts`
  - `permit.landUse`를 `result.evidence.zoning` 상태·상세 기반으로 변경한다.
- `prototype/src/report/checklist.test.ts`
  - manual, 정상 auto, failed/null, auto mismatch, `landUseSource` omitted를 각각 검증한다.
- `prototype/src/report/viewModel.ts` (신규)
  - 최소 `ReportViewModel`, 18행 완전성 검사, 첫 장 overview 선택, 유효 AI 포함 경계를 둔다.
- `prototype/src/report/viewModel.test.ts` (신규)
  - 첫 장 행동이 `overview.actions.slice(0, 3)`이고 전체 행동·18행·출처가 보존됨을 검증한다.
- `prototype/src/components/ChecklistReport.tsx`
  - view-model을 입력으로 받고 용도지역은 `zoningRow`를 표시한다. 첫 장 issues/actions를 overview로 고친다.
- `prototype/src/components/MemoPanel.tsx`
  - 현재 rows/result/유효 AI에서 view-model 하나를 만들고 화면 보고서와 이후 PDF에 함께 전달한다.

단계 A가 통과하기 전 PDF 라이브러리를 설치하지 않는다. 이 단계만으로 기존 브라우저 인쇄 보고서의 출처와 첫 장 행동도 바로잡힌다.

### 단계 B — 순수 줄바꿈·페이지 배치

- `prototype/src/report/pdf/layout.ts` (신규)
  - 폭 측정 기반 한국어/URL 줄바꿈, 여백, 새 페이지, 이어 그리기, 18행 순서를 구현한다.
- `prototype/src/report/pdf/layout.test.ts` (신규)
  - 공백 없는 긴 한국어, 긴 URL, 여러 줄 협의 메모, 긴 AI, 18행 전체를 recording renderer로 검증한다. 출력한 code point 수와 입력을 비교하여 무음 절단을 막는다.

이 단계는 pdf-lib 없이 순수 함수로 먼저 검증할 수 있다.

### 단계 C — PDF 어댑터와 직접 저장

- `prototype/package.json`, `prototype/package-lock.json`
  - 실제 검증한 `pdf-lib`, `@pdf-lib/fontkit` 버전을 lockfile에 고정한다.
- `prototype/src/assets/fonts/NotoSansKR-Regular.ttf` 또는 검증된 동일 계열 Regular 파일 (신규)
- `prototype/src/assets/fonts/OFL.txt`, `prototype/THIRD_PARTY_NOTICES.md` (신규)
  - 글꼴 출처 URL·커밋·SHA-256, OFL 원문, 패키지 MIT 및 전이 의존성 고지를 기록한다.
- `prototype/src/report/pdf/generateReportPdf.ts` (신규)
  - pdf-lib/fontkit 등록, A4 page renderer, metadata, subset, `Uint8Array` 생성을 구현한다.
- `prototype/src/report/pdf/generateReportPdf.test.ts` (신규)
  - 반환값이 유효 PDF이고 A4 page가 2장 이상이며 metadata와 layout manifest가 일치함을 확인한다. pdf-lib로 다시 load하여 page 크기·수를 확인한다.
- `prototype/src/lib/download.ts`, `prototype/src/lib/download.test.ts` (신규 또는 기존 print 모듈에 작은 함수 추가)
  - Blob download, 파일명, URL revoke를 분리해 검증한다.
- `prototype/src/components/MemoPanel.tsx`
  - lazy download 상태·오류·signature/active 재확인, `PDF 파일 받기`와 기존 `브라우저 인쇄`를 연결한다.
- `prototype/src/styles/workspace.css`
  - 세 행동의 줄바꿈·진행/오류 표시만 보완한다. PDF 배치는 CSS에 의존하지 않는다.

### 단계 D — 후보별 진입

- `prototype/src/components/CompareDialog.tsx`
  - 각 후보에 `보고서 보기` 행동과 callback을 추가한다.
- `prototype/src/pages/ReviewWorkspace.tsx`
  - 후보 복원 후 다음 render에서 보고서 details를 열고 초점 이동하는 일회성 request를 둔다.
- 관련 compare/integration 테스트
  - 선택 후보 주소·조건·근거 일치, 재조회 중 갱신, 같은 클릭에서 즉시 인쇄/다운로드하지 않음을 검증한다.

## 9. 자동 검증과 실제 파일 검수

### 필수 자동 회귀

1. 기존 typecheck, lint, 전체 Vitest(현재 192개 포함), 데이터 검증, production build를 모두 통과한다.
2. `CHECKLIST_KEYS` 18개가 화면 view-model, layout recording, 실제 PDF manifest에서 같은 순서로 한 번씩 나타난다. 각 행의 evidence와 모든 source URL 개수도 원본과 같다.
3. 첫 장은 `review.overview.issues/actions`의 앞 3개를 쓰고, 상세 장은 `review.actions` 전체를 보존한다. 빈 overview이면 엔진이 제공한 fallback을 그대로 쓴다.
4. 용도지역 manual/auto 정상/failed/mismatch/omitted에서 엔진 evidence, checklist, 화면 상세, PDF 기록이 같은 status/detail을 가진다.
5. AI streaming/stopped/error/incomplete/stale은 모두 제외하고 완료·현재 서명 일치만 포함한다. AI 생성 도중 입력 변경과 완료 뒤 입력 변경·원상복귀에서도 예전 의견을 복원하거나 저장하지 않는다.
6. 8천자 이상 한국어 협의 메모, 공백 없는 문자열, 긴 URL, 긴 유효 AI를 넣고 page 수가 늘며 입력 code point가 layout 기록에서 전부 소비되는지 확인한다.
7. PDF 바이트 생성 중 입력 변경·후보 전환·home 이동을 흉내 내어 download 호출이 0회인지 확인한다. 정상 상태에서는 1회이고 Object URL을 revoke한다.
8. build 결과에서 PDF 코드·fontkit이 별도 lazy chunk이고 한국어 글꼴이 별도 asset인지 확인한다. 홈/기본 검토 진입 때 이 자산 요청이 없는지 실제 브라우저에서 확인한다. 변경 전후 초기 JS/CSS·lazy chunk·글꼴 크기와 클릭 후 생성 시간을 증거에 기록한다.

### 실제 Chrome/CUA 및 아티팩트 확보

브라우저 자동화는 지정된 CUA Chrome 인스턴스만 사용한다. 다른 browser runtime, Playwright, Puppeteer로 성공을 대신하지 않는다.

1. AI 없는 기본 보고서, 완료·유효 AI 포함 보고서, 긴 협의 기록/긴 URL 보고서를 각각 `PDF 파일 받기`로 실제 클릭한다.
2. 브라우저가 받은 세 PDF를 `ralphathon/evidence/report-export/`의 검수 사본으로 보존하고 파일명·크기·SHA-256·생성 시각을 manifest에 기록한다. 제품 저장소에 실제 내부자료는 넣지 않는다.
3. `pdfinfo`로 모든 페이지가 A4 portrait인지, `pdftotext`로 한국어·주소·전체 행동·18행 제목과 URL이 존재하는지 확인한다.
4. 모든 페이지를 PNG로 렌더링해 사람 눈으로 잘림, 겹침, 깨진 한글, 고아 제목, 표/블록 순서, 페이지 footer를 확인한다. 첫 장만 보고 통과시키지 않는다.
5. 같은 조건의 화면 보고서와 PDF의 주소, 사업조건, overview 3개, 전체 행동 수, 18행 상태/근거/source 수, AI 포함 여부를 view-model manifest와 대조한다.
6. PDF 생성 중 조건을 바꾸고 home으로 이동하는 장면에서 다운로드가 생기지 않는지, 다시 review에서 최신 조건으로 새 파일을 받을 수 있는지 확인한다.
7. 비교 4후보에서 각 `보고서 보기`가 올바른 후보를 복원하는지 확인하고, 적어도 서로 다른 2후보 파일의 주소·조건·근거가 섞이지 않았는지 대조한다.
8. `브라우저 인쇄`도 남아 있고 기존 임시 title 변경/복원이 동작하는지 확인한다. 인쇄 미리보기 surface를 CUA가 제공하지 않으면 그 한계를 그대로 기록하며, 직접 다운로드 PDF 검수를 인쇄 대화상자 검수라고 부르지 않는다.

## 10. 인수 기준

구현 단계는 아래를 모두 만족해야 완료다.

- 주소만 선택한 AI 없는 기본 보고서를 사용자가 별도 인쇄 대화상자 없이 실제 `.pdf`로 받는다.
- PDF는 A4 portrait이며 첫 장 overview와 전체 행동, 18개 근거 행, 모든 출처·한계가 있다. 장문 사용자 협의·AI·URL 어느 것도 조용히 잘리지 않는다.
- 화면과 PDF가 같은 `ScoreResult`·`ChecklistRow[]`·유효 AI 경계를 사용하며 별도 점수·판정·출처 계산이 없다.
- 용도지역은 manual/failed/mismatch/omitted에서 공개조회 성공으로 잘못 표시되지 않고, 체크리스트와 입력조건 문장이 엔진 zoning evidence와 같다.
- AI 실패·진행·중지·무효화는 기본 PDF를 막지 않으며 PDF에 포함되지 않는다. 완료·현재 일치 AI만 들어간다.
- 생성 중 입력 변경·home 이동·후보 전환 시 오래된 파일이 자동 저장되지 않는다.
- 비교의 후보별 보고서가 선택 후보를 복원한 다음 열리고 주소·조건·근거가 섞이지 않는다.
- PDF/fontkit/font asset은 클릭 전 요청되지 않는다. 실제 build 크기와 생성 시간을 기록하고 Lighthouse 모바일 성능 90+ 목표를 다시 측정한다.
- 라이선스·글꼴 출처·SHA-256·전이 의존성 고지가 남고 새 외부 API·키·결제·런타임 서버가 없다.
- 실제 다운로드 파일의 hash, `pdfinfo`, `pdftotext`, 전 페이지 PNG와 육안 검수 기록이 있다. 파일을 확보하지 못한 상태를 A4 통과로 표시하지 않는다.

## 11. 실패 시 축소 순서

1. font subset이 특정 한국어 글꼴에서 깨지면 같은 글꼴 전체 포함으로 바꾸고 파일 크기 영향을 기록한다.
2. PDF 직접 생성이 실패해도 기존 `브라우저 인쇄`를 유지하며 기본 보고서·AI 없는 흐름을 막지 않는다.
3. 마감 때문에 범위를 줄여야 하면 후보별 직접 다운로드의 편의 UI를 뒤로 미룰 수 있으나, 18행·전체 근거·장문 페이지나누기·실제 파일 검수는 줄이지 않는다.
4. html2canvas 래스터 캡처로 임시 교체해 통과 처리하지 않는다. 직접 생성 문제가 해결되지 않으면 미완료와 오류를 기록한다.

