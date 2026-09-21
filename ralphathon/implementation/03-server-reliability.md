# 03 서버/API 신뢰성 구현 및 검증

작성·검수 시점: 2026-09-21 18:08 KST. 마감 2026-09-22 10:00 KST까지 약15시간52분. 실행: 총괄이 지정한 gpt-6-astra/xhigh 하위 에이전트 1개, 추가 위임 없음. 품질 우선 선택을 계승했으며 모델 성능 실측을 수행한 것은 아니다.

이 묶음은 잘못된 외부 응답을 ‘조회 완료·제약 없음’으로 바꾸는 서버 경계와 무한 본문 대기, 공개 API의 과도한 입력, 오류 원문 반사를 수정했다. 코드와 고정 upstream 회귀 검증을 완료했다. 실제 서비스 연결·배포·클라이언트 반영·전체 Goal 완료와 구분한다. 총괄의 독립 검수에서 추가 발견한 nearby 좌표 결함을 후속 회귀로 고친 상태다. 최종 소유권 반환 후 총괄 인계를 따른다.

## 1. 범위와 보존

- 작업 저장소: `/Users/yiseungmin/Documents/Codex/2026-09-21/camp-it-ralph-goal/work/Camp_It_Ralph`, 브랜치 `codex/ralph-goal-20260921`, 시작 HEAD `66e310b9f889b9dca4de5cd1b79e5830d69063b1`.
- 변경: `prototype/api`의 기존 helper/7개 endpoint, 새 `_http.ts`·`_generation.ts`, `prototype/src/test/api`의 회귀 검사, 이 보고서.
- UI·엔진·계산상수·데이터·팀사진·라우팅·잠금파일·package.json은 수정하지 않았다. 기존 저장소 AGENTS.md를 보존했다. 타입파일 확장은 필요하지 않았다.
- 신규 설치·실제 AI/VWorld API 호출·커밋·푸시·PR·배포·설정 변경 없음. 공개 VWorld/OpenRouter/Edge 문서는 읽었다.
- VWorld 6개 route의 `runtime: edge, regions: ['icn1']`, generate의 기존 `runtime: edge`를 유지했다.

## 2. 선행 실패와 수정

먼저 `reliability.test.ts`를 작성하고 기존 구현으로 실행했다. 47건 중 **35실패·12통과, exit1**이었다. `server-regression-red.log`에 malformed JSON/null prompt 예외, object/number/blank prompt의 외부호출, OK+features 누락의 정상 미해당 처리, partial zoning의 완전 캐시, geocode 인증오류→404, provider 키가 든 오류본문 반사, 본문 stall/취소와 입력·method 경계를 기록했다.

첫 수정 후 테스트 fetch mock가 동기 Response를 반환해 Promise 계약을 따르지 않는 문제를 바로잡았다. 실제 fetch와 같은 Promise 응답으로 바꾸었으며 실패를 없애기 위한 제품 기대값 변경은 하지 않았다. 첫 API 통과는4파일64건이었다. 이후 스트림·PNG·시간제한·취소·분당제한·부분조회 회귀를 확장했다.

총괄 검수에서 지적한 pagination과 SSE 종결도 추가 선행회귀를 만들었다. `server-review-additions-red.log`는 choice.error 무시, error/tool_calls 분류, 문화유산5건 포화 응답의 complete=true에 대해 **4실패·50통과, exit1**이다. `server-pagination-red.log`는 공식 pagination 메타데이터를 반영하기 전의 **5실패·25통과, exit1**이다. 해당 실패들을 수정했다.

기존 generate 테스트는 현재 공개 계약에 맞춰 요청 `application/json`, upstream `text/event-stream`을 명시하고, 무제한 임의 model 허용 기대값을 승인된 무료 router `openrouter/free`로 바꾸었다. 기존 disaster 오류 문자열 기대값은 provider status 원문 대신 `UPSTREAM_UNAVAILABLE`로 변경했다. 기존 engine/계산 기대값은 바꾸지 않았다.

## 3. 구현 계약

### 입력·오류

