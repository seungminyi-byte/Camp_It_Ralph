# 05 경로·입력 보존·번들 수명 구현 인계

작성: 2026-09-21 19:43 KST. 하드 마감 2026-09-22 10:00 KST까지 약 14시간 17분. 기준 HEAD `1fce1dc7481e6c07e97482c1c02066491bbfefa1`, 브랜치 `codex/ralph-goal-20260921`. 총괄이 승인한 05 범위만 구현했다. 추가 모델 전환·하위 재위임·커밋·푸시·PR·배포는 실행하지 않았다. 소유권은 이 문서와 해시 목록으로 총괄 검수에 반환한다.

## 1. 구현 결과와 수명

`App`이 `ReviewSessionStore` 실행 인스턴스와 경로를 소유한다. 모듈 초기화 때 storage를 읽지 않으며, 새 App 인스턴스의 생성자에서 동기 복원한 뒤 구독한다. 소개 페이지는 `/`, `/project`, `/team`, 검토는 `/review`다. 실제 href 링크, 수정키·중간 버튼·target·download·외부 링크의 기본 동작 보존, popstate 뒤로가기/앞으로가기, 알려진 경로의 후행 `/` 정규화, 제목·h1 포커스, 본문 바로가기·푸터·찾을 수 없음/복귀 링크를 연결했다. 선택 좌표와 사업조건을 URL에 쓰지 않는다.

`review/ReviewApp.tsx`만 lazy import하며 Leaflet CSS도 이 경로로 옮겼다. 검토를 떠나면 지도·온라인 hooks·MemoPanel이 unmount된다. App의 입력 인스턴스는 유지되고 AI 생성 상태는 유지하지 않는다. 전국 자료는 파일별 성공 메모리 캐시로 남되 실패와 취소된 promise는 성공 캐시에 들어가지 않는다.

복원 화면의 지도 중심이 기본 서울권에 남는 문제를 총괄 PNG 검수에서 발견했다. `MapView`가 처음 마운트할 때 현재 후보가 있으면 해당 좌표와 zoom13으로 시작하도록 고쳤다. 이후 같은 지도 인스턴스의 수동 이동은 초기화하지 않으며 기존 `FlyTo` 경로를 유지한다. 후보가 없으면 기존 기본 중심/zoom9다. 수정 전 PNG는 보존했고 수정 후 세종 P마커 중앙 표시를 별도 PNG로 확인했다.

소개 내용은 최소한의 사실에 맞는 골격이다. Paces/Felt/GS 오렌지의 최종 구성, 사진, 완성 디자인은 07이다. 상위 내비게이션과 기존 검토 헤더가 함께 있는 현재 배치도 07 통합 대상이다.

## 2. 저장 계약

키 `ralph.review.v1`, version1, ISO `savedAt`, 최대 24시간, UTF-8 96KiB를 구현했다. JSON parse 전에 바이트 수를 검사하며 미지원 버전·잘못된 ISO·만료·과도한 미래시각·구조 손상은 안내 후 복원하지 않는다. 기존 schema를 추정하는 migration은 없다.

저장 필드는 현재 선택 좌표/source/최대200자 label, 현재 부지조건·manualLandUse·openedPinId, 공통 projectOverride, 순서 있는 최대4개 후보의 opaque id/선택/조건/수동가정, 면적 표시 단위다. 협의 note는 2,000자, 날짜는 빈 문자열 또는 유효한 날짜, 숫자는 nullable finite, enum과 rates/delays 길이3을 검증한다. 선택적 label도 allowlist로 투영하고 검색 입력은 200자로 제한한다. 온라인 주소 응답의 표시 label은 선택 시 200자까지 사용한다.

