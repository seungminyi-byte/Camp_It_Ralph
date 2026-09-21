# 08 통합 품질 검수와 좁은 결함 수정

기준 HEAD `9db8ccf4928a865fb55331897bcfccda4b473183`, 작업 브랜치 `codex/ralph-goal-20260921`. 2026-09-21 21시대 KST 검수. 목표 독자는 GS건설 데이터센터 개발·사업검토 실무자이며, ‘여기 DC 돼요?’의 후보 정리→비교→후속 협의 보고 흐름을 검증했다. 08은 로컬 통합 검수다. 기존 Vercel 배포/실제 외부 API 연결, 새 폴더 설치, 발표자료 및 로그 제출 사본의 완료를 대신하지 않는다. 요청 모델 Astra/xhigh의 실제 실행 확인은 총괄 JSONL 감사로 관리한다. 추가 에이전트·커밋·push·PR·배포를 수행하지 않았다.

## 결론과 수정 범위

최종 제품 기준 Vitest 46파일 551검사, Playwright 17시나리오, 주요 화면 axe 26회 Critical/Serious 각각 0, 실제 IAB 세 폭 핵심 업무, 새 A4 PDF 5종 53쪽을 검수했다. 타입·린트·데이터 검증·빌드·diff·보안 패턴 검사도 통과했다. 실제 명령/시각/종료코드/로그 SHA는 작업 루트 `work/evidence/08-gates.json`, 최종 종합은 `08-final-checks.json`에 있다. PDF를 만든 production 파일과 최종 빌드 파일의 전 해시가 같음을 별도로 확인했다.

| 발견 | 재현·영향 | 좁은 수정·재검수 |
|---|---|---|
| G013 lazy 검토 청크 로드 실패 | 메인 CTA 후 ReviewApp JS 하나를 abort하면 공통 nav/main까지 빈 화면. 총괄 독립 red 기록 | App 소유 store/nav를 유지하는 검토 subtree 오류 경계. `store.flush()` 후 ‘새로고침하여 다시 불러오기’로 document reload. lazy 실패 Promise 재mount는 재시도로 사용하지 않음. production 단일 청크 실패→경계/nav→네트워크 정상화→버튼→2핀/면적부족 복원 통과. 총괄은 fixture storage 주입 없이 실제 입력5개·핀1개로 독립 Vite 복구도 통과 |
| 상세 입력 명암 대비 | 768/1440 expanded-inputs에서 `.design-assessment span` #7d837d/배경 #fbefed가 axe serious, 3.44:1 | 글자색 #596459로 변경. 같은 세 폭 26axe 재검수0. red 원본 `08-initial-red/` 보존 |
| 비교 modal Tab 경계 | native dialog 마지막 버튼에서 Tab하면 document.body로 이탈(세 폭) | 보이는 focusable의 첫/마지막 Tab/ShiftTab만 명시 순환. Escape·원래 실행 버튼 focus 복원 유지. E2E 세 폭 및 실제 IAB 확인; 총괄 별도 9동작도 통과 |
| 긴 인쇄 제목 2건 | 이전 06의 후보B h2가 13→14쪽에 분리, 14쪽 하단 용수 제목만 남음 | h2/h3/h4 break-inside/after avoid, 협의 label strong의 break-after avoid만 추가. 고정높이/본문 숨김 없음. 새 PDF의 B제목은14쪽 한 페이지, 용수제목은15쪽 본문 동반. 실행자·총괄 각각 전53쪽 확인 |
| 검수 helper 경로 | `readJsonOrNull('data/data_centers.json')`가 helper base data를 다시 붙여 실제 공개 data_centers를 읽지 못함 | `'data_centers.json'`으로 수정. 실제제품/데이터/엔진의 변경은 없음. 551검사 통과 |

