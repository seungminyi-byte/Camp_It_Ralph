# 04A 브라우저 온라인 조회 신뢰성·복구 인계

작성: 2026-09-21 18:58 KST. 작업 시작은 18:34 KST, 최종 제품 검사 종료는 **18:56:18 KST**다. 마감 2026-09-22 10:00 KST까지 약 15시간 2분 남았다. 시각은 tool clock 및 검사 프로세스의 UTC datetime을 KST로 환산했다. 초반 총괄 메시지에 적은 18:40은 실제 확인 전 추정으로 잘못 표기했으며, 실제 작업·검사 시각의 근거로 쓰지 않는다.

기준 HEAD `a07be1d`, 브랜치 `codex/ralph-goal-20260921`. 이번 제품 변경은 **미커밋·미배포**이며 총괄 독립 검수 후 반영한다. 원본 읽기 전용 저장소, AGENTS 원문, 사진, Goal 원문, 총괄 STATE/DECISIONS/EVIDENCE/AGENT_LOG 및 독립 probe는 수정하지 않았다.

## 1. 문제와 범위

규제 HTTP 200 `{}`가 `complete=true/hits=[]`, 용도지역 `{}`가 unknown/빈 배열로 통과해 실패를 ‘관찰 없음’으로 바꿀 수 있었다. 캐시 TTL·본문 deadline·일관된 요청 revision이 없거나 일부 경로에만 있었고, 재조회 시 이전 확인 제약을 잃거나 예전 검색이 새 선택을 덮어쓸 수 있었다. 주소 HTTP 404도 본문을 보지 않고 미발견으로 처리했다.

브라우저 JSON 조회 5종(zoning/restrictions/disaster/geocode/nearby), 공통 상태 수명, 검색 의도 변경, 현재 후보/열린 핀의 snapshot 전달, 엔진의 필수 근거 완전성 gate와 최소 재시도 UI를 수정했다. WMS는 기존 이미지 타일 경로를 유지하며 타일 표시 오류와 판정 근거 조회 오류를 분리해 설명했다. AI 패키지·MemoPanel·부록 적격성은 수정하지 않았다.

지정 실행 모델은 Astra/xhigh다. 제공된 설명상 복합 계약·race·엔진 경계 검수의 품질을 우선해 Astra를 유지했다. Sol/Terra의 일반 구현 속도·비용 대안, Luna의 작은 작업 비용 대안과 비교했으며 별도 성능 벤치마크를 실행한 것은 아니다. 하위 에이전트를 추가하거나 전역 모델/설정/권한을 바꾸지 않았다. 사전 메모리 검색은 기존 제품 역할을 파악하는 참고였고 현재 동작·수치는 저장소와 실제 검사로 재검증했다.

## 2. 응답과 실패 계약

| 항목 | 구현 |
|---|---|
| 공통 envelope | version=`vworld-v2-20260921`, 요청과 정확히 일치하는 정규화 좌표, 유효 ISO fetchedAt 검사. fetchedAt은 API 조회시각이며 원자료·법령 기준일이 아님 |
| 좌표 정밀도 | zoning/restrictions 4자리, disaster/nearby 5자리. 서버와 같은 Math.round 정규화. queryKey는 버전+endpoint+정규화 좌표+레이어/반경 |
| queried/failed | 정확한 기대 레이어 집합, 중복 없음, failed의 subset, complete와 실패목록 일관성 검사. buffer0이면 주변 국가유산 query와 hit 금지 |
| hit | 필수 shape·enum·bounded 문자열·nullable name·원문 scalar 속성 검사. malformed 항목을 filter로 삭제하지 않고 전체 응답 거부. 규제 hit의 중복과 buffered 관계도 검사 |
| 용도지역 분류 | 서버 함수의 로직을 `prototype/shared/zoning.ts`로 추출해 서버/클라이언트가 함께 사용. name은 주거인데 landUse가 industrial인 응답 거부. 서버 분류 동작은 동일 |
| 주변 필지 | 기준면적/반경/검색단계·최대3후보·유한 면적/거리·면적단위 대응·좌표/닫힌 ring·ID 중복 검사. 전체 기하 topology나 권리관계 검증을 뜻하지 않음 |
| 오류 vs 부분 | 모든 queried 실패이고 관찰 hit가 0이면 오류. 일부 관찰이 있으면 partial을 보존. 부분 empty는 미해당 확정 근거가 아님 |
| 주소404 | status404 + text/plain + 정확한 `NOT_FOUND` 본문만 주소 미발견. HTML/JSON404, 다른 text, 과대·멈춘 본문은 조회 실패 |