- null과 명시적0은 구분한다. 유한한 음수·용적률0·소수 층수는 그대로 복원하여 엔진의 입력 오류/계산 보류가 유지된다.
- 잘못된 핀, 중복 id, 초과 핀은 해당 항목만 제외하고 개수를 안내한다. 같은 좌표·다른 수동용도 가정은 서로 다른 opaque id로 유지한다.
- 점수·온라인 응답·자동 용도지역·AI·prompt·전국 번들·오류 원문은 직렬화하지 않는다. 알 수 없는 속성도 복사하지 않는다.
- reload의 핀은 `manualLandUse ?? unknown`, 온라인 근거 null로 시작한다. 실앱과 핀 점수 입력의 `landUseSource`는 manual/auto/unknown을 명시한다.
- 최신 입력은 250ms 안에 저장하고 내부 이동/popstate/pagehide/셸 정리 시 flush한다. 동기 복원 전에 빈 입력을 쓰지 않는다.
- get/set/remove 예외는 잡는다. 저장 실패 때 현재 메모리 작업을 유지하며 새로고침 복원 한계를 안내한다. 제거 실패는 이전 입력이 다시 복원될 수 있다는 별도 안내다.
- 초기화는 서비스 키 하나만 제거하고 선택/공통조건/부지조건/단위/핀을 초기화한다. resetRevision으로 ReviewApp을 재마운트하고 selectionRevision을 증가시켜 진행 조회·AI의 늦은 반영을 막는다. 다른 sessionStorage 키는 유지한다.

화면 문구는 “이 탭에서 입력과 담은 후보를 임시 보관합니다. 공개·가상 데이터로 사용하세요.”다. 영구 삭제·암호화 보장·탭 복제 방지 등을 주장하지 않는다.

## 3. 현재 후보·핀의 근거 재확인

현재 후보의 용도지역/규제/재해 상태가 loading을 벗어난 뒤 다른 후보를 최대2개씩 갱신한다. 각 후보 worker는 세 조회를 순서대로 수행하므로 **다른 후보**의 진행 전송도 최대2개다. 현재 후보는 기존 세 조회 및 인근 필지 조회를 유지하므로 서비스 전체의 모든 전송이2개 이하라는 뜻은 아니다. 현재 실패/부분 결과/지원 범위 밖 idle에서도 큐가 진행한다. 소개 페이지에는 큐가 없다.

큐는 선택 revision/핀 identity 변화·이탈·초기화 때 취소한다. 취소 후 늦은 응답은 반영하지 않는다. 결과 적용 때 id·선택·수동가정을 대조하며 최신 입력조건을 덮어쓰지 않고 근거 필드만 갱신한다. opaque id 목록은 JSON 형태로 비교하므로 id 내부 구분자로 충돌하지 않는다.

같은 SPA의 핀은 `evidence`에 queryKey, selectionRevision, requestRevision, status와 검증된 lookup snapshot을 둔다. 이 객체는 저장 allowlist에 포함되지 않는다. 500개 메모리 캐시 밖으로 밀린 핀을 열면 queryKey·좌표·version·조회시각을 확인한 snapshot을 관찰 캐시에 seed한다. seed는 stale/complete=false이며 성공 absence로 되살리지 않는다. 재조회 실패에도 이전에 확인한 규제 hit가 유지된다. 다른 queryKey seed는 거부한다. 기존 온라인 TTL10분과 fresh/partial/stale 정책을 그대로 쓴다.

재진입/선택 revision 갱신에서 큐를 다시 평가한다. 같은 검토 화면에 계속 머무는 비선택 후보의 독립적인 주기 타이머는 추가하지 않았다. 현재 후보 hooks의 TTL 갱신 및 후보 재선택/재진입과 기존 엔진의 조회시각 판정이 남아 있다. 06의 비교 UI에서 비선택 후보 조회 재시도를 추가한다면 이 큐와 provenance를 재사용해야 한다.

MemoPanel에는 기존 selectionRevision과 각 조회의 queryKey/selectionRevision/requestRevision/status 서명을 전달한다. 동일 key 재시도에서 snapshot이 null이어도 AI를 무효화하는 04B 계약을 유지한다. 이탈 시 AI abort/PrintPortal 제거, 조건을 되돌려도 과거 run 비복원, 기본 AI 부록 false를 유지했다.

`useNearbySites`의 객체 site dependency 대신 명시 selectionRevision을 `MapView`에서 전달했다. 동일 좌표 재선택 시 이전 전송을 중단하고 새 revision으로 시작하는 회귀를 추가하여 기존 의도를 보존하면서 lint 경고를 없앴다.

## 4. 15개 번들 로더와 경로

`BundleLoader.acquire()`는 같은 파일의 진행 promise와 구독 lease를 공유한다. 한 소비자 해제는 다른 소비자를 취소하지 않는다. 마지막 해제 후 microtask에서 abort하며 StrictMode의 같은 task 재구독은 전송을 재사용한다. 취소된 오래된 요청은 새 요청/성공 캐시를 덮어쓰지 않는다. `useAppData`는 unmount에서 15개 lease를 해제하고 늦은 setState를 막는다.