| API | 메서드 및 입력 | 실패 경계 |
|---|---|---|
| generate | POST·application/json; 실제/선언 body96KiB; prompt 문자열·trim 비어 있지 않음·최대20,000 UTF-16 코드단위 | malformed400, 초과413, type415. 키 확인과 외부 호출보다 먼저 검증 |
| zoning/restrictions/disaster/nearby-sites | GET; 필수 finite lat/lng; lat33~39.5/lng124~132 | 결측·빈 문자열·범위초과·중복 query400 |
| restrictions | buffer 기본500, 명시값 정수0~1000 | 빈 값·소수·중복·범위초과400;0이면 heritage buffer query 없음 |
| geocode | GET; q trim 후1~200자 | 중복·빈 값·과대400; 명시적 NOT_FOUND만 ROAD→PARCEL→404 |
| wms | GET·GetMap; 기존9개 layer 최대4개·중복 금지;3개 CRS;1~512px;PNG만 | query 이름 대소문자 중복, CRS/SRS 동시 사용, bbox4개·순서·범위·크기·버전·format 오류400 |

모든405는 `Allow`, 모든 오류는 `Cache-Control: no-store`, 제한된 안전 코드와 `nosniff`를 반환한다. query 전체4096자, 값2000자, 제어문자를 제한한다. 클라이언트가 upstream URL을 지정하는 경로가 없으며 upstream origin/path를 고정하고 redirect를 따라가지 않는다. env 키/등록 domain이 잘못되면 값을 보여주지 않고 `SERVER_UNAVAILABLE`이다.

provider HTTP 오류·HTML/XML 원문은 읽어서 반환하지 않고 즉시 본문을 취소한다. 다른 예외도 URL/본문/credential/stack을 반사하지 않는다. 코드에 provider 원문을 출력하는 console 로그를 추가하지 않았다. fake credential을 넣은 응답·console spy 회귀가 포함된다.

### VWorld shape와 부분조회

- 최상위 record → response object → status를 검증한다. `NOT_FOUND` 또는 `OK`+명시적 유효 features[]만 결과로 인정한다. OK에서 features가 없거나 null/객체면 실패다. JSON은 bounded byte를 읽은 뒤 strict UTF-8로 해석한다.
- feature와 properties는 object여야 한다. 속성 수128개·키128자·문자열1000자·finite 숫자, 이름 필드의 string/null을 검사한다. 잘못된 feature를 filter로 버리고 complete로 만들지 않는다. 유효한 빈 properties object의 feature는 **이름 미상의 적중**으로 남는다.
- zoning/restrictions는 query별 유효 hit를 보존하고 `queried`, `failed`, `complete`를 반환한다. 모든 query가 실패해 관찰된 hit가 없으면502다. 일부 성공 또는 범위 미완료는200이지만 `complete=false`와 no-store다. 이때 found=false는 완전한 미해당이 아니다.
- zoning/restrictions 좌표4자리, disaster/nearby5자리 반올림을 유지했다. `coordinate`, `fetchedAt`(ISO 접속완료시각), `version: 'vworld-v2-20260921'`를 추가했고 restrictions는 `bufferM`도 준다. fetchedAt은 원자료 기준일이 아니다. 반올림 좌표는 필지 경계 판독 정밀도 보장이 아니다.
- disaster도 `queried/failed/complete`를 추가했다. 유효한 적중이 있어도 범위 미완료이면 hits와 found=true를 보존하고 complete=false/no-store다.
- GetFeature의 기존 size5(zoning/restrictions),10(disaster),1000(nearby)를 늘리지 않았다. **개수가 size에 닿으면** 전체가 그 수인지 알 수 없어 보수적으로 미완료로 처리한다. 정확히 size만 존재해도 미완료가 될 수 있다. 잘린 query는 failed 목록에 포함하고 관찰한 hit는 유지한다.
- 공식 가이드의 record.total/current, sibling page.total/current/size가 있으면 현재 features 수·첫 페이지·요청 size와 대조한다. 숫자와 숫자로만 구성된 문자열을 허용하며, 불일치/잘못된 metadata는 적중을 지우지 않고 completeness를 보류한다. metadata가 없는 유효 features[]의 기존 계약은 유지한다.
- nearby는 기존25개 이하 staged tile 조회와 추천·면적 산식을 유지한다. 잘못된 feature/geometry를 정상 빈 후보로 필터링하지 않는다. 한 tile이 실패하면 전체 추천을502/no-store로 보류하고 나머지 요청을 중단한다. 결과범위의 pagination 미완료는 기존 truncated로 표시한다. 전국/반경전체 전수조회로 확대하지 않는다.

