# 기존 구현 관찰과 후속 검증 대상

2026-09-21 17:31 KST. 아직 제품 수정 없음. 코드에서 확정한 구조와 실제 재현을 구분한다. 단순 관찰만으로 최종 버그 확정·수정 완료를 주장하지 않는다.

## 확인한 구조

- App.tsx에 검토 앱만 렌더된다. 메인/프로젝트/팀 라우팅·소개 콘텐츠는 없다. React useState의 후보·조건을 페이지 navigation/reload에 보존하는 경로가 없다.
- 기존 19파일/166테스트는 엔진·순수함수·API 일부·정적 React 렌더 위주다. 현재 package.json에는 E2E/axe 실행 명령과 테스트 의존성이 없다.
- ChecklistReport.tsx 첫 장에 위치/제약/면적/비용/다음 확인 일부가 있으나 후보간 비교 요약 전달 prop은 없다.
- useAppData.ts는 큰 번들 15종을 Promise.all로 읽고 일부 선택 자료를 null 처리한다. 정적 자료/온라인 요청 로딩·재시도 UX 및 로딩 병목 검증 필요.

## 코드에서 확인한 검증 공백·위험 후보

1. SiteSearch.tsx: 온라인 주소검색의 늦은 응답 전후에 좌표/읍면동·지도 선택이 들어와도 이전 요청을 중단/무효화하는 경로가 충분한지 확인해야 한다. 입력 변경·coords 분기·pickEmd 분기에서는 현재 ctrl 취소가 없다. 실제 응답 역전 E2E로 검증한다.
2. lib/zoning.ts와 lib/restrictions.ts: 브라우저 fetch에 caller signal은 있으나 자체 deadline이 없다. 각 hook에 수동 재시도 trigger가 없다. useDisaster는 15초 timeout이 있으나 실패 후 동일 좌표 사용자 재시도 동선은 확인이 필요하다.
3. lib/restrictions.ts: `failed`/`hits`/`queried`가 없거나 잘못된 shape일 때 빈 배열로 정규화하고 `failed.length===0`으로 complete=true가 될 수 있다. 잘못된 응답을 정상 제약없음으로 바꿀 위험을 입력 fixture로 검증한다.
4. api/generate.ts: req.json() 실패 처리와 prompt runtime 타입 검사가 충분하지 않다. object/number/null/과대 body/잘못된 JSON 테스트가 현재 없다. HTTP input validation과 비용/중복 호출 제한을 실제 사용 경로에 맞게 검토한다.
5. api/generate.ts 및 api/_vworld.ts: upstream fetch가 headers를 반환하면 timeout timer를 해제한다. 본문/스트림 stall의 무한 대기 가능성, reader 취소·disconnect 전파·오류 detail의 secret 노출 가능성을 검증한다.
6. genai/llmClient.ts: proxy/fallback에 자체 전체 deadline 없음. MemoPanel의 input 서명 무효화는 기존 테스트가 있으나 실제 DOM/stream interleaving을 검증해야 한다.
7. public/data/scenarios.json: expectedGrade/story에 과거 위험비용/통과율 서술이 남아 있다. 현재 docs에서 폐기한 점수·미측정 효과를 Goal의 검증 예제/발표에 가져오지 않는다. 기존 테스트의 실제 사용처를 확인한 뒤 fixture 메타데이터 정합성도 정리한다.

## 실제 브라우저에서 확인한 좁은 범위

- 127.0.0.1:5199의 기존 지도·검색·분석 패널 렌더를 확인했다. 메인/프로젝트/팀 내비게이션은 없다.
- 지도 클릭 없이 `37.5665, 126.9780` 좌표 검색으로 선택 지점·조회중 상태·기본 분석 패널이 나타났다. 이 관찰은 조회 완료나 PDF·업무 전체 통과 증거가 아니다.
- 첫 화면 지도 마커 button에 단일 글자(H/C/E 등)가 읽히는 상태다. 지도 외 목록·키보드 접근 및 의미 있는 accessible name을 별도 점검한다.

## 실행 핸들·도구