각 요청은 헤더부터 본문 읽기·문자열 decoding까지 전체 15초, 응답의 Content-Length 및 누적 byte 상한, UTF-8 decode, HTTP/HTML 오류를 검사한다. 파일별 상한은 `bundleLoader.ts`에 있다. 현재 실제 크기와 주요 상한은 다음과 같다.

| 파일 | 실제 byte | 상한 |
|---|---:|---:|
| protected_zones.json | 3,259,933 | 5MiB |
| households_grid.json | 2,616,534 | 4MiB |
| pop_grid.json | 1,968,787 | 3MiB |
| terrain_grid.json | 1,277,706 | 2MiB |

온라인 기본2MiB를 큰 번들에 적용하지 않았다. 나머지 파일도 실제 크기 검사를 통과했다. 기존 데이터 자체와 constants 값은 수정하지 않았다.

총괄이 필수 constants `{}`가 성공 캐시에 들어가 소비부에서 실패하는 공백을 재현했다. `parseBundleJson/parseBundleCsv`를 성공 캐시 앞에 추가하여 필수 소비 구조, finite scalar, tuple/array, constants 하위 구조와 CSV header/숫자를 확인한다. 보호구역·지형은 기존 decoder, 데이터센터 목록은 기존 validator를 재사용한다. 선택 파일의 malformed shape는 null/미확인·안내·재시도로 귀결한다. 이는 원자료 정확성·법적 최신성·완전한 GIS topology 검증을 뜻하지 않는다.

기존 필수/선택 경계를 유지했다. 필수 자료 실패는 재시도 화면이며 선택 자료 실패는 나머지 검토를 유지한다. 재시도는 성공 캐시를 재사용하고 실패 파일만 다시 요청한다. 부적합 JSON/CSV를 성공 캐시에 남기지 않는다.

Vite base는 `/`, data/AI 경로는 root-relative다. Vercel 설정은 project/team/review 및 각 trailing slash에만 index rewrite를 두고 `icn1`을 유지했다. catch-all을 두지 않았으며 `public/404.html`에 돌아가기 링크를 제공한다. API/없는 asset/data를 HTML200으로 바꾸지 않는다. 기존 workflow는 수정하지 않았다. Vercel 실제 rewrite/404는 09 배포에서 재확인해야 한다.

## 5. 검사 근거

최종 6개 gate는 모두 exit0다. `work/evidence/05-final-checks.json`, `05-final-{typecheck,lint,vitest,data,build,diff}.log`, `05-vitest-results.json`에 남겼다. 최종 **43개 파일 528개 테스트**, baseline467 대비61개 추가, lint 경고0이다. 코드 변경으로 근거가 바뀐 때만 관련 검사 및 전체 gate를 다시 실행했다.

| 고정 독립 기대값 | 구현/검사 |
|---|---|
| S01–S03 | session roundtrip, opaque 순서4핀·동일좌표 가정, 0/null·유한 invalid 유지 |
| S04–S05 | 미지원버전/ISO/24h/미래/UTF-8상한·유효 개별필드의 총량 초과 |
| S06–S10 | badpin 격리·중복/초과 제외·allowlist·자동분류/AI/근거 비복원 |
| S11–S14 | storage3예외·동기 hydration·키 격리 reset·즉시/250ms/pagehide flush |
| N01–N03 | route 실제href/h1·history·reload·수정키/target/download·unknown·정규화, explicit rewrite/404 |
| B01–B04 | 실제15파일 크기/shape, 본문15초 stall, lease2개·StrictMode·마지막abort·retry/lateold/cache |
| P01 | 현재3조회 완료/실패 후 다른후보2개, resetabort·늦은값 무효화·갱신중 조건 보존 |
| P02 | 실제 lookup 캐시에501개 다른좌표 적재→eviction→핀 seed→실패에도 stale 확인hit 유지 |

새 주요 검사 파일: `session.test.ts`, `routes.test.tsx`, `bundleLoader.test.ts`, `bundleValidation.test.ts`, `useAppData.lifecycle.test.tsx`, `pinRefresh.test.ts`, `ReviewApp.session.test.tsx`, `MapView.restore.test.tsx`. 기존 `useOnlineLookup.test.tsx`에 동일좌표 인근조회 revision 회귀, `App.lookups.test.tsx`에 새경로 진입을 연결했다.