라우터·상태·차트 runtime 라이브러리, 계산식, scoreSite/constants, 사진·원고, 입력/조회/AI/보고서 수명을 새로 설계하지 않았다. 오류복구·접근성·인쇄의 국소 수정과 dev 도구/검수 파일만 추가했다. 저장 실패 환경에서 입력 복원을 보장한다고 표현하지 않으며 오류 UI도 그 한계를 명시한다.

## 환경·합성과 실제의 구분

- macOS arm64, Apple M5 10 logical CPU/24GiB, Node 24.20.0. 명시 PATH는 `/Users/yiseungmin/.nvm/versions/node/v24.20.0/bin`.
- 잠금 devDependency: `@playwright/test` 1.63.0, `@axe-core/playwright` 4.13.0. Chromium 153.0.8010.12 / build1243. 설치 명령 `npm run test:e2e:install`; 실제 CLI 설치 경로/다운로드 계획은 `08-browser-install-plan.log`. 호스트 browser cache만 전제로 하지 않는다.
- 제품은 production `dist`, 테스트 서버는 localhost5208. 기존 총괄 Vite5199/탭2는 건드리지 않았다. 서버는 실제 공개자료 정적 번들과 strict 합성 API 응답을 제공한다. `e2e/fixtures.ts`는 입력/session만 생성하며 계산 엔진 출력을 기대값으로 사용하지 않는다.
- Playwright는 외부 origin 요청을 차단한다. 실제 IAB는 실제 DOM·키보드·지도 클릭을 사용하되 온라인 판정 응답은 동일한 합성 서버다. 지도 타일 표시를 기관 근거 조회 성공으로 해석하지 않았다. IAB에서 저장소/내부 state를 주입하지 않고 입력·버튼으로 조작했다.
- 390×844, 768×1000, 1440×1000. headless Chromium과 실제 Codex IAB를 구분해 기록한다. 모바일 OS 실기기 키보드·iOS/Safari·스크린리더 낭독·프린터 드라이버는 이번 도구로 확인하지 않았다.

## 요구사항별 실제 검사와 결과