**all-failed 반례:** disaster는 단일 `LT_C_UP201` 레이어다. 첫 페이지 포화 시 실제 서버가 `failed=queried=['LT_C_UP201']`, hit10개, complete=false를 반환한다. 이를 무조건 all-failed 오류로 버리면 확인한 재해 관찰을 잃는다. 서버 계약에 맞춰 이 경우 partial을 보존하며 숫자점수는 보류한다. 총괄과 이 해석을 합의했고 독립 bridge 및 회귀에 고정했다.

공통 `boundedJson`은 headers부터 마지막 본문 byte와 decoding까지 **15초**의 단일 budget을 적용한다. 성공 JSON은 **2MiB**, 주소404 오류 본문은 **1KiB** 상한이다. 잘못된 MIME/UTF-8/declared 또는 실제 과대본문을 거부한다. parent abort, deadline, 오류, 정상 종료 때 reader·timer·listener를 정리하며 취소를 무시하는 transport의 늦은 응답도 body를 취소한다. 이 상한을 큰 전국 번들에 적용하지 않는다.

## 3. 조회 수명·캐시·복구

- `EvidenceCache`는 완전한 성공 TTL 캐시와 같은 queryKey의 과거 관찰을 분리한다. 각 map은 최대500개이며 오류·부분응답을 성공으로 캐시하지 않는다. 과거 empty는 만료/재시도 중 ‘미해당’ 근거로 반환하지 않는다.
- fresh 판단은 API fetchedAt 기준10분이며 캐시 보관도 최대10분이다. UI가 마운트된 정상 성공은 만료 때 새 조회를 시작한다. 10분은 제품 재조회 정책이며 원자료 최신성을 보장하지 않는다.
- 서버 CDN은 일부 endpoint에서 최대1시간 캐시할 수 있다. 수동·TTL 재시도의 `force=true`는 메모리 성공 캐시를 우회하고 `refresh=<시각>-<단조번호>` query로 CDN URL도 바꾼다. 이 nonce는 의미상의 queryKey에 넣지 않는다. 기존 서버는 해당 query를 허용하므로 endpoint 계약 변경은 없었다. 최종 공개배포의 실제 CDN 동작은 09에서 재검증한다.
- 새로 받은 partial은 `status=partial/complete=false`이며 과거 snapshot이라는 `stale` 표식을 붙이지 않는다. 이전 관찰을 합치거나 조회시각이 만료된 경우에만 stale=true다. 이전 관찰 합성 시 `previousFetchedAt`으로 보존 시각을 별도 유지한다.
- 같은 key 재시도 중/실패 시 확인된 hit를 stale+complete=false로 보존한다. 후속 완전조회가 명시적으로 empty를 확인하면 과거 관찰을 갱신한다. 다른 queryKey의 hit는 합치지 않는다.
- 같은 좌표에 다른 수동 가정을 가진 두 핀은 독립 consumer다. 같은 key의 두 요청은 각자 유효 응답을 받고, 성공 cache publication만 가장 최근 시작한 요청이 수행한다. 한 consumer의 abort/retry가 다른 consumer를 `Superseded` 오류로 만들지 않는다. 활성 run 등록은 finally에서 정리한다.
- `LookupController`는 각 consumer의 AbortController와 단조 requestRevision을 소유한다. key+selectionRevision+현재 requestRevision 모두 유효할 때만 done/error를 반영한다. late A, 같은 key 재시도, A→B→A, 취소를 무시한 완료 모두 현재 상태를 덮어쓰지 못한다.
- SiteSearch는 입력수정·새 submit·좌표/읍면동 선택·부모 지도/핀 선택·unmount에서 취소+epoch를 적용한다. 검색 중에도 수정/대체검색이 가능하고 옛 finally가 새 busy를 끄지 않는다. combobox option ID/active descendant와 진행 상태 알림도 연결했다.
- 현재 후보와 열린 핀에는 조회 중에도 stale 근거를 전달한다. 예전에는 loading 동안 핀의 완전한 snapshot을 유지했으나 이제 재확인 상태까지 같이 전달한다. 다른 핀 id나 다른 원본 선택 좌표의 snapshot은 현재 후보에 투영하지 않는다.
- 지원 범위 밖 지도 좌표는 hook 렌더 예외·HTTP 요청 없이 idle/미확인으로 남는다. nearby는 별도 상태·별도 재시도이며 기본 전력/인허가 검토를 막지 않는다.

## 4. 엔진·표시 경계

zoning/disaster partial, stale 및 만료는 인허가·종합 숫자점수를 보류한다. 확인한 disaster hit는 기존15점1회 관찰을 유지하고, 별도로 확인한 prohibited는 기존40점1회·E상한을 유지한다. 국가유산 review/reference와 scoringHits의 03M 법적 경계는 바꾸지 않았다. partial empty zoning으로 해상 여부를 확정하지 않는다.

