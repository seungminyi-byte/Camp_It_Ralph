# 설계 반론 검토와 구현 인계

작성: 2026-09-21 KST. 검토 기준 HEAD: `66e310b9f889b9dca4de5cd1b79e5830d69063b1`, 작업 브랜치 `codex/ralph-goal-20260921`. 사용자 마감은 **2026-09-22 10:00 KST**다. 이 문서는 총괄이 결정할 구체 설계안이며 구현·제품 검증 완료 기록이 아니다. 제품 코드·원본 사진·목표 원문·기존 AGENTS.md를 변경하지 않았다.

실행 역할은 순차 설계 검수 에이전트 `/root/architecture_challenge`, 총괄이 호출 시 지정한 모델은 **gpt-6-astra/xhigh**다. 복잡한 근거·상태·보고서 일관성이 핵심이므로 도구 설명상 복잡한 작업용 Astra를 선택한 판단이 타당하다. Sol/Terra는 통상 구현의 속도·비용 대안, Luna는 작은 반복 작업의 대안이나, 이번 단계에서 더 적합하다는 실측 근거는 없다. 모델 성능·비용 벤치마크를 수행하지 않았고 추가 에이전트를 실행하지 않았다.

## 1. 총괄에 권하는 결정

1. **근거 경계부터 고친다.** 서버와 브라우저 양쪽에서 잘못된 VWorld 응답을 미해당으로 바꾸는 경로를 차단한다. 그 다음 검색 경합·전체 응답 시간제한·재시도·AI 요청 검증을 고친다.
2. **메인은 Paces, 검토 앱은 Felt, 읽는 순서는 IBM을 따른다.** Airtable은 실제 결과를 설명하는 제한된 부분에, Linear는 상태 문구 일관성에만 참고한다. 보조 후보는 이 세 개로 끝낸다.
3. **`/`, `/project`, `/team`, `/review`를 채택한다.** 새 라우터 없이 작은 History 어댑터를 둔다. 검토 입력 상태는 상위 React 상태에 두고 같은 탭의 `sessionStorage`에 제한적으로 복원한다. 지도 앱은 `/review`에서만 마운트한다.
4. **입력과 온라인 근거의 수명을 구분한다.** 페이지 이동에는 입력·핀·선택을 유지한다. 새로고침에는 검증된 입력만 복원하고 온라인 근거를 다시 조회한다. AI 원문·스트림·인증정보는 저장하지 않는다.
5. **현재 후보의 제약·미확인을 점수보다 먼저 보여 준다.** 화면과 보고서의 판단·수치는 `scoreSite()`와 기존 비교 결과를 그대로 사용한다. UI에 두 번째 판정식을 만들지 않는다.
6. **기본 보고서와 AI 설명을 분리한다.** AI 수치·핵심 주장 대조 결과를 표시하되 완전한 의미 검증을 보장한다고 쓰지 않는다. AI는 독립된 선택 부록으로 두고 기본 근거 표의 권위와 섞지 않는다.

권고를 수용하면 사용자 추가 질문 없이 아래 작업을 진행할 수 있다. 기존 권한 안의 PR·배포는 활성 목표가 승인했다. 저장소 공개 전환·신규 유료 서비스·대회 최종 제출은 이 설계로 승인되지 않는다.

## 2. 확인한 사실과 남은 재현

| 항목 | 확인 수준과 코드 근거 | 구현상 의미 |
|---|---|---|
| 소개 경로·상태 복원이 없음 | **코드 확인:** `src/App.tsx`가 검토 앱 전체와 useState를 소유, `vercel.json`은 리전만 지정 | 작은 사이트 셸·상태 경계가 필요 |
| 상대 정적 경로 | **코드 확인:** `vite.config.ts`의 `base: './'`, `useAppData.ts`·`lib/dataCenters.ts`·`genai/llmClient.ts`의 `data/...` | `/review/` 등 직접 진입에서 깨질 수 있으므로 루트 경로로 전환·실제 배포 확인 |
| 브라우저 규제 응답 `{}` | **총괄 독립 실행 재현 + 코드 확인:** `failed/hits/queried` 누락을 빈 배열로 바꾸고 `complete=true`. 용도지역 `{}`도 유효성 검사 없이 캐시 | malformed를 오류로 처리하는 선행 회귀 필수 |
| 서버 `{response:{status:'OK'}}` | **총괄 독립 실행 재현 + 코드 확인:** `api/restrictions.ts`, `zoning.ts`의 `features ?? []`가 없는 필드를 정상 미해당으로 처리 | 서버 경계도 함께 고쳐야 클라이언트 검증이 유효 |
| 용도지역 일부 실패 | **코드 확인:** 다른 레이어에 hit가 있으면 오류가 응답에서 사라지고 정상 캐시됨 | `queried/failed/complete`를 보존하고 부분 결과임을 표시·재시도 |
| 검색 경합 | **코드 확인, 브라우저 재현 필요:** SiteSearch의 좌표/읍면동/입력 변경에 기존 geocode 중단 없음. 성공 후 현재 요청 확인 없이 onPick | 지도 선택·좌표 검색 뒤 늦은 주소 응답이 덮어쓰는 회귀를 고정 |
| 서버 생성 입력 | **총괄 독립 실행 재현 + 코드 확인:** malformed JSON/null은 예외, object/number/공백 prompt는 외부 요청으로 진행 | 실제 byte 한도·JSON 객체·문자열·비공백·문자수 검증 |
| 응답 본문 무한 대기 | **코드 확인, 타이머 fixture 필요:** `_vworld.fetchVworld` 및 generate가 headers 수신 뒤 timer 해제 | headers와 body/stream 전체에 제한시간을 유지 |
| AI와 근거 혼합 | **코드 확인:** `ChecklistReport` 근거 표 각 행에 `memo.items`를 바로 삽입. `memoFormat`은 알 수 없는 ITEM 키를 다음 빈 행에 배정 | 항목 오연결 방지 및 AI 별도 부록 필요 |
| 결과 우선순위 | **코드 확인 + 총괄 실제 화면 관찰:** ResultOverview의 큰 등급·분야 점수·산식 뒤에 `review.overview` | 제약/미확인/다음 행동이 첫 뷰포트 안으로 오도록 재배치 |
| 390px 겹침 | **총괄 실제 화면 관찰:** 검색·레이어·인근추천이 겹치고 추천주소가 잘리며 고정 담기 버튼이 본문을 가림. `work/evidence/baseline-mobile-390.png` | 지도 도구와 목록을 분리하고 고정 액션의 실제 높이만큼 본문 여백 확보 |
| 문화유산 분류·조문 연결 | **총괄 화면 관찰, 법적 판단 미확정:** 서울시청 좌표에서 등록문화재구역이 지정·보호구역/문화유산법 제35조 설명으로 연결됨 | 공식 원문과 레이어 의미를 좁게 조사할 별도 단계 필요. 기존 E상한을 보존한다는 이유로 잘못된 매핑을 확정하지 않음 |
| 기존 유효 기능 | **코드 확인:** scoreSite, null/0 구분, 최대4 pin, 같은 비용 범위만 차액, v4 전체 AI 문맥 서명, PrintPortal | 전면 교체 없이 계승하고 새 경계와 연결 |