| 요구 ID | 검사·판정 | 직접 근거 |
|---|---|---|
| R02/R11/R12/R13/R14 | 기본 shell 보존, 네 경로 direct/reload/back/forward, 입력·핀 보존. 메인 초기 data/API/ReviewApp 청크 요청0. chunk failure 회복 | `workflow.spec.ts`, `recovery.spec.ts`, `08-playwright-final.json`; IAB 12 route-width 관찰; 총괄 chunk recovery green |
| R15/R16/R33 | CTA→읍면동 ArrowDown/Enter·주소·좌표·지도→기본→상세→4핀·5번째 차단·삭제재추가. 담지 않은 현재 E는 비교4핀에 포함되지 않음. 공통·개별 변경 | workflow/recovery/numbers; IAB390 완전동선·지도 클릭의 보고서 출처, 768/1440 각각 새 검토에서 직접 입력→새4핀→비교→보고서 |
| R17 | 상세조건 전부 미입력·AI 요청0으로 기본 보고서 가능 | workflow 및 `empty.pdf`6쪽, 실제 IAB 기본 보고서 |
| R18 | max(30000/2,30000/4/0.5)=15000㎡, 대지10000이면5000부족 | 독립 cases와 기존 engine 회귀551 재실행, numbers/workflow, IAB390/768/1440, numeric/zero/long/AI 새 PDF |
| R19 | 평균 차입1000억원×6%×12/12=60억원. 4/6/8%×6/12/24개월의9셀은20/40/80,30/60/120,40/80/160억원 | numbers 및 PDF 금융표12개 각9셀 독립 추출 대조. IAB 공통6→7%의60→70 확인 |
| R20 | 10000㎡→3025평→10000㎡; 억원 입력/원 내부·표시 일관; 명시0은0원, null은보류 | numbers/workflow, IAB768/1440 왕복 DOM과390 debt0/null 실제조작, zero/empty PDF |
| R21 | 완전 동일 총액2000/2300은 차액300억원. 불완전 비용이나 총액/항목 혼합은 최저·차액 보류 | numbers UI/비교/보고서, numeric PDF의300억원; 기존 compare/engine 회귀 |
| R22/R23/R24 | 근거·기준일·API조회시각 구분, 보고서 첫장 위치/제약/중요미확인/비교/다음확인, 모든pin·9셀·긴2000자 끝 보존 | 새 PDF5종53쪽, `08-pdf-final/checks.json`, manifest/PNG/contact/쪽별검수, 총괄 독립 root-08-pdf-final.json |
| R25 | 빈 검색 결과없음, 잘못된/지원밖 좌표안내, 층수2.5 계산보류, bundle 결측 표시→재시도, null/0 구분 | recovery/numbers/security + 기존 engine/bundle 경계 회귀 |
| R26 | 조회15초 경계 오류→재시도 정상, chunk실패 사용자복구 | lifecycle 실시간 elapsed 로그; 08측정은 요청→오류 확인 총16.364초로 자동화 관찰 overhead 포함. 04A의 실제 body deadline15.008초와 별개. chunk recovery production 통과 |
| R27 | 느린A→B 선택 후 늦은A가 현재좌표/결과를 뒤집지 않음; route unmount 정리 | lifecycle 현재제품 통합 + 기존 SiteSearch/App race 회귀 |
| R28 | 04A strict wire의 잘못된버전/다른좌표/불완전JSON 실패, partial known prohibited hit 유지, 기존 no-hit 재조회실패 때 안전신호 재사용 금지 | lifecycle + security. 10분 TTL 가상시간 후 비선택핀도 점수미산정·보고서 재확인 필요로 재평가 |
| R29/R30/R31 | AI stop/empty/502/65초, 완료·진행중의 변경→되돌림, 같은좌표근거갱신, route unmount 무효화. 늦은응답부활없음. 근거밖999999억원/공급보장·악성HTML/link는부록제외/텍스트안전표시. 기본보고서는유지 | lifecycle + ai-pending 통합, 551회귀의 memo validation. 65초는 가상 브라우저시간이며 실제 wall time65.002초 header-stall 증거는04B를 명시계승. 자유서술의 모든 의미를 검증한다는 주장은 하지 않음 |
| R32 | 세 폭에서 검색→직접 상세조건→4핀→비교→보고서 완료 | Playwright 각폭 처음부터끝까지; actual IAB390 full + 768/1440 새검토 각각 direct 입력·4핀·독립수치 보고서. 단순캡처 성공으로 대체하지 않음 |
| R34/R35 | axe26회 critical0/serious0. 실제 keyboard 검색/list, Tab/ShiftTab 순환·Escape·focus복원, 입력label, 숨긴지도 focus제외, 가로넘침없음 | `08-axe-final/*.json`, summary; IAB focus outline rgb(35,100,124) solid3px/visibleMapFocusables0; screenshots 및 workflow |
| R36 | cold1/warm5 첫결과·조회정착·비교갱신·보고서열기. 메인데이터읽기/조회시작 구분 | `08-performance.json` 원본6회·request path counts·환경·시점정의. 아래 성능 해석 참조 |
| R37/R39 | 공개 API handler의 Request/Response 계약: malformed/duplicate coords·query/buffer/WMS, body declared/actual bytes, timeout/cancel, duplicate409/동시429/rate창, upstream제한 | 이번551전체실행의 `src/test/api/{reliability,wms-boundaries,vworld-boundaries,stream-boundaries,generate,disaster,nearby-sites}`. upstream은 mock. 테스트 서버는 실제handler아님. Vercel 실제연결은09 |
| R40/R41 | 악성 외부명칭을 literal로, unsafe source URL 제외, AI도 안전표시. production에 fixture 활성화/대표비밀패턴 없음 | security 통합 + `08-security-scan.json`: tracked/built187파일·dist34파일,0발견. env/secret 파일이나 값은 읽거나 출력하지 않음. 패턴탐지는 모든비밀형식 부재의수학적증명은아님 |
| R38/R47/R48 | gate로그·재현개발도구·실제출력PDF·구체적수정5건 | `08-gates.json`, `e2e/README.md`, outputs/qa-report-examples, 변경manifest |

