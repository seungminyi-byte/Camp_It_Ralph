# 제품 진입·검토 상태 수명 구현 인계

작성: build_product_entry, 2026-09-21. 기준 코드 66e310b, 문서 결정 D005~D009. AGENTS.md와 GOAL/STATUS/DECISIONS/DESIGN-REVIEW/DESIGN-PROPOSAL을 읽고 적용했다. 하위 에이전트·브라우저 조작·커밋·배포는 수행하지 않았다.

## 구현

- `/`, `/#home`은 제품소개, `/#review`는 검토 화면이다. URL hashchange로 뒤로/앞으로와 직접 검토 진입을 지원한다. 알 수 없는 해시는 홈으로 표시한다. 조건을 URL이나 별도 저장소에 복제하지 않는다.
- `App.tsx`는 공통 헤더·경로·lazy boundary만 가진다. `HomePage.tsx`는 정적 HTML/CSS 제품 설명과 명시적인 화면 구성 예시다. 실적·절감 수치·특정 부지 판정과 외부 자산을 추가하지 않았다.
- 최초 검토 진입 후 `ReviewWorkspace`를 유지하고, 홈에서는 래퍼에 `hidden`과 `inert`를 적용한다. 기존 App의 후보/조건/조회/엔진/비교 계산을 이곳으로 이관했다. 재진입 CTA는 `검토 계속하기`다. 새로고침 보존은 약속하지 않는다.
- 공통 헤더는 lazy 파일 수신 전부터 표시한다. lazy 또는 자료 로딩 실패에는 제품소개 복귀와 새로고침 재시도 경로를 둔다. 기존 useAppData와 API 처리는 변경하지 않았다.
- 홈 이동 시 비교 상태를 닫고 `open={active && compareOpen}`으로 native dialog도 닫는다. 검토→홈 복귀 때 홈 제목으로 초점과 스크롤을 옮긴다. 최초 홈 로드의 강제 초점은 총괄 화면 검수 의견에 따라 생략했다. 검토 자료 준비/재진입 후에는 검토 제목으로 초점을 옮긴다.
- `MapView.active`가 false이면 진행 중 지도 이동을 정지한다. true가 되면 다음 프레임에서 `invalidateSize({ animate:false, pan:false })`를 호출하고 ResizeObserver를 다시 연결한다.
- `MemoPanel.active`가 false일 때 생성 중 의견을 `stopped`로 고정하고 AbortController를 중단한다. 스트림/완료 콜백은 현재 controller·streaming·invalidated 조건을 검사한다. 수동 중지도 부분본을 완료 상태로 바꾸지 않는다.
- 화면 보고서와 PrintPortal 모두 `done && parsed.complete && !parsed.error && !stale` 의견만 같은 `reportMemo`로 받는다. 기본 보고서는 생성/중지/실패 상태에도 유지한다. 기존 v4 서명·입력 및 근거 변경 무효화·site key는 유지한다.
- `PrintPortal`은 active 검토 화면에서만 body에 존재한다. 홈에서는 제거한다. 인쇄 CSS의 root 숨김 조건도 `body:has(#print-root)`로 제한해 홈에서 이전 보고서가 인쇄되거나 홈 전체가 강제로 숨겨지는 일을 막는다.
- 전역 CSS를 기본 토큰/공통 탐색, 홈 CSS, lazy workspace CSS로 분리했다. Leaflet CSS는 workspace가 import한다. GS 오렌지 `#d65f14`, 흰 글자 CTA `#b5470a`, 시스템 한글 글꼴을 쓴다. 모바일 제품 헤더의 작은 부제는 숨겨 제목·CTA의 읽을 폭을 확보한다.

## 자체 검사

Node portable `work/tools/node-v24.21.0-win-x64`를 해당 명령 PATH 앞에만 넣었다. 의존성을 추가하지 않았다.

| 검사 | 결과 | 증거 |
|---|---|---|
| 앱·API·scripts 타입 검사 | 통과 | `../evidence/product-entry/typecheck.txt` |
| oxlint | 경고·오류 없음 | `../evidence/product-entry/lint.txt` |
| 기존 Vitest 전체 | 19개 파일 / 166개 통과 | `../evidence/product-entry/test.txt` |
| 프로덕션 build | 통과 | `../evidence/product-entry/build.txt` |
| 빌드 자산 분리 정적 확인 | 최초 HTML에 entry JS/CSS만 있음. entry JS에 인구·가구 data path 및 Leaflet 구현 없음. Leaflet CSS는 workspace CSS에만 존재 | `../evidence/product-entry/asset-boundary.json` |
| git diff --check | 오류 없음 (Windows CRLF 변환 안내만) | 실행 출력 |