총괄 증거는 작업 루트 `work/evidence/baseline-malformed-response.json`, `baseline-generate-validation.json`, `baseline-vworld-validation.json`이다. 이는 격리 mock 실행이며 실제 운영 API가 같은 잘못된 본문을 보냈다는 증거가 아니다. 기존 검사 19파일/166테스트 통과는 이 공백이나 새 화면의 완료를 뜻하지 않는다.

## 3. 디자인 제안에 대한 반론과 채택 범위

주 문제는 제안받은 후보의 전력·입지 제약·재해·주변 현황과 선택 입력을 같은 형식의 검토 근거로 정리하는 일이다. 실제 업무시간·손실·절감률은 측정하지 않았다. 주 사용자는 개발·사업검토 담당자이고 법무팀 경험은 제작 동기다. 상세 근거는 `research/01-problem-references.md`를 따른다.

| 레퍼런스 | 채택 | 반론·조정 |
|---|---|---|
| [Paces](https://www.paces.com/) — 주 메인 | 사용자·상황 → 확인할 문제 → 실제 결과 → 다음 행동의 흐름, 명확한 주 CTA | 시설 사진·큰 홍보 문구 중심이면 이 앱이 실제로 무엇을 확인하는지 늦게 드러난다. 첫 화면에 합성 입력임을 표시한 **실제 앱 결과**를 함께 둔다. 타사 수치·고객 로고·전문가 보증을 복제하지 않는다 |
| [Felt](https://felt.com/product) — 주 지도 | 검색·레이어/범례·선택 상세·후보 목록·지도 조작의 역할 구분 | GIS 도구를 많이 보이면 사업검토 흐름이 밀린다. 기본 레이어는 기존 범위로 유지하고 부가 도구는 접는다. 필수 검토는 지도 클릭 없이 가능하게 한다 |
| **IBM** — 보조 후보 1 | 얇은 구분선, 제목·본문·근거의 위계, 표 정렬 | 전체 IBM 사이트를 재현하면 사용 맥락보다 분류표가 앞선다. 정보 읽는 질서만 채택하며 오렌지를 유지한다 |
| **Airtable** — 보조 후보 2 | 프로젝트 소개의 실제 화면 + 짧은 설명, 사진과 팀 이야기의 여백 | 색면 카드마다 강조하면 위험 배지와 경쟁한다. 설명 섹션 일부에만 사용한다 |
| **Linear** — 보조 후보 3 | 짧고 일관된 상태 명칭, 선택 후보 표시 | 전면 다크·보라색·작은 글씨·고밀도 배치는 비채택. 인쇄와 390px 읽기를 우선한다 |

보조 후보는 **정확히 IBM·Airtable·Linear 3개**다. 각 getdesign 분석/미리보기/원문 링크·라이선스 확인은 선행 문서 §5에 있다. 이번 검토는 그 제안을 반론 검토한 것이며 네 번째 후보를 추가하지 않는다. Kepler.gl/TerriaJS/uMap 비교는 저장·도메인·표시 책임 구분에만 반영하고 코드·로고·폰트·프레임워크를 가져오지 않는다.

### 페이지별 정보 순서와 원고 기준

- `/`: 작은 대상 문구 ‘데이터센터 개발·사업검토 담당자를 위한 1차 검토’ → 제목 ‘제안받은 부지, 확인할 근거부터 모읍니다.’ → 주소에서 흩어진 자료를 확인하는 상황 2문장 → **부지 검토 시작** → 실제 결과 예시 → 사용 3단계(주소 확인/조건 보완·비교/보고서) → 활용 범위·프로젝트/팀 링크. 예시는 ‘공개자료·합성 입력 예시’로 표시하며 라이브 결과처럼 꾸미지 않는다.
- `/project`: 기획 배경 → 후보를 받는 현장 상황 → 자료마다 기준일·범위가 달라 생기는 불편 → 실제 사용 절차 → 주요 기능 → 자료별 출처·기준일·한계 → AI 없이 사용 가능 → 검토 시작. 미측정 절감효과를 기능 검증과 섞지 않는다.
- `/team`: 지정 제목 **우리가 계약서를 덮고 지도를 편 이유** → 사용자 제공 이야기 → 법무시스템을 Codex와 ‘개발 중’인 경험 → 소송 서면·의견서 플러그인/스킬을 ‘만들어 활용’하는 경험 → 이 제품에서 시험한 방식. 이름·직급·경력·사건·도입 성과를 만들지 않는다.
- `/review`: 검색/선택 후보 → 확인된 제약 → 중요한 미확인·조회 상태 → 다음 확인사항 → 선택 상세조건 → 근거별 상세 → 접힌 참고점수 설명 → 비교/보고서. 엔진의 기존 `review.overview`, `issues`, `actions`를 사용한다. 순위를 바꿀 판단이 필요하면 엔진에 명시하고 독립 기대값으로 검증한다.

현재 `--brand:#d65f14`는 현행 오렌지이며 공식 GS CI 색이라고 확정한 값은 아니다. 흰 글자 대비를 W3C sRGB 식으로 다시 계산하면 **3.814:1**이다. 브랜드 장식에는 유지하고 일반 크기 흰 글자 버튼에는 `#b94708`(**5.293:1**), hover `#9f3905`(**6.859:1**)를 권한다. 본문 보조색 후보 `#69756f`/흰색은 **4.800:1**이다. 실제 최종 배경·disabled·focus·링크·배지까지 계산색을 검사한다. [W3C 대비 최소 기준](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### 폭·키보드·지도 없는 업무

| 폭 | 배치·동작 | 수락 기준 |
|---|---|---|
| 1440px | 공통 헤더, 상단 검색·현재 후보, 왼쪽 지도/레이어·오른쪽 440~520px 결과, 하단 후보 목록. 기존 리사이저를 유지하되 최소폭 보장 | 점수 설명을 열지 않아도 제약·중요 미확인이 보임. 지도와 결과 스크롤 구분, sticky 영역이 포커스를 가리지 않음 |
| 768px | 검색 전체폭, 지도/검토 보기 전환 또는 위 지도·아래 결과, 후보는 2열. 좁은 데스크톱 2패널을 강제하지 않음 | 세로 스크롤로 모든 입력·보고서 도달, 4후보 관리·삭제 가능 |
| 390px | 헤더 메뉴 버튼, 16px 여백·본문 16px 기준. 검색→선택 정보→결과가 주 흐름. 지도는 펼치기/전환으로 접근하며 필요 시 300px 이상 높이. 후보는 한 열 | 가로 페이지 스크롤 없음. 비교는 **후보 카드 요약 + 항목별 대조**로 읽고 전체 표는 별도 스크롤 영역. 단순 표 축소로 완료하지 않음 |

공통: 본문 건너뛰기, 각 경로 h1 하나, `aria-current=page`, 경로 이동 후 제목 포커스, 실제 링크의 새 탭/수정키 동작 보존. 검색 combobox는 option id/`aria-activedescendant`, 방향키·Enter·Escape, 검색 중 상태 알림을 갖춘다. 지도 바로 전 ‘검토 결과로 이동’ 링크와 항상 접근 가능한 후보 목록을 둔다. 비교 dialog의 Escape·초점 제한·닫은 뒤 원래 버튼 복원을 실제 키보드로 확인한다. 지도 마커의 한 글자 대신 의미 있는 이름을 제공하고, 마커 탐색을 통과하지 않아도 주요 정보·동일 부지 선택·보고서에 도달하게 한다. 버튼 터치 영역은 44px을 목표로 하되 이를 WCAG AA의 일률적 최소값이라고 부르지 않는다.

팀 사진은 총괄의 `work/team-photo-inspection.md`를 따른다. 001은 세로 정면 프레임, 002는 충분한 높이의 가로 보조 사진, 모바일 필요 시 003으로 대체한다. 원본은 보존하고 orientation 반영·WebP 변환·폭별 srcset·명시 width/height·아래 사진 lazy loading·EXIF 불필요 위치정보 제거를 적용한다. 얼굴과 세 사람을 함께 보존한다. 이미지 목표 용량은 대표 250KB 이하/모바일 150KB 이하를 먼저 시도하되 실제 얼굴 품질이 우선이며 크기와 검수 결과를 기록한다.

## 4. 경로와 상태: 선택안·반대안·정확한 수명

### 선택안

`App`은 `SiteShell`과 작은 경로 어댑터·상위 `useReviewSession`을 소유한다. 기존 App의 검토 조합은 `review/ReviewApp.tsx`로 옮기되 `scoring/compare/report/genai`와 개별 유효 컴포넌트는 그대로 둔다. `site/`는 공통 헤더·푸터와 소개 페이지, `review/`는 업무 상태·검토 조합, `report/`는 기존 보고서 데이터 조합을 소유한다. 새 상태관리·라우터·차트 라이브러리는 도입하지 않는다.

`/review`에서만 ReviewApp/지도/온라인 hooks를 마운트한다. ReviewApp을 React.lazy로 분리하여 소개 페이지에서 Leaflet 코드까지 먼저 실행하지 않게 한다. 공통 셸의 입력 상태는 남고, 떠날 때 진행 중 조회·AI는 중단한다. 앱 재진입 시 현재 입력과 핀을 즉시 복구하고 유효한 메모리 근거를 쓰거나 재조회한다. 소개 페이지를 보기 위해 전국 번들 15개를 먼저 다운로드하게 만들지 않는다. 큰 번들은 기존 로더에 성공 결과 메모리 캐시·취소/재시도 경계를 추가해 `/review` 재진입 중복 로드를 줄인다. 같은 resource의 진행 중 promise는 공유하되 unmount한 구독자만 결과 반영을 해제하고, 구독자가 모두 사라졌을 때 요청을 중단하는 방식으로 StrictMode·재진입 중복을 관리한다. 취소되거나 실패한 promise를 성공 캐시로 보관하지 않는다.

| 대안 | 장점 | 반론·결론 |
|---|---|---|
| ReviewApp을 `hidden`으로 계속 마운트 | 변경이 적고 모든 React 지역 상태가 유지됨 | 숨겨진 지도 요청·메모리·resize 복구·PrintPortal 잔존·포커스 관리가 남고 새로고침은 해결 못 함. 앱만 빠르게 감싸는 임시안으로는 가능하나 이번 완성 기준의 권고안이 아님 |
| 상위 상태만, 저장 없음 | 입력이 서버/저장소에 남지 않음, 단순함 | 내부 이동은 되나 새로고침 손실. 사용자 요구에 더 가까운 최소 복원이 필요 |
| **상위 입력 상태 + sessionStorage** | 이동·reload를 명시적으로 다루고 온라인 근거를 재확인 가능 | runtime 검증·버전·저장 실패 안내가 필요. 구현 범위를 아래 작은 schema로 제한하여 채택 |
| localStorage/공유 URL/백엔드 | 긴 보존·공유 가능 | 사용자 범위를 넘어 보존·노출·인증 문제가 커짐. 이번에는 채택하지 않음 |

### 저장 계약

키는 `ralph.review.v1`, 한도는 UTF-8 기준 **96KiB**를 권한다. allowlist projection으로 아래 필드만 직렬화한다. 객체를 spread하여 임의 속성을 저장/복원하지 않는다.

| 필드 | 저장·복원 |
|---|---|
| `version`, `savedAt` | schema 버전1·ISO 시각. 앞으로의 미지원 버전이나 24시간 초과 snapshot은 복원하지 않고 안내 |
| `current.selection` | 유한 lat/lng·허용 source·최대200자 label. 원본 선택 좌표를 보존, API 조회 반올림과 구분 |
| `projectOverride` | enum·nullable finite 숫자·길이3의 rates/delays. 표시값을 바꿔서 유효값처럼 만들지 않음 |
| `current.conditions`, `manualLandUse`, `openedPinId` | 기존 조건 shape·명시적0·null 유지. 협의 note는 공개/합성 입력만, 길이 제한을 입력 UI와 동일하게 적용 |
| `pins` | 최대4, 순서·id·selection·conditions·manualLandUse만. 같은 좌표의 용도지역 가정 비교를 계속 허용 |
| 표시 설정 | 면적 단위와 현재 검토 보기 정도만. 비교 dialog 열린 상태·스크롤·포커스는 저장하지 않음 |
| 저장하지 않는 것 | 점수/엔진 결과/온라인 응답 본문/자동 landUse/AI 원문·prompt·모델 응답·API키·에러 원문·전국 데이터·지도 타일 |

복원기는 JSON parse 전에 크기를 확인하고 `unknown`에서 시작한다. 객체/배열/enum/숫자 유한성/문자열 길이/날짜 형식/핀 id 중복/최대4를 검증한다. 타입 단언만으로 통과시키지 않는다. 구조가 깨진 최상위 입력은 초기화하되 토스트로 알리고, 잘못된 핀은 그 핀만 버리고 개수를 알린다. null을0으로 바꾸거나 음수·100% 초과·소수층을 정상값으로 보정하지 않는다. 저장된 유한하지만 업무상 부적절한 수치는 그대로 입력 오류·계산 보류가 되어야 한다. `__proto__` 등 추가 속성은 복사하지 않는다.

현재 제품에는 기존 검토 session schema가 없으므로 **v0 추측 마이그레이션을 만들지 않는다.** 미래 schema는 버전별 명시적 migration→동일 validator를 거쳐야 한다. 기존 패널폭 localStorage는 현행 범위로 유지하거나 별도 검증하며 검토 입력 migration과 혼합하지 않는다.

작은 입력 변경은 250ms 이내 저장하고 경로 전환·pagehide 전에 최신 snapshot을 flush한다. 복원보다 빈 초기 상태가 먼저 저장되어 기존 snapshot을 덮어쓰지 않게 hydration 완료 후 쓰기를 시작한다. get/set/remove 예외는 잡고 ‘현재 화면에서는 유지되며 새로고침 시 복원되지 않을 수 있음’을 표시한다. 초기화는 **이번 서비스의 키만** 삭제하며 `sessionStorage.clear()`를 쓰지 않는다. 초기화 직후 undo용 메모리 snapshot을 잠시 제공할 수 있고 저장·진행 요청·선택·핀·AI를 한 번에 무효화한다.

화면 문구: ‘이 탭에서 입력과 담은 후보를 임시 보관합니다. 공개·가상 데이터로 사용하세요. 검토 내용 지우기’. ‘브라우저를 닫으면 반드시 영구 삭제’나 ‘안전하게 암호화’라고 쓰지 않는다. sessionStorage는 reload/restore에 남고 opener로 열린 탭에 초기 복사될 수 있으며 정책에 의해 막힐 수 있다. 외부 새 탭 링크에는 opener 분리를 유지한다. [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)

### 온라인 근거와 AI의 복원

- 새로고침한 핀은 `manualLandUse ?? unknown`으로 시작하고 온라인 근거를 null/‘재조회 필요’로 둔다. 이전 자동분류나 이전 점수를 현재 결과로 복원하지 않는다. id는 opaque 문자열로 유지하여 조회 결과가 바뀌었다는 이유만으로 핀을 복제하지 않는다.
- 현재 후보 먼저, 나머지 핀은 최대2개 후보씩 bounded 조회한다. 부분/실패 상태에서도 입력·비교·기본 보고서가 열리며 ‘미확인’이 보인다. 재조회 비용이 있으므로 소개 페이지에서는 요청하지 않는다.
- 같은 SPA 세션의 근거는 provenance와 조회시각을 가진 메모리 snapshot으로 유지한다. TTL은 제품상 재조회 주기(권고10분)이고 원자료의 최신성을 보증하지 않는다. CDN 캐시 최대1시간 등 실제 출처 제한을 별도 표시한다.
- 재조회 중 이전에 확인된 제약이 있으면 ‘이전 조회에서 해당, 재확인 중’으로 남긴다. 실패가 이를 ‘해당 없음’으로 바꾸면 안 된다. fresh/stale status와 현재 조회 결과를 구분하며, 엔진에 넣는 snapshot 정책과 보고서 표시를 함께 테스트한다.
- AI는 페이지 이탈/새로고침 시 복원하지 않는다. 생성 중단·근거 갱신·입력 변경 뒤 조건을 되돌려도 이전 run을 되살리지 않는다. `memoContext`의 전체 입력·결과·checklist 서명에 `runId`/단조 증가 revision을 함께 사용한다.

구현 계약을 더 명확히 하면 각 온라인 자료는 `{queryKey, requestRevision, fetchedAt, phase, lookup}`를 가진다. `queryKey`는 endpoint 버전+해당 endpoint의 반올림 좌표+buffer/레이어 집합이다. 원본 후보 id와 이 조회 key를 혼동하지 않는다. 같은 key의 재시도도 revision을 올리고, key와 revision이 모두 일치할 때만 결과를 반영한다. `phase`는 loading/done/partial/error/stale이며 세 자료를 독립 갱신한다. 현재 입력·핀의 근거를 합치는 순간 canonical snapshot id를 만들고 AI/보고서가 그 id를 공유한다. 출처 기준일(`asOf`)과 접속시각(`fetchedAt`)은 다른 값이다.

이전 snapshot 보존의 기본 규칙은 다음과 같다. 동일 queryKey에서 확인한 규제 hit는 재조회 실패 시 보존하되 `complete=false`와 재확인 상태를 함께 전달하여 이미 관찰한 제약이 사라지지 않게 한다. 오래된 빈 배열은 ‘미해당’ 근거로 재사용하지 않는다. zoning/disaster의 이전 결과도 이전 조회임을 명시하고, 현재 필수 근거의 최신 조회가 미완료이면 `scoreSite()`가 참고점수·근거상태를 보류하도록 최소한의 source phase metadata를 전달한다. UI가 독자적으로 점수나 법적 상한을 조작하지 않는다. 이 추가 gate는 기존 hit의 법적 의미를 확대하지 않으며03L의 매핑 결론을 따른다. 새로고침에는 이러한 메모리 snapshot 자체가 없으므로 재조회 전 모든 온라인근거는 미확인이다. 현재 지역·조건·엔진결과와 맞지 않는 과거 snapshot은 표시/계산에서 제외한다.

### URL·배포 계약

History 어댑터는 동일 origin의 네 경로에만 SPA 이동을 적용하고 `pushState`/`popstate`, back/forward, 같은 경로 중복 이동을 처리한다. 내부 링크는 실제 `<a href>`를 쓰며 새 탭·복사·수정키 클릭은 가로채지 않는다. 경로에 사업조건·note·AI 원문을 넣지 않는다. `/review/` 등 trailing slash는 canonical 경로로 정리하고 예기치 않은 경로는 ‘페이지를 찾을 수 없음’과 홈/검토 링크를 제공한다.

`vite base`를 `/`로, 번들/사전 AI/이미지 파일 참조를 `/data/...`, `/images/...` 등 root-relative로 바꾼다. `vercel.json`에 **소개/검토 경로만** index.html로 rewrite한다. 예: `/project`, `/team`, `/review` 및 trailing slash 대응. 광범위한 `/(.*)`로 `/api`·이미지·데이터의404를 HTML200으로 숨기지 않는다. 루트 리전 `icn1`, API별 runtime/region, 기존 GitHub 배포 구조를 유지한다. rewrite는 주소를 유지한 채 내부 목적지만 바꾼다. [Vercel rewrites](https://vercel.com/docs/routing/rewrites)

## 5. 신뢰성 구현 명세 — 화면 개선보다 먼저

### 5.1 응답 shape와 판정 경계

서버는 VWorld 응답의 최상위 object/response/status를 검사한다. 명시적 `NOT_FOUND`만 조회 미해당으로 인정하고, `OK`면 featureCollection와 features 배열을 요구한다. `OK`이면서 **명시적으로 비어 있는 유효 배열**은 빈 결과가 될 수 있지만, 누락/null/객체 배열 대체는 실패다. feature/properties의 필수 shape와 bounded 문자열을 검증하고 잘못된 항목을 조용히 버려 규제 hit가 사라지지 않게 한다. geocode도 `NOT_FOUND`와 인증/서버/미지원 status를 구분한다.

브라우저 `parseRestrictions`는 기대한 레이어 집합, `queried`의 중복 없음/정확한 목록, `failed ⊆ queried`, `complete === (failed.length===0)`, hits의 layer/name/buffered를 검증한다. all-failed 또는 queried 누락은 실패다. buffer0이면 heritage buffer query가 없고 buffer>0이면 정확한 해당 query id가 있어야 한다. ‘잘못된 hit를 filter로 제거한 뒤 complete’는 금지한다.

`parseZoning`은 found boolean, landUse enum, layer/name nullable, all의 각 layer/name을 검사하고 found와 all의 일관성을 확인한다. 서버에 zoning `queried/failed/complete` 메타데이터를 추가하여 일부 성공의 한계를 잃지 않는다. 부분 성공은 확인한 지역명은 보여 주되 완전조회처럼 캐시하지 않는다. 타입·엔진의 점수 산정 가능 조건까지 전달해야 하며, 부분응답이라는 사실을 UI 문구 하나로만 숨기지 않는다.

공통 envelope에는 요청의 정규화된 좌표/반경/레이어 버전과 조회시각을 넣는 것이 바람직하다. 기존 disaster의 coordinate 검증을 기준으로 zoning/restrictions도 **응답이 요청한 지점의 것인지** 확인한다. 기존4/5자리 좌표 반올림은 즉시 전면 변경하지 않고 계약에 명시한다. 반올림된 조회가 정밀 필지 경계 확인을 대신하지 않는다는 한계를 표시한다.

### 5.2 시간제한·재시도·취소

| 경로 | 권고 기본 한도 | 완료/복구 계약 |
|---|---|---|
| VWorld 후보별 zoning/restrictions/disaster | 서버 headers+body 전체12초, 브라우저 전체15초 | 제한 내 유효 결과/부분 결과/오류. 무한 spinner 금지. 실패 항목 수동 재시도 |
| geocode ROAD→PARCEL | 서버 합산12초 budget 공유, 브라우저15초 | 두 조회마다12초로 늘리지 않음. NOT_FOUND만404, invalid/timeout은 구분 |
| nearby-sites | 현재 분할 조회 fan-out에 총12초 budget·상한 유지 | 일부 실패 정책 명시, 후보 추천이 기본 검토를 막지 않음 |
| WMS | 서버 headers+image body 전체12초·이미지 byte 상한 | tile error 표시, 검토 데이터 실패와 분리, request disconnect 전파 |
| AI generate | 서버 전체55초, 클라이언트65초; body idle15초 권고 | stop/abort/timeout/error/empty를 구분. 기본 보고서 유지. 자동 중복 재시도 금지 |
| 번들 파일 | 파일별15초 + 재시도 버튼, 성공본 메모리 재사용 | 필수 자료 실패는 다시 불러오기. 선택 자료 실패는 근거 미확인, 앱 전체 실패로 만들지 않음 |

수치는 실측 성과가 아닌 **설계 한도**다. 이후 live smoke가 free AI의 first-token 지연을 보여 주면 전체 한도 안에서 idle 적용 시작점을 조정한다. headers만 받고 본문이 멈추는 테스트를 반드시 포함한다. fetch wrapper에서 timer를 반환 직후 해제하는 형태를 피하고 bounded body read 또는 stream 종료/취소 때까지 lease를 유지한다. `req.signal`→upstream abort, downstream `cancel`→reader.cancel/upstream abort, 모든 종료경로의 timer/listener 정리를 구현한다. 시간제한이 있는 정상 오류 본문도 무제한 `res.text()`로 읽지 않는다.

클라이언트는 한 사용자 동작에 하나의 deadline을 사용한다. 기존 useZoning의 자동2회 조회는 한도를 두 배로 늘리지 않게 수정하거나 수동 재시도로 단순화한다. 권고는 **1회 조회 + 항목별 재시도**, 재시도는 성공 캐시 우회/해당 실패 상태 해제·새 generation을 시작한다. Abort가 전송취소를 완전히 보장하지 않아도 revision 비교로 오래된 결과를 적용하지 못하게 한다.

SiteSearch의 모든 의도 변경(입력 수정, 새 submit, 좌표/읍면동 선택, 부모의 지도/핀 선택, unmount)에 이전 controller를 중단하고 request epoch를 증가시킨다. await 이후 epoch와 signal이 여전히 현재일 때만 선택·오류·busy를 갱신한다. 검색 중에도 입력을 고치거나 취소·대체 검색할 수 있어야 한다. 옛 finally가 새 busy를 꺼서는 안 된다.

### 5.3 공개 API 입력·오류·중복 요청

현재 generate는 POST, 공개 조회6개(`geocode/zoning/restrictions/disaster/nearby-sites/wms`)는 GET 검사 경로가 있다. 정확히 현재7개 endpoint를 회귀표에 둔다. 405의 `Allow`, 오류 `no-store`, 일관된 safe error code를 보완한다.

- generate: JSON Content-Type 확인, declared Content-Length와 **실제 읽은 body 모두** 최대96KiB(한글20,000자 JSON 여유 포함), `prompt`는 문자열·trim 비어 있지 않음·20,000자 이하. malformed JSON/null/배열/숫자/object prompt는400, 크기초과413, 미지원 type415로 외부호출0. 구조 검증 전에 서버 키 유무를 유출하는 상세문구를 반환할 필요가 없다. 현재 prompt builder가 실제로 한도에 들어가는지 대표/최대 입력을 측정하고, 초과하면 근거를 의도적으로 요약하여 사용자에게 표시한다. raw JSON을 임의 substring하여 손상시키지 않는다.
- 조회: finite 좌표·한국 서비스 범위·필수 query 유무·중복 query 허용정책·문자열 길이·buffer 정수0~1000. WMS는 기존 layer/CRS/image 크기 allowlist를 보존하고 bbox 좌표4개·순서·해당 CRS 수치범위를 검증한다. upstream URL은 고정 allowlist로 구성하며 사용자가 URL을 지정하지 못하게 한다.
- 응답과 서버 로그에 upstream URL·본문·Exception 원문·credential을 반사하지 않는다. `UPSTREAM_TIMEOUT`, `UPSTREAM_INVALID`, `UPSTREAM_UNAVAILABLE` 같은 분류와 제한된 request id만 반환한다. SSE의 provider `error.message`도 그대로 흘리지 않는다. API키가 들어간 fake upstream 오류 fixture로 body/header/log 누출을 검사한다.
- 제한된 출력 byte(예: AI128KiB, JSON2MiB, 512px WMS2MiB)를 명시하고 초과는 중단한다. 제한값은 endpoint 실제 최대 shape를 확인한 뒤 적용하며 큰 전국 번들에는 온라인 소형 JSON 한도를 그대로 쓰지 않는다.
- 사용자 중복 클릭은 UI 단일 run/disable, 서버는 request/context digest별 in-flight 중복409·짧은 TTL로 막는다. 성공 응답 재생/다른 사용자에게 AI 본문 공유는 하지 않는다. 프로세스 내 동시 생성2개·분당 제한·bounded map/TTL cleanup을 **보조 방어**로 둘 수 있다.
- 현재 권한의 별도 저장소 없는 Edge 메모리 제한은 cold start/여러 인스턴스/지역/위장 요청에 걸쳐 전역 보장을 하지 못한다. same-origin/`Sec-Fetch-Site` 검사도 직접 API 호출 인증이 아니다. 무료 allowlist·길이·시간·동시성·중복제한으로 피해를 줄이고 **분산 남용 방지는 미보장**으로 명시한다. 기존 계정에서 사용 가능한 방화벽 기능은 권한/요금 확인 후 선택하며 새 결제·백엔드를 전제하지 않는다.
- 서버 모델 선택만 허용하고 현재 무료 모델 allowlist 밖 설정은 명시적 오류로 처리한다. 유료 fallback을 추가하지 않는다. 모델 현행 가용성은 배포 smoke에서 확인하며 오래된 모델명 존재를 성공 근거로 쓰지 않는다.

React text rendering을 유지하고 AI/기사/주소를 HTML로 삽입하지 않는다. 근거 href는 http/https만 허용하며 `javascript:`/`data:`/제어문자 URL을 링크로 만들지 않는다. 외부 새 탭은 `noopener noreferrer`. 실제 위험 입력을 넣은 DOM 회귀로 검증한다.

총괄 추가 측정: 대표3 fixture의 prompt는15,892~16,910자·23,989~25,778bytes로 현재20,000자 한도 안이었다(`work/evidence/baseline-prompt-size.json`). 이는 최대조건·긴 협의 note까지 검증한 결과가 아니다. byte 한도를 문자수와 같게 정해 정상 한글 요청을 차단하지 않는다.

## 6. AI 수치·주장 대조와 보고서 경계

현재 v4 문맥 서명은 전체 input/result/checklist를 포함하며 중요한 기반이다. 이를 없애지 않는다. 추가로 각 run이 `{runId, contextSnapshot, revision, status}`를 소유하고 비동기 hash 계산 이후, 첫 chunk 이전, 각 chunk, done/error 모두 현재 run인지 확인한다. 변경→되돌림·stop→재생성·조회완료·후보변경·페이지이탈 시 이전 callback이 새 run에 붙지 않아야 한다. 사전 생성 응답도 같은 서명·동일 검증을 통과해야 하며 파일 부재는 정상적으로 기본 보고서만 쓰는 상태다.

`parseMemo.complete`는 **항목 형식이 채워졌음**만 의미한다. ‘검증 완료’ 표시에 사용하지 않는다. 알 수 없는 ITEM 키를 임의 다음 항목에 매핑하지 않고 unmapped로 남겨 대조보류로 표시한다. 중복키/누락키도 별도 기록한다. 스트림이 일부 도착한 뒤 fallback을 제공할 경우 이전 부분 텍스트와 합쳐지지 않게 generation별 버퍼를 교체한다.

실현 가능한 대조기는 다음 두 층으로 둔다.

1. **구조화된 수치 대조:** `result`와 checklist에서 허용된 fact id, 항목, 값, 단위, 상태를 추출한다(면적㎡/평, 금액원/억원, MW/kW, %, 개월, count). AI의 항목별 숫자+단위를 추출·정규화해 해당 항목의 fact와 대조한다. 예컨대60억원과6,000,000,000원은 같은 값이지만600억원은 불일치다. 날짜·법조번호·주소·목록 번호는 계산수치와 분리한다. 단순 ‘어딘가에 같은 숫자 존재’는 근거 일치가 아니다. 없거나 모호한 수치는 대조불가로 남긴다.
2. **핵심 확정 주장 방어:** 공급 MW 확정/한전 승인/법적 허용·인허가 확정/사업 적합/안전/측정되지 않은 절감률 같은 대표 표현을 제공근거의 상태와 대조한다. 규제 hit/미확인/사용자 확인/단순 면적충족을 구별한다. fixture로 대표 거짓 주장을 차단하지만, 동의어·복잡한 조건문·모든 법률 의미까지 자동 검증했다고 주장하지 않는다.

UI 상태는 ‘수치 불일치 발견’, ‘제공 근거로 확인할 수 없는 표현’, ‘자동 대조에서 불일치 미검출·담당자 검토 필요’다. 통과를 ‘사실 검증 완료’로 바꾸지 않는다. 불일치/대조불가 의견은 기본 보고서 및 인쇄에서 제외하고 별도 AI 검토 패널에서 이유·항목·근거를 보여 준다. 원문은 escaped text로 열어 볼 수 있다.

**기본 권고:** 기본 PDF에는 AI를 포함하지 않는다. 완료·현재 문맥·구조정상·대조결과가 나온 AI만 사용자가 ‘AI 부록 포함’을 선택할 수 있고 부록 첫머리에 상태/생성시각/검토 필요를 붙인다. AI가 실패·중단·빈 응답이어도 기본 보고서 버튼은 계속 동작한다. 화면 checklist의 근거 셀에는 AI 문장을 삽입하지 않는다. 대표 정상/불일치/무근거/금지확정/프롬프트주입 fixture와 실제 생성1건의 수동 근거 대조표를 남긴다.

## 7. 보고서 첫 장과 계산 단일 기준

첫 장은 **A4 세로 210×297mm, margin13mm, 콘텐츠184×271mm**다. 본문9pt 이상, 표8.5~9pt, 줄간격1.4 안팎을 기준으로 실제 출력에서 검수한다. 아래 mm는 레이아웃 예산이며 `height`/`overflow:hidden`으로 내용을 자르는 지시가 아니다.

| 세로 예산 | 정확한 내용 |
|---|---|
| 0~22mm | 서비스·‘후보 부지 1차 사업검토 보고서’, 출력시각 KST·검토 snapshot id |
| 22~38mm | 현재 후보명/주소 최대2줄 + lat/lng5자리·선택 방식(실주소/읍면동 중심/좌표/지도). 긴 주소 전체는 상세에도 보존 |
| 38~86mm | 왼쪽 ‘확인된 주요 제약’ 최대3개, 오른쪽 ‘중요한 미확인’ 최대3개. 각 문구에 공개자료/사용자입력/조회실패/부분조회 상태. 확인 제약이 없을 때 ‘확인한 자료에서 주요 제약을 찾지 못함’과 범위를 표시 |
| 86~118mm | 공통 사업조건1줄, 계획 연면적/최소 대지/확보면적·부족분, 사업비 합계의 완전/부분 상태, 선택한 금융 시나리오. 미입력은 ‘미입력/계산 보류’,0은0으로 표시 |
| 118~176mm | **후보 비교 요약**: 최대4행, 열은 후보/주요 제약/미확인/면적/입력 사업비. 공통 사업·설계·금리 가정이라는 설명. `compareSummary`가 유효할 때만 차액 표시 |
| 176~223mm | ‘다음 확인사항’ 우선3개: 확인처·질문·연결된 근거. 엔진이 제공하는 우선순서를 사용. 자의적으로 마지막2개만 선택하지 않음 |
| 223~245mm | 출처·기준일·가정 압축표: 번들 기준일 범위, 온라인 조회시각·미확인, 사용자입력 기준. 상세 근거가 이어지는 위치 안내 |
| 245~257mm | ‘스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가’와 문서1쪽 표시. 14mm 여유 유지 |

현재 후보만 있고 핀이0개면 비교 영역에 ‘현재 후보1곳 검토 · 담은 비교 후보 없음’, 핀1개면 ‘2곳 이상에서 후보 간 비교 가능’을 출력한다. 2~4개는 실제 담은 후보만 표시한다. 보고서 현재 후보가 트레이에 없다면 ‘아래 비교에 현재 후보는 포함되지 않음’을 명시하고5번째 후보를 몰래 추가하지 않는다. 긴 제약은 첫 장에 핵심 제목과 ‘외 N건, 상세 근거 참조’를 쓰고 다음 장에 **전문**을 보존한다. 행·문장 누락을 숨기지 않는다.

위치 확인에 주소·좌표·선택방식을 우선 사용한다. 첫 장에 외부 지도 타일을 필수화하면 부하·인쇄시 미완성·출처 문제가 늘고 비교 자리를 침범한다. 실제 지도 thumbnail은 후속 선택사항이며 필수 위치표시/범례를 대신하지 않는다.

보고서 props에 `CompareEntry[]`, 비교 요약, 근거 상태, `generatedAt/snapshotId`를 추가한다. 화면·비교·보고서는 **동일 project + 각 후보 conditions + 그 후보 evidence**로 `scoreSite()`를 호출한 결과를 받는다. 보고서가 score/area/cost를 재계산하지 않는다. `compareSummary`의 동등한 비용방식·완전성 검사를 공용으로 쓴다. 불완전 항목 합계는 ‘입력된 비용 합계’, 완전한 직접총액은 ‘입력 사업비’; 비용방식이 다르면 차액·최저 표시를 보류한다.

보고서 열기/인쇄 때 `{current input/result/rows, comparison entries, evidence status, timestamp}`를 원자적으로 freeze한다. 조회가 인쇄 중 완료되어 페이지마다 다른 근거가 섞이면 안 된다. 변경 후 다시 열면 최신 snapshot이다. PrintPortal은 검토/보고서의 소유 아래 하나만 두고 페이지 이탈 시 제거한다. DOM commit·폰트 준비 뒤 인쇄하며, 기존 document.title/afterprint 복원은 유지한다. 상세 표의 헤더 반복·긴 행의 자연스러운 분할·URL 줄바꿈을 검수하고 무조건 `break-inside:avoid`를 긴 셀 전체에 적용해 빈 페이지/넘침을 만들지 않는다.

**독립 기대값:** `max(30000/2,30000/4/0.5)=15000㎡`; 확보10000㎡면5000㎡ 부족. `1000억원×0.06×12/12=60억원`. 같은 완전 직접총액2000/2300억원이면 차액300억원. 차입0은 금융비용0, 차입null은 보류. 이 값은 엔진 출력을 읽어 만든 기대값이 아니며 엔진·UI·비교·추출 PDF·렌더를 각각 대조한다. 필요한 기대값 변경은 요구사항의 이유를 먼저 기록한다.

총괄이 제품 수정 전에 고정한 `ralphathon/validation/independent-cases.json`을 직접 확인했다. 면적·금융·0/null·잘못된 면적·불완전 비용·malformed 응답·5번째 후보·늦은 검색의 독립 기대값을 다음 구현/E2E가 공통으로 읽되, 해당 파일을 새 구현 출력에 맞춰 덮어쓰지 않는다.

## 8. 순차 실행 묶음과 파일 소유권

아래 번호는 다음 작업을 의도하며 과거 완료를 뜻하지 않는다. 각 묶음은 새 실행 에이전트1개 → 총괄 독립 검수 → 필요한 수정/재검증 → 다음 인계 순서다. 해당 묶음 중 다른 실행 에이전트는 같은 파일을 수정하지 않는다. 총괄이 상태/근거 문서와 독립 검수 로그를 관리한다.

| 묶음·예상 | 소유 파일/산출물 | 선행 회귀·수락 기준 |
|---|---|---|
| **03 서버 API 경계 90분** | `api/_vworld.ts`, 관련 `_*.ts` helper, 공개7 endpoint, `src/test/api/*` | 총괄3개 probe를 선행 fixture로 고정. malformed·partial·404·429·headers/body stall·disconnect·oversize·잘못된method·중복·secret 반사. 외부실호출 없는 API 회귀, typecheck/lint/관련 tests |
| **03L 법적 매핑 확인 45분** | 별도 한국법률조사 에이전트의 `ralphathon/research/` 근거표; 결론 후 담당 구현자가 constants/매핑/관련 tests만 변경 | 한국법률조사 스킬에 따라 국가법령정보·해당 기관 원문 우선. 등록/지정 문화유산·VWorld layer/name·적용 조문·기준일의 연결만 검증. 필요시 케이스노트 보완. 미확정은 미확정으로 남기고 이 설계 단계에서 임의 법률판단·상수변경 없음 |
| **04 클라이언트 조회/AI 90분** | `lib/{zoning,restrictions,disaster,geocode,nearbySites}.ts`, hooks, `SiteSearch`, `genai/*`, `MemoPanel`의 run 경계; 필요한 최소 `types/engine` 근거상태 gate | request epoch/timeout/retry/snapshot identity. AI 변경→되돌림/부분후fallback/대조불일치 회귀. UI 경합 자동검증의 최소 fixture 포함 |
| **05 앱 셸·경로·세션 90분** | `App`, `site/SiteShell`, `site/navigation`, `review/ReviewApp`, `review/session`, `useAppData`, static refs, vite/vercel config |4경로 직접접속/reload/back/forward, 저장불가/잘못된schema/24h지난snapshot/5핀/추가키/초기화. 이동후 입력·핀 유지, 온라인근거·AI의 명세상 재확인 |
| **06 결과·비교·보고서 90분** | `ResultOverview`, `CompareDialog`, `ChecklistReport`, `PrintPortal`, `report/*`, 관련 CSS | 독립15000㎡·60억원·300억원,0/null/부분비용,4후보·미포함현재후보,첫장5필수요소. 실제 A4 초안의 전페이지 검수 |
| **07 메인·프로젝트·팀·공통 디자인 100분** | `site/*` 콘텐츠, 공통 CSS, `public/images/team/*` 최적화본 |Paces/Felt 방향·정확히3 보조 원칙, 원고/사진/상태 사실 일치,390/768/1440 직접화면·키보드·대비 확인 |
| **08 통합 테스트·QA·수정 120분** | `e2e/*`, Playwright/axe 설정·devDependency/lockfile·검증 scripts, 실패 관련 좁은 제품수정 |필수흐름+악성fixture+전폭; 모든 PDF페이지; 전체5검사; 성능실측. 고정 API mocks와 실제 브라우저 결과를 구분 |
| **09 재현·PR·배포 검증 70분** |README/docs/검증manifest, clean-folder 실행, PR/배포 증거 |문서만으로 새폴더 ci/build/start,배포커밋·Actions·Ready·비로그인4경로/API본문·실제AI 실패복구. 설정확대없음 |
| **10 발표자료·대본 80분** |outputs의 최대5장 PPTX/PDF·5분대본·검증된 실제화면 |서비스와 같은 문제·검증기능,한글전장렌더·편집가능파일·대본분량/낭독,미측정효과없음 |
| **11 로그·완료 감사 40분** |실제 주요/하위세션 JSONL 보존·비밀점검 사본·manifest·최종 인계 |원본/사본구분·hash·secret검사·재사용/변경표·ACCEPTANCE60행 증거대조. 허위완료없음 |

기준 합계 **815분(13시간35분)**이다. 법적 매핑 확인45분을 추가했으며 법률검토로 실제 수정 범위가 늘면 다시 추정한다. 작업 간 총괄 검수·수정은 각 묶음에 포함한 추정이며 보장이 아니다. 17:46 기준 잔여16시간14분에서 약2시간39분의 여유가 있다. 총괄이 실제 종료시각과 발견된 위험으로 다시 산정한다. 현재 기본 예상은15시간 미만이므로 병렬화 예외를 적용할 근거가 없다. 전체 요구를 줄이거나10시를 연장하지 않는다. 미완료이면 사용자 요청대로 safe stop 후 Goal pause를 총괄이 수행한다.

### 검증 방식의 구체 경계

- 결정적 브라우저 검사는 Playwright가 모든 외부 API/지도타일을 고정하며 성공·부분·HTTP실패·invalid JSON·본문 stall·응답역전·AI chunk를 재현한다. API handler 직접 import 테스트는 서버 실제 변경을 검증한다. Vite `/api` 운영 프록시만 보고 새 서버가 검증됐다고 하지 않는다.
- 결과 selector/테스트명은 업무 언어로 만들고 버튼 존재만 검사하지 않는다. 후보 이름/좌표/제약상태/비용완전성/AI무효/수치가 바뀌었는지 확인한다. 구현함수에서 기대값을 복사하는 snapshot만으로 계산검사를 대체하지 않는다.
- 독립 A/B 검색역전은 주소A 요청을 보류→좌표B 또는 읍면동B/지도B 선택→A 성공반환→선택·결과가B 유지. 동일지점 retry 이전응답도 revision으로 차단한다.
- axe는 홈/프로젝트/팀/검토빈상태/검토결과/비교dialog/보고서에서 Critical·Serious0건을 확인하고 DOM snapshot과 원본결과를 남긴다. 키보드·visible focus·지도우회·실제색 대비는 수동으로도 확인한다. axe0건을 완전접근성 보장이라고 표현하지 않는다.
- 성능은 동일 공개좌표·합성조건·브라우저버전·viewport·캐시/네트워크를 기록한다. 최초 shell, 번들완료후기본결과, 온라인조회settled, 공통조건변경→4후보갱신, 보고서열기를 분리한다. cold1회/warm5회 median·max를 기록한다. local 목표는4후보갱신250ms/보고서열기500ms 이내로 먼저 측정하며 미달이면 long task/중복 fetch/큰 render를 찾아 개선한다. 이는 목표이지 현재 실측 성과가 아니다.
- PDF는 기본비움/독립수치/4후보비교/긴한국어·긴근거/부분조회/선택AI부록의 대표 세트를 실제 브라우저에서 출력한다. A4 크기·page count·텍스트/숫자/출처 추출 후 **모든 페이지**를 렌더하여 잘림/겹침/빈페이지/누락을 확인한다. 대표1쪽만 보고 전체완료로 표시하지 않는다.
- 총괄이 확인한 도구 제약: 현재 in-app browser의 CDP `Page.printToPDF`는 `Printing is not available`이며 PDF가 생성되지 않았다. 별도 Playwright headless Chromium에서 **실제 제품 DOM + print CSS**를 `page.pdf()`로 출력해 위 검증을 수행하고, in-app browser에서는 보고서 열기/인쇄버튼 동선을 별도로 확인한다. 보고서와 다른 수동 제작 PDF로 대체하지 않는다. viewport 변경은 실제 DOM innerWidth도 확인하며 capability 설정만으로390px이 되었다고 가정하지 않는다.
- clean-folder는 개인 절대경로·미추적 fixture·전역 npm패키지·복사된.env 없이 Node24/명시 Python 및 README만으로 재현한다. CI와 최종 HEAD, PRdiff, 배포가 같은 변경인지 연결한다. live smoke의 HTTP200은 shape/의미검증이 뒤따라야 한다.

## 9. 총괄 결정 기록용 선택표

| 결정 | 권고 기본값 | 수용하지 않을 때 반드시 해결할 점 |
|---|---|---|
| 경로/보존 |4개pathname + 상위상태/sessionStorage 입력만 |hidden마운트를 택하면 hidden 요청·포커스·인쇄·지도resize·reload를 별도 해결 |
| 재조회 |TTL10분 메모리, reload온라인근거삭제/재조회,1회+수동retry |오래된 근거를 현행으로 보이게 하지 않고 이전 제약해당 기록을 실패로 해제하지 않음 |
| AI |run revision+수치/대표주장 대조,기본보고서제외·선택부록 |근거표와 AI 구별,완전semantic검증이라고 하지 않음 |
| 보고서1쪽 |위치→제약/미확인→계산→4후보비교→다음확인 |지도장식/점수 때문에5필수요소가 다음장으로 밀리면 실패 |
| 남용제어 |byte/deadline/freeallowlist/중복·로컬동시성,한계명시 |새유료backend없이는 분산rate전역보장불가. 실제악용경로에 비례해 조치 |
| 팀/대표화면 |제공사진 선별·실제앱 합성예시,미측정효과없음 |가상의 제품UI·성과수치·이름·경력으로 빈칸을 채우지 않음 |

**즉시 다음 작업:** 묶음03 실행 에이전트에게 `BASELINE_FINDINGS.md`, 위3개 probe/증거, 본 문서 §5 및 API별 소유 파일을 전달한다. 먼저 `{}`/`OK+features누락`/잘못된generate입력/headers이후본문stall의 실패 회귀를 만들고 서버 shape·bounded body·오류sanitization을 고친다. 해당 묶음에서 페이지/사진/발표 코드는 수정하지 않는다. 총괄이 원래 실패가 실제로 차단되었는지 독립 확인한 뒤 **03L 법적 매핑 확인 → 04 클라이언트 조회/AI** 순서로 인계한다.

## 10. 자료와 한계

직접 읽은 근거: 활성 목표 전체, 저장소 AGENTS, ACCEPTANCE/BASELINE_FINDINGS/STATE/DECISIONS/EVIDENCE/HANDOFF, 선행 조사 문서, 원본 런북·사진 검수 메모, 위에 명시한 현행 제품 코드·배포 workflow. 디자인 외부 서비스의 실제 사용성은 새로 시험하지 않았으며 선행 공식자료·총괄 화면관찰에 의존한다. 기술 문서의 sessionStorage/Vercel rewrite/W3C 대비는2026-09-21 직접 재확인했다. 과거 기억은 기존 엔진·AI무효화·Vite프록시 검토 위치를 찾는 데만 썼고 현행 구현은 코드로 다시 확인했다.

산출물: `ralphathon/design/02-architecture-challenge.md`. 제품 변경·검사통과·배포·사용효과는 이 산출물의 완료 범위에 포함되지 않는다. 핵심 선택은 위 기본값으로 진행 가능하며 최종 결정은 총괄 DECISIONS에 남긴다.

설계 인계 검수: 2026-09-21 17:47 KST 기준, 마감까지16시간13분. 보조후보3개, 독립 산식, 작업예상 합계815분, 요구사항의 누락 여부, 파일경계와 구현/검증 상태를 확인했다. 이 문서만 신규 작성했으며 제품 테스트는 실행하지 않았다. 총괄의 법적 매핑 조사 결과와 실제 QA에서 설계가 바뀌면 해당 결정·영향·필요 재검사를 남긴다.