독립 기대값은 `ralphathon/validation/independent-cases.json`에 구현 전 고정된 값을 사용했다. `08-e2e-attachments.json`에도 식과9셀을 기록했다. fixture의 serialized session은 입력을 구성하는 데만 사용한다. 계산엔진의 반환값을 기대 결과로 복사하지 않았다.

## 실제 IAB 조작 증거의 범위

`work/evidence/08-iab-observations.json`은 실제 DOM 텍스트·값·레이아웃 관찰이다. 390에서는 읍면동 keyboard/list·주소·좌표·지도, 기본/상세조건,4핀/5번째차단/E제외,삭제재추가,개별대지10000→15000→10000,공통6→7→6%,debt0→빈값→1000,비교/보고서,route왕복을 직접 수행했다. 768/1440은 새 검토로 시작해 좌표입력·5개면적조건·평왕복·차입1000/금리6·새4핀·비교·보고서를 각각 완료했다. 두 폭 보고서의15000/5000/60을 DOM에서 재확인했다. 세 폭 네경로12조합 direct/reload 및핀4/부족5000보존도 확인했다.

중간 자동화 locator 이름 `닫기`/`상세조건 입력` exact나 지원되지 않는 getByRole level옵션, navigation 직후 이른 DOM읽기, 카드마지막과 전체modal마지막의 혼동을 실제DOM확인 후 바로잡았다. 이 도구사용 오류를 제품 결함이나 pass 증거로 세지 않았다. 실제 성공 기록에는 confirmed/new-four 이름을 붙였다. IAB에서 PDF 파일이 생성됐다고 주장하지 않는다. PDF는 별도의 headless Chromium이 실제 제품 인쇄 DOM을 출력했다.

## PDF 새 출력과 전 페이지 검수

`work/evidence/08-pdf-final/`: empty6쪽, numeric9쪽, zero7쪽, long-partial25쪽, ai6쪽. 합계53쪽, contact28장. 이전06 PDF를 완료증거로 복사하지 않고 현재 product dist로 새 출력했다. pypdf/pdfplumber 추출, A4 595.3×841.9pt, 페이지별 text bounds/대체문자/빈쪽, 첫장5요소, 금융표12개×9셀,22개긴텍스트끝표식을 대조했다. DOM snapshot ID/핀개수/AI포함 상태/금융표는 manifest에 있다.

실행자는53쪽 모두 원본PNG/contact를 열어 잘림·겹침·글자·제목/본문 관계를 확인했다. 총괄도 별도로28contact 전부와독립추출검사를 완료했다. 보통 긴 표 행/설명은 다음쪽으로 이어질 수 있으나 누락·빈쪽은 관찰되지 않았다. 긴 제목2건은 위수정으로해결했다. 상세쪽별검수는 `page-review.json`에 있다. 각 PDF/hash는 outputs `qa-report-examples/manifest.json`과 동일하다.

## 성능 측정 해석

원본 `08-performance.json`의 environment/definitions/runs/summary를 기준으로 한다. 대표 입력은 반곡동 좌표36.4967/127.3007, 차입1000억원, 공통금리5.5→7%다. 첫 후보 결과의 면적조건은 비어 있으며, 숫자 대조용15000/5000 검사와 측정 입력을 혼동하지 않는다. cold 앱 준비시간은 navigation→검색 toolbar mount로 별도 측정했다. 첫 결과는 Enter→첫 결과 프레임이며 온라인 조회 완료를 기다리지 않는다. settled는 용도지역·규제구역·재해 상태가 모두 완료된 시점이다.