자산 분리는 빌드 정적 검사이며 브라우저 Network나 Lighthouse 측정을 대신하지 않는다. 엔진·자료·상수·후보 저장/재계산 모델·보고서 계산/18항목은 수정하지 않아 데이터 검증은 이번 단계에서 재실행하지 않았다.

최종 자산 기록 정합: 모바일 제품 헤더의 10px 부제를 숨기는 마지막 CSS 수정 후 2026-09-21 16:56:46 KST build를 갱신했다. 이어 16:57:06 KST 실제 dist 정적 검사를 다시 기록했다(UTC 시각은 asset-boundary.json의 checkedAt). 최종 build.txt와 asset-boundary.json은 `index-B2bw9h1p.css`, `index-D1C1tzwT.js`, `ReviewWorkspace-DJ6zgFve.css`, `ReviewWorkspace-9e9FOwze.js`로 일치한다. 앞선 자산명은 마지막 CSS 수정 전 빌드였다.

## 총괄 독립 검수 및 다음 단계

총괄은 1440/390 홈을 실제 브라우저로 별도 관찰했고 초기 workspace/print-root 부재와 최초 제목 초점 문제를 알려왔다. 초점과 문구 수정을 반영했다. 그 관찰은 아래 전체 흐름의 통과를 뜻하지 않는다.

추가로 총괄이 390px에서 덕이동 검색→ArrowDown/Enter→후보 1곳 담기→비교 dialog→브라우저 뒤로 홈→앞으로 review를 검증했다. 홈은 openDialogs=0, printRoots=0, workspace hidden=true. 복귀 후 주소·후보 1곳 유지, printRoot=1, mapWidth=390, document.scrollWidth=390을 확인했다. HMR 수정 중 재시작은 안정된 상태에서 다시 확인했다. 이 기록은 단계 1의 해당 흐름 검증이며 전체 4후보/AI 실패/PDF 검증은 아니다.

총괄의 768px fresh home reload 추가 검수: body focus, workspace 없음, 문서 overflow 없음. 최초 제목 강제 초점 수정도 확인했다.

1. cold `/`, `/#home`에서 데이터 JSON·지도 타일·workspace JS/CSS 요청이 없는지 production Network 확인. 직접 `/#review` 새로고침과 Tab/Enter 시작도 확인.
2. 주소/공통·개별 조건/후보를 만든 뒤 홈·뒤로·앞으로 왕복. 재진입 값, 비교 dialog 미복원, 초점·지도 타일 정렬 확인.
3. 비교 dialog 열린 상태에서 브라우저 뒤로 홈 이동. top-layer dialog와 print-root가 남지 않는지 확인.
4. 보고서 열린 상태에서 홈 이동해 Ctrl+P. 이전 후보 보고서가 없고, review 재진입에는 현재 후보 print-root가 하나만 있는지 확인.
5. AI 생성 중 홈 이동/재진입 및 수동 중지. 부분 의견이 완료 의견·PDF로 바뀌지 않는지 확인. 완료본 홈 왕복 유지, 조건/근거 변경→원상복귀 시 기존 invalidated 의견 미복원 확인.
6. 이 단계는 기존 workspace 정보 위계·모바일 pane 구조를 보존했다. 모바일 단일 문서 스크롤, 검색 겹침, 상세 입력/보고서·AI 동선, 비교 행동은 다음 구현 단계에서 조정한다. 엔진 의미 메타데이터·API 오류 안전 처리도 다음 담당 범위다.
7. 768 포함 전체 화면 크기·axe/Lighthouse·실제 A4 PDF 모든 페이지·실제 AI 네트워크 수명은 미검증이며 총괄 후속 검수가 필요하다.

## 변경 파일

- `prototype/src/App.tsx`
- `prototype/src/pages/HomePage.tsx` (신규)
- `prototype/src/pages/ReviewWorkspace.tsx` (기존 App 상태/기능 이관)
- `prototype/src/index.css`
- `prototype/src/styles/home.css` (신규)
- `prototype/src/styles/workspace.css` (기존 workspace/print CSS 이관)
- `prototype/src/components/MapView.tsx`
- `prototype/src/components/MemoPanel.tsx`
- `prototype/src/components/PrintPortal.tsx`
- `ralphathon/evidence/product-entry/*`
- 이 인계 문서

총괄의 기존 staged/문서 변경과 STATUS/DEPLOYMENT-PLAN/SUBMISSION-NARRATIVE는 수정하지 않았다.