실제 App·핀은 `ScoreInput.landUseSource`를 manual/auto/unknown으로 명시한다. 사용자 수동 선택은 가정이며 온라인 조사 완전성을 대신하지 않는다. 수동 값이 있어도 필수 온라인 조회가 미완료이면 점수는 보류한다. 이미 존재하는 오프라인 시나리오 스크립트와 내부 합성 fixture의 호환을 위해 타입의 transport 메타데이터/landUseSource는 optional이지만 **브라우저 wire parser는 모든 필수 메타데이터를 엄격히 요구한다**. 05의 복원 입력은 이 legacy 경로로 우회하지 말고 source를 반드시 명시해야 한다.

기본 report의 용도지역 행은 엔진 evidence 상태를 받아 미완료를 ‘자료 확인’으로 표시하지 않도록 최소 수정했다. 재해 요약은 관찰과 불완전성을 같이 쓴다. 전체 보고서/A4 레이아웃은 06 범위다. 온라인 상태 UI는 출처 원자료 기준일과 다른 API 조회시각, 이전 관찰, 실패/부분의 의미, 항목별 재시도를 제공한다.

## 5. 검증과 실패 기록

실행별 Node24.20.0 PATH, 지정 Python3.12.14를 사용했다. DOM race 검증을 위해 총괄이 허용한 **로컬 devDependency jsdom30.1.0**과 lockfile만 추가했다. npm audit은 설치 시117패키지·0취약점이었다. 런타임 의존성과 전역 설정은 바꾸지 않았다. npm은 기존 esbuild/fsevents 설치 script 차단을 알렸으며 별도 승인/설정 변경 없이 현재 런타임에서 빌드가 성공했다.

| 검사 | 결과·근거 |
|---|---|
| 구현 전 malformed5종 | 3실패/2통과. restrictions/zoning/nearby의 HTTP200 `{}` 정상통과를 재현. [red](../../../evidence/04A-red.log) |
| 404 추가 red | HTML/JSON/다른text/공백/과대404를 미발견으로 분류한 문제를 확인. [red](../../../evidence/04A-geocode404-red.log), [관련green](../../../evidence/04A-geocode404-green.log) |
| 최초 전체 회귀 실패 | 구형 disaster fixture2건(새 wire/취소계약)과 법령시각검사1건(TTL시계) 실패. fixture는 새 공식 envelope로 갱신하고 취소는 reject를 요구, 날짜 분리검사는 해당 날짜의 clock을 고정했다. 기대한 법적 review/E 정책은 유지. [로그](../../../evidence/04A-first-full.log) |
| DOM 검사 초기 환경 실패 | jsdom에 native dialog.showModal/close가 없어1실패. 테스트에 dialog 상태 polyfill을 추가했고 제품 dialog 동작은 바꾸지 않음. [초기](../../../evidence/04A-app-dom-initial.log), [green](../../../evidence/04A-app-dom-second.log) |
| 최종 전체 Vitest | **31파일401건 전부 통과**. 기존336건+신규65건. [전체](../../../evidence/04A-all-tests-final.log) |
| 타입·린트 | 앱/API/스크립트 typecheck, lint 종료0·최종 경고 없음. [타입](../../../evidence/04A-typecheck-final.log), [린트](../../../evidence/04A-lint-final.log) |
| 데이터·빌드·diff | VALIDATION PASSED, production build 성공, diff-check0. [자료](../../../evidence/04A-data-validation-final.log), [빌드](../../../evidence/04A-build-final.log), [diff](../../../evidence/04A-diff-check-final.log) |
| 명령·시각·종료코드 | [최종 기록](../../../evidence/04A-check-results.json). 1회 순차 검사 스크립트는 work/run_checks_04A.py이며 Goal 반복 실행기가 아님 |

신규 회귀는 malformed/version/좌표/레이어집합·중복/반경/name→landUse, all-failed+관찰, body stall/abort/bytes/MIME/UTF-8, TTL/old CDN/nonce, fresh-partial와과거hit분리, 같은key독립consumer, same-keyretry/lateA→B, 검색 모든 의도변경, App현재후보·핀의 knownhit실패보존, 3필수근거partial엔진gate를 포함한다. jsdom 검사는 React DOM 상태·이벤트 통합이며 실제 브라우저 픽셀·네이티브 dialog/지도 동작 검수를 대체하지 않는다.

총괄 독립 검사는 실행자의 회귀와 구분한다. 최종 실제 서버handler→현재parser bridge8건 [기록](../../../evidence/root-server-client-contract-final-04A.json), cache4건 [기록](../../../evidence/root-client-cache-green.json), 주소4043건 [기록](../../../evidence/root-geocode-404-green.json), 실제시계 본문deadline/취소 등5건 [기록](../../../evidence/root-client-body-deadline-final-04A.json), 기존산식·비교12건 [기록](../../../evidence/independent-engine-after-04A.json), G005분류13건 [기록](../../../evidence/root-heritage-after-04A.json)으로 총45개 기대값이 통과했다. 최종 helper는 15,008ms에서 본문stall종료·reader취소·signalabort, parentabort28ms를 보였다. 이는 합성 upstream/로컬 body 검사이고 외부 운영연결 증거가 아니다. 총괄은 제품 diff와 DOM 회귀 검수 후 추가 제품수정 요청 없음을 회신했다.