### 요청 시간·취소·크기

`Operation`이 요청 시작부터 본문 완료까지 deadline과 parent signal을 보유한다. fetch headers 시점에 타이머를 해제하지 않는다. read 자체를 abort와 race하여 mock처럼 signal을 따르지 않는 transport도 서버 함수가 무한 대기하지 않는다. 성공·실패·취소 경로에서 timer/listener를 정리한다. reader.cancel이 영원히 끝나지 않아도 그 Promise를 무제한 기다리지 않는다.

| 경로 | 전체 deadline | 본문 한도 |
|---|---:|---:|
| VWorld 전 경로 |12초, ROAD→PARCEL 및 staged/fan-out 전체 공유 |각 JSON/PNG2MiB |
| generate |입력 읽기부터 전체55초, headers 후 매 read idle15초 |입력96KiB, 수신 SSE1MiB, 반환 text/error 합계128KiB |

반환 text는 안전 오류 마커 공간128bytes를 남기므로 일반 출력의 실제 최대는128KiB보다128bytes 작다. SSE keepalive가 와도55초 전체 한도는 연장되지 않는다. `req.signal`과 downstream cancel은 upstream abort와 reader 취소로 이어진다. SHA-256 digest와 active slot도 요청 종료시 정리한다.

WMS는 MIME image/png뿐 아니라 signature, IHDR 크기/색상/bit depth, 각 chunk CRC/길이, IDAT, 마지막 IEND를 확인한 바이트만 반환한다. 이 검사는 **PNG 컨테이너 검증**이며 압축 픽셀 전체의 decode 검증이 아니다. Edge 공식 지원 API 목록에서 DecompressionStream을 확인하지 못해 런타임 의존성을 임의 추가하지 않았다. 실제 타일 decoding/display는 배포 smoke에서 확인한다. HTML/XML/SVG 및 PNG라고 거짓 표기한 텍스트는502로 차단한다.

### AI 완료·무료 선택·보조 남용 제한

- JSON shape·string delta.content를 검사하고 malformed frame을 조용히 건너뛰지 않는다. 부분 UTF-8·CRLF·comment·role-only·usage frame을 처리한다.
- top-level/choice.error 및 finish_reason=error는 `UPSTREAM_UNAVAILABLE`, length/content_filter/tool_calls는 `UPSTREAM_INCOMPLETE`, 기타 미지원 종결은 `UPSTREAM_INVALID`다. finish_reason stop을 반복하는 최종 usage frame을 허용한다.
- `[DONE]`이 있어도 유효 text가 없으면 `UPSTREAM_EMPTY`; text 후 DONE 없는 EOF는 `UPSTREAM_INCOMPLETE`다. 호환성을 위해 finish_reason의 누락/null 자체는 허용하되 실제 `[DONE]`을 요구한다. 구조 완료는 사실 검증 완료가 아니다.
- 스트리밍이 시작된 뒤에는 HTTP 상태를 바꿀 수 없어 `\n## ERROR\nSAFE_CODE\n`로 종료한다. 빈 응답/부분/timeout/cancel/oversize를 이 코드로 구분한다. UI는 ERROR를 정상 의견으로 승인하면 안 된다.
- 기존 무료 기본3개를 유지하고 `openrouter/free`를 추가로 허용한다. 승인목록 밖 서버 model은503, 클라이언트 model 필드는 사용하지 않는다. 유료 자동 fallback·새 공급자는 없다. 모델의 현행 실제 가용성은 이 mocked 검사로 검증되지 않는다.
- model+전체 prompt SHA-256별 in-flight 중복409. 인스턴스당 동시2개, rolling60초당 승인12회, active55초TTL. 거절시 외부호출0. TTL 정리는 다음 요청시 수행해 별도 영구 timer를 만들지 않고 map≤2·starts≤12를 유지한다. 완료 본문을 다른 요청에 공유/재생하지 않는다.
- 이 제어는 **한 인스턴스의 보조 제어**다. cold start·여러 인스턴스/지역·다른 prompt를 쓰는 분산 요청을 전역 차단하지 못한다. 인증/사용자별 제한이 아니다. 공공 GET 조회 반복과 중복에는 새 전역 제한을 추가하지 않았고 기존 캐시·입력·fan-out·deadline·body cap만 적용한다. 새 백엔드/계정/요금/방화벽을 도입하지 않았다.