- Vite process unified exec session 83558, URL http://127.0.0.1:5199/, --host 127.0.0.1 --port 5199 --strictPort. 이후 검증 때 살아 있는 핸들을 확인한다. 같은 서버를 무조건 재시작하지 않는다.
- Browser plugin 기존 browser/appTab 바인딩으로 실브라우저 검사. 별도 제품 E2E test runner는 격리된 headless fixture 테스트이며 사용자의 선택된 브라우저를 직접 제어하는 우회로 사용하지 않는다.
- 번들 Playwright/sharp는 import 가능. @playwright/test/axe는 프로젝트에 아직 없음. 전체 E2E 구현 단계에서 재현 가능한 devDependency/lockfile·명령을 갖춘다.

## 격리된 실행으로 재현한 응답 검증 결함

2026-09-21 17:36 KST. `work/baseline-response-probe.mts`에서 네트워크 대신 `HTTP 200 {}`를 주입하고 실제 `fetchRestrictions`/`lookupZoning` 함수를 호출했다. 제품 파일 변경은 없다.

- 규제 조회는 `hits: [], queried: [], failed: [], complete: true`를 반환했다. 조회 대상층조차 없는 잘못된 본문을 정상 완료·해당 없음으로 처리하는 결함을 재현했다.
- 용도지역 조회는 `landUse: unknown, all: []`를 반환했고 `found` 등 필수 속성이 없는 응답을 캐시에 넣었다. 실패와 유효한 미발견 결과를 구분할 런타임 검증이 필요하다.
- 원본 실행 결과: `work/evidence/baseline-malformed-response.json`. 이 결과는 단일 잘못된 응답 fixture에 대한 실행 증거이며 실제 운영 API의 결함이나 전체 브라우저 결과를 뜻하지 않는다.

2026-09-21 17:39~17:40 KST. 추가 격리 검증 두 종류를 수행했다. 각 프로세스에서 test-only 환경값과 메모리 내 고정 응답을 사용했다. 실제 AI/VWorld 호출은 하지 않았다.

- `work/baseline-generate-probe.mts`: generate handler는 malformed JSON에서 SyntaxError, body null에서 TypeError를 밖으로 던졌다. prompt가 object/number/공백문자열인 경우 upstream 호출 후 HTTP200을 반환했다. 20,001자 입력은400으로 차단했다. 결과 `work/evidence/baseline-generate-validation.json`.
- `work/baseline-vworld-probe.mts`: VWorld가 `{response:{status:'OK'}}`를 보내 featureCollection이 없는데도 서버 restrictions는 complete=true/hits[], zoning은 found=false/all[]를 HTTP200으로 반환했다. 클라이언트와 서버 양쪽 응답 schema 검증이 필요하다. 결과 `work/evidence/baseline-vworld-validation.json`.
- 실제 배포 서버가 현재 이런 본문을 반환한다고 주장하지 않는다. 비정상 upstream 경계조건에서 잘못된 확정 상태로 전환하는 실제 코드 경로를 재현한 것이다.

## 실제 참고 화면 관찰

- Paces 메인의 짧은 문제/가치 제안, 단일 주요 CTA, 큰 인프라 이미지와 간결한 내비게이션을 확인했다. 해당 서비스의 마케팅 수치를 본 서비스 성과로 재사용하지 않는다.
- Felt product에서 연결된 공개 Oakland Business Development Opportunity Areas 지도에서 상단 도구 모음, 별도 범례와 레이어 설명, 지도 제어 영역을 DOM으로 확인했다. 해당 지도 스크린샷은 캡처 오류였으므로 그 캡처가 성공했다고 기록하지 않는다.

## 2026-09-21 18:12~18:14 KST 독립 AI 경계 재현

- unknown ITEM 키가 power.gate에오배정되는 parser경로와, 모든항목+ERROR가구조상complete=true인점을확인했다. `work/evidence/root-memo-format-baseline.json`.
- proxy일부text후실패→조건일치v4사전의견에서 append-onlyUI가양쪽본문을혼합하는실제transport콜백을재현했다. `work/evidence/root-memo-fallback-baseline.json`.
- UI허용협의note3개×2,000자를입력한대표3지점의prompt는34,273~35,291자다. 서버20,000자한도초과이며34k~35k를20k로조용히잘라서는안된다. `work/evidence/root-prompt-notes-baseline.json`.
- 위검사는네트워크mock/실제순수builder만사용했고AI호출없음. 수정전증거이며04구현의회귀요구다. 자세한인계는 `work/client-prep/HANDOFF.md`.