총괄은 별도 독립 session25조건, bundle14조건, constants shape 복구 및 실제 5199 경로/복원을 수행했다고 인계했다. 해당 root 로그는 총괄 소유이며 이 실행자가 수정하지 않았다.

## 6. 실제 브라우저 근거와 한계

브라우저 스킬을 읽고 Codex IAB의 별도 탭을 사용했다. 작업용 `work/05-browser/server.mjs`는 최신 production build와 공개 합성 온라인 응답을 `127.0.0.1:5205`에 제공했다. 외부 AI를 호출하지 않았다. 인근필지/WMS는 fixture404라 실패 표시가 정상이고 이를 운영 연결 실패/성공으로 확대하지 않는다. 5199 구형 운영 proxy의 strict 계약 실패와 별개다.

- `05-intro-initial-requests.json`: 실제 main 직접접속 전 CDP cursor를 잡아 확인. index JS/CSS만 요청했으며 `/data/`0, `/api/`0, ReviewApp chunk0, 기록 잘림없음. 초기 index JS 약205.20kB와 lazy ReviewApp 약320kB가 빌드에서 분리되었다.
- `05-review-before-intro.txt`, `05-review-back.txt`, `05-review-reload.txt`: 좌표36.4967/127.3007, 대지10,000㎡, 연면적30,000㎡, 용적률200%, 건폐율50%, 4층 입력 후 평 표시3,025/9,075, 핀1→팀소개→뒤로가기→reload. 단위·핀·5,000㎡ 부족·복원 안내 유지.
- `05-intro-unmount.json`: 소개 이동 뒤 지도 DOM0/print-root0, 소개 h1 포커스. 기록에 직전 지도 타일 전환 요청이 포함되지만 새 데이터/온라인 근거 요청은 없다. 이미 시작된 이미지 전송의 존재를 숨기지 않는다.
- `/team/` 직접접속은 `/team`으로 정규화되고 팀 h1을 확인했다. unknown 직접접속은 404 문서와 메인 복귀 링크를 확인했다. `05-local-route-responses.json`은 로컬 fixture host의 실제9응답이며 Vercel 운영 검증은 아니다.
- modifier 클릭은 원래 탭 URL 유지까지 실제 확인했다. IAB에 새 탭 생성이 관찰되지 않아 새 탭 생성 성공으로 주장하지 않는다. 수정키/중간버튼/target/download/external 클릭을 가로채지 않는 코드는 단위검사에서 확인했다.
- `05-main.png`, `05-review-reload-map-fixed.png`를 직접 열어 한글과 복원 위치를 육안 확인했다. `05-review-reload.png`는 지도 중심 오류를 발견한 수정 전 증거다. 수정 후 지도734×478의 중앙에 P마커가 위치했다.

390/768/1440 최종 레이아웃·axe·실제 A4 전체 페이지·실제 운영 API/무료 AI·배포 Ready·비로그인 검증은 아직 이 패키지에서 완료하지 않았다.

## 7. 다음 묶음과 소유권 반환

06은 결과·비교·보고서 구성 및 A4에 집중하고 단일 `scoreSite()` 계산, 현재 provenance, AI 부록의 기본 false를 유지한다. pin의 입력과 `evidence`는 수명이 다르므로 보고서에 stale/partial/fetchedAt과 출처기준일을 구분한다. 07은 `site/IntroPage`, shell, 기존 검토 헤더/워크스페이스를 완성 디자인으로 통합하고 사진 원본을 보존한다. 08/09는 수정키 실제 브라우저 정책, 최종 접근성/화면폭/PDF/배포경로까지 확인한다.

변경 파일과 SHA-256은 `work/evidence/05-changed-files.sha256.json`이다. 테스트용 서버·로그·스크립트는 `work/`에만 두었다. 검증용 탭과 5205 서버(PID12464의 명령을 대조)는 종료했고 기존 5199 서버/총괄 탭은 유지했다. ROOT 상태 문서/결정/독립 기대값/원문/사진/기존 읽기전용 소스는 수정하지 않았다. 실제 목표 완료·배포 완료로 표시하지 않으며 총괄 독립 검수와 커밋을 기다린다.