cold 1회는 새 context의 온라인3종 실제 요청에 각각100ms fixture 지연을 적용했다. warm5회는 같은 context에서 reset→동일 좌표를 입력한 온라인 lookup 캐시 적중으로3종 요청0이다. warm에도 WMS20개와 nearby-sites1개 요청은 발생한다. 이를 path count로 구분하며 settled가 지도/주변 후보의 로딩 완료라는 뜻은 아니다. CPU throttle/네트워크 처리량 제한 없음, 외부 origin 차단, 로컬 loopback production 조건이다. 비교는 금리 변경부터70억원 셀의 다음 프레임까지 자동 비교 열기 동작을 포함한다. 보고서는 고정 미리보기와 인쇄 DOM을 관찰한다.

| 측정 (ms) | cold1 | warm5 중앙값 | warm5 최대 |
|---|---:|---:|---:|
| 검색 후 첫 결과 |39.0|19.4|22.4|
| 판정 근거3종 조회 정착 |194.9|29.4|32.8|
| 공통금리 변경→비교70억원 |81.0|78.4|85.6|
| 보고서 열기 |32.2|31.8|33.4|

비교250ms·보고서500ms의 로컬 목표 안이었고 추가 제품 성능 수정은 필요하지 않았다. 측정 요청 계수는 최초에 모든 API를 합쳐 WMS/주변 후보와 판정3종이 혼합되었으므로 path별 계수를 추가해 재측정한 마지막6회를 최종값으로 사용했다. 실제 운영 응답·공급기관 응답·실무 절감 수치로 확대하지 않는다.

## 재현·최종 Gate·09 인계

`prototype/e2e/README.md`의 명령 순서와 공식 [Playwright configuration](https://playwright.dev/docs/test-configuration), [accessibility testing](https://playwright.dev/docs/accessibility-testing), [page.pdf](https://playwright.dev/docs/api/class-page#page-pdf)를 따랐다. `npm ci`→`npm run test:e2e:install`→`npm run build`→`npm run test:e2e`. `test:e2e`가 fixture를 모듈 load 전에 생성하도록 보강했고, 생성파일2개가 없는 상태에서 실행해 복구 검사2개를 통과했다(`08-bootstrap.json`). 이는 node_modules/browser가 있는 환경의 bootstrap 검사다. 완전히 새 폴더의 설치 성공은09가 직접 검수한다.

최종 gate는 typecheck(E2E TS 포함), lint, Vitest551, data-pack 검증, build, diffcheck, security scan, E2E17 순서이며 모두 exit0. `08-gates.json`은 최종 production 파일의 hash와 PDF 생성 당시 hash가 같음도 기록한다. 스크립트만 수정한 후 fixture bootstrap/성능 재측정과 마지막 lint/diff를 추가했다. 원본 axe26개·성능6회·IAB 기록·PDF와PNG·쪽별 검수·총괄의 독립 검수는 work/evidence에 보존한다.

09 담당자는 다음을 이어서 수행한다.

1. 이 인계 변경의 검토·로컬 커밋 후 새 폴더에서 npm ci/build/test 도구를 재현한다.
2. 현재 strict API 계약을 기존 권한의 Vercel 배포에 반영한다.
3. 비로그인 네 경로 rewrite/direct/reload/back을 확인한다.
4. geocode/zoning/restrictions/disaster/WMS/nearby-sites/generate 실제 본문의 정상·실패를 구분한다.
5. 배포 commit/Ready/alias를 확인한다. localhost 합성 서버의 성공을 live 근거로 사용하지 않는다. 특히 기존5199 개발 프록시는 구형 운영 API라 strict 계약 오류가 날 수 있다.
6. 최종 PR/배포 뒤 public URL과 검증된 기능만10 발표에 사용한다.

추가한 devDependency/lockfile/테스트는 production 활성화 코드가 없다. 비밀키·결제·권한·전역설정·원본사진은 변경하지 않았다. 최종 소유파일 목록·바이트·SHA는 작업 루트 `work/evidence/08-changed-files.sha256.json`으로 반환한다. 최종 인계 후 편집을 중지하고08 서버5208·08 IAB탭을 정리한다.