초기 코드 작성 명령1회가 prototype을 cwd로 사용하면서 prototype 접두경로를 다시 써 새 DOM 테스트 파일 작성을 실패했다. 출력에 FileNotFound를 확인한 뒤 정확한 저장소 cwd에서 파일을 생성하고 실제7파일87건 통과를 별도로 기록했다. 그 실패한 명령의 마지막 기존 테스트 exit0을 새 DOM 검증 성공으로 사용하지 않았다.

## 6. 04B·05·06·09 인계

1. **04B AI:** App에는 selectionRevision, 각 조회 상태에는 queryKey/selectionRevision/requestRevision이 있다. 현재 `lookup`은 done뿐 아니라 loading/partial/error의 stale 관찰일 수 있다. 이를 full input/result와 같이 다뤄야 하며 같은 값으로 돌아옴/같은 key 재시도의 이전 AI run 복원은 별도 단조 AI revision으로 막아야 한다. 이번에는 genai/MemoPanel/AI 부록을 변경하지 않았다. 외부 href http/https allowlist 및 안전표시는 04B 인계의 미완료 항목으로 유지한다.
2. **05 셸·세션:** `LookupRequest<T>={queryKey,selectionRevision,peek,fetch(signal,force),hasObservations}`와 `useOnlineLookup`/`LookupController`를 재사용한다. 상태는 `status(idle/loading/done/partial/error),queryKey,selectionRevision,requestRevision,lookup,message,retry`이며 과거성은 lookup.stale로 구별한다. hook unmount는 cancel을 호출하고 늦은 결과 반영을 막는다. 같은 SPA의 검증된 근거 메모리 캐시는 남는다. sessionStorage에는 입력만 저장하며 HTTP응답/자동 landUse/점수/AI를 넣지 않는다. 새로고침 복원 시 온라인 근거는 null로 시작하고 현재후보 우선·다른핀 최대2후보 동시조회 관리자를 연결한다. 같은key 두핀은 독립적으로 성공할 수 있으나 전송 in-flight 공유는 하지 않아 중복 네트워크를 완전히 제거한 것은 아니다. 500개 observation cache 밖으로 밀린 핀의 메모리 snapshot을 다시 사용할 때는 queryKey 일치를 확인한 peek seed와 stale 표시로 연결해야 한다.
3. **05 큰 번들:** useAppData15개 파일의 성공메모리cache/취소/재시도는 미수정이다. boundedJson은 maxBytes 옵션을 지원하지만 기본2MiB를 전국 번들에 그대로 적용하면 안 된다. 공유promise의 구독자 생명주기와 요청취소는 이 consumer별 controller와 별도 설계해야 한다.
4. **06 결과·보고서:** fresh partial, 이전 관찰+partial, 오류+이전hit, manual가정/auto관찰, fetchedAt/previousFetchedAt와 원자료기준일을 구분해 표기한다. review/reference·다른prohibited E·확인재해15·숫자점수null을 유지한다. 실제4후보PDF 전페이지·390/768/1440·접근성/응답시간 검수는 후속 범위다.
5. **09 배포:** Vite5199 `/api`는 기존 운영 프록시다. 엄격parser가 구형 운영 envelope를 거부하는 것은 예상되는 미배포 상태이며, 이를 숨기려 contract를 완화하지 않는다. 새 서버+클라이언트 같은 커밋의 배포Ready 후 live API본문·주소404·nonce/CDN 재시도·비로그인 화면을 별도로 확인한다. 이번 고정fixture/DOM검사로 운영배포를 완료 표시하지 않는다.

## 7. 파일·소유권

수정 파일 및 SHA-256은 [manifest](../../../evidence/04A-changed-files.json)에 기록한다. 핵심 신규 파일은 shared/zoning, boundedJson, lookupContract, EvidenceCache, LookupController, useOnlineLookup 및 관련 회귀다. 기존 온라인lib/hooks·SiteSearch/SitePanel/MapView/App·types·engine/restriction·pins·재해요약/체크리스트를 연결했다. 데이터/상수/사진·원문은 수정하지 않았다.

04A 제품 파일 소유권을 총괄 독립 검수에 반환한다. 이후 수정은 총괄의 후속 요청 또는 지정된 다음 실행자가 맡는다. 커밋·푸시·PR·배포·대회제출은 실행하지 않았다.