## 4. 최종 검증 결과와 재현

검증 환경 Node24.20.0, 기존 Vitest4.1.11. 외부 호출은 mock으로 대체했다. 모든 아래 명령의 cwd는 `/Users/yiseungmin/Documents/Codex/2026-09-21/camp-it-ralph-goal/work/Camp_It_Ralph/prototype`이며 PATH 앞에 `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin`을 둔다. 최종 실행18:07:57~18:08:01 KST, 정확한 argv/시각/소요시간/exit code는 `ROOT/work/evidence/server-verification.json`이다. 여기서 ROOT는 이 Goal의 최상위 디렉터리다.

| 명령 | exit | 확인 결과 | ROOT/work/evidence 로그 |
|---|---:|---|---|
| `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin/npm run typecheck` |0|앱·API·scripts strict 검사 통과|server-verified-typecheck.log |
| `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin/npm run lint` |0|경고 없는 통과|server-verified-lint.log |
| `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin/node node_modules/vitest/vitest.mjs run src/test/api` |0|**7파일157테스트 통과**|server-verified-api.log |
| `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin/node node_modules/vitest/vitest.mjs run` |0|**23파일306테스트 통과**|server-verified-vitest.log |
| `git diff --check` |0|공백 오류 없음|server-verified-diffcheck.log |

최초166개에서 최종306개로140건 증가했다. 최종 API157개 중 기존17개를 포함한다. 검증 재현 보조 스크립트는 `ROOT/work/verify_server_package.py`다. 프로덕션 build와 데이터 검증은 이 서버 전용 묶음에서 다시 실행하지 않았고 전체 통합 단계에 남아 있다.

중간 실패도 보존했다: `server-typecheck-first.log`는 앱의 erasableSyntaxOnly와 parameter-property 충돌, `server-typecheck-final.log`는 test mock tuple 타입 오류다. 생성자 explicit field와 테스트 인수 타입으로 수정 후 최종 typecheck0을 확인했다. `server-lint.log`의 의도적 제어문자 regex 경고도 명시적 charCode 검사로 수정했다. 중간 API 로그의 nearby sibling cancel assertion은 취소 후 한 microtask만 기다린 검사 문제였고 event loop 한 번을 기다려 실제 cancel7회를 확인했다. 해당 실패 로그를 최종 통과로 재표시하지 않는다.

## 5. 공식 자료와 확인 수준

- [VWorld 도시지역 2D Data API2.0 상세 가이드](https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=uq111): 공개 문서를 curl로 직접 저장·본문 검수했다. `server-vworld-uq111-guide.html` 약794~834행에서 상태, record와 page의 의미를 확인했다. SHA-256 `29d1852f748c53c371d5bee53f5b40c6a6269d1a85f4ff8e80a8d369ff72a874`. 먼저 web 도구의 s001/s002 fetch는 timeout이었고, 이후 공개 목록의 실제 svcIde 링크를 확인한 curl 조회는 성공했다. 문서 확보와 실제 API 호출을 구분한다.
- [OpenRouter API Reference](https://openrouter.ai/docs/api_reference/overview), [Streaming](https://openrouter.ai/docs/api_reference/streaming): StreamingChoice.error, normalized finish reasons, stop을 반복하는 최종 usage frame과 comment를 확인했다. 무료 모델 현행 가용성·운영키 상태를 확인한 것은 아니다.
- [Edge Runtime 지원 API](https://edge-runtime.vercel.app/features/available-apis): 이번 변경은 제공 Web APIs만 사용한다. Node-only 이미지 decoder/신규 패키지를 추가하지 않았다.

## 6. 다음 순차 작업 인계

1. **클라이언트 검증:** zoning뿐 아니라 disaster의 `complete=false`도 엔진·UI·캐시까지 전달해야 한다. 모든 query 목록/failed 부분집합/complete 일관성, coordinate4·5자리 및 restrictions.bufferM, version/fetchedAt을 확인한다. 오래된 완료 응답과 새 partial 응답을 섞지 않는다. failed는 네트워크 오류뿐 아니라 조회범위 미완료도 포함한다.
2. **AI UI:** HTTP200 text에 `## ERROR`가 있을 수 있다. 실패 코드를 구분하고 부분 의견을 보고서에 승인하지 않는다. UI stop/문맥 변경·이전 run·fallback 교체 회귀는 다음 묶음이다. 새 서버 deadline은 클라이언트의65초 budget보다 짧다.
3. **예산/입력:** 대표 prompt는 기존20,000자 안이지만 최대 협의 note를 포함한 prompt builder 예산은 이 묶음 범위 밖이다. 반환413/400이 사용자 입력을 잃게 해서는 안 된다.
4. **배포 smoke:** VWorld 실제 MIME(application/json), name/property shape·pagination 값, PNG decoding, geocode ROAD/PARCEL, partial 표시를 현재 서울 runtime에서 확인한다. 실측 크기가2MiB를 넘으면 자료범위와 상한을 검토하며 무조건 해제하지 않는다. 무료 AI의 첫 body/read 지연과55초/15초·finish reason/SSE MIME을 실호출로 검증한다. provider 실패를 가짜 성공으로 대체하지 않는다.
5. **독립 검수:** 총괄의 기존3probe 재실행, diff·새파일·비밀점검, 정책 분류 및 metadata 일관성 검토 후 다음 에이전트로 인계한다. 이 보고서 작성 후 코드 소유를 총괄에게 반환한다.


## 7. 총괄 독립 검수에서 발견한 nearby 좌표 결함 후속 수정

18:05 KST 총괄은 원래10개 probe와 실제12,002ms body deadline 및 API146건 재실행 통과를 알렸으나, 별도 probe에서 위도397.53의 EPSG:4326 도형이 HTTP200으로 반환되고 약39,046㎡·4.25km의 인근 후보가 되는 새 결함을 재현했다. 삼각함수의 주기 때문에 범위초과 위도가 가짜 근거리로 계산되었다. 원본 증거는 `ROOT/work/evidence/root-nearby-invalid-red.json`, 재현 스크립트는 `ROOT/work/root-nearby-invalid-probe.mts`다. 이 추가 결함을 최초 통과 결과로 덮지 않는다.

제품 수정 전에 `nearby-sites.test.ts`에11건을 추가해 기존3건 포함14건을 실행했다. 위도상한/하한·경도범위·미닫힘·2개뿐인 꼭짓점·일직선 퇴화·잘못된 hole/multipolygon·정상/오류 혼합 응답에서 **9실패·5통과(exit1)**를 확인했다(`server-nearby-geometry-red.log`). 수정 후 **14건 전부 통과(exit0)**했다(`server-nearby-geometry-green.log`).

- position은 finite2D/3D이며 longitude−180~180, latitude−90~90이어야 한다. 선택점 API의 Korea bbox를 도형의 모든 좌표에 강제하지 않는다.
- 모든 외곽/hole ring은4개 이상 position, 처음/마지막 좌표 일치, 서로 다른 평면 꼭짓점3개 이상, 0이 아닌 signed 면적을 요구한다. 상대좌표 면적 검사는 퇴화 shape 확인용이며 기존 면적·거리·추천 산식과 상수를 바꾸지 않는다.
- 빈 polygon/multipolygon 구성원을 허용하지 않는다. 잘못된 구성원이 하나라도 있으면 해당 upstream 응답을502/no-store/UPSTREAM_INVALID로 처리하고 후보를 만들지 않는다.
- 정상 triangle,3D altitude, 한국밖의 유효 WGS84 도형, hole의 면적차·선택점 포함관계, multipolygon의 면적합·추천을 검증했다. 기존 정상3개 기대값도 유지했다.
- 이 수정은 일반적인 자기교차, hole의 외곽 포함 여부, 서로 겹치는 multipolygon 등 **모든 GIS topology의 완전 검증**이 아니다. 단순한 유효범위·ring·퇴화 경계이며 공식 대장/권리/경계 검토는 여전히 필요하다.

최종 typecheck/lint/API157건/전체306건/diffcheck는 §4의 명령으로 다시 통과했다. 이전 최종146/295 기록과 manifest는 `server-verified-*-before-geometry.log`, `server-verification-before-geometry.json`, `server-file-manifest-before-geometry.json`에 보존했고 현 manifest는 수정본으로 갱신했다. 총괄의 같은 invalid 위도 probe 수정 후 결과 `root-nearby-invalid-green.json`도 HTTP502·UPSTREAM_INVALID를 보여 준다. 추가 실호출·커밋·배포·설정 변경은 없다.
