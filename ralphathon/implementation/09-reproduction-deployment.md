# 09 새 폴더 재현·운영 배포 검증

## 최종 운영 결과

2026-09-21 KST. [운영 서비스](https://grand-site-dc.vercel.app)의 최종 제품은 **`bb1828450564813d9d91d23142409fa480529106`**다. Actions 성공·Vercel production Ready·alias와 34개 공개 파일의 정확한 바이트 일치를 확인했다. 기본 API 6종의 실제 본문과 비로그인 검토·비교·AI 없는 보고서가 검증됐다. **선택형 AI는 실제 API와 UI 재시도에서 실패**했으며, 생성 성공으로 기록하지 않는다. 실패 안내 뒤 기본 보고서는 정상으로 열렸다.

최종 [운영 A4 PDF](../evidence/09-operation/operating-example.pdf)는 실제 공개 좌표/온라인 응답과 합성 사업조건을 사용한 **11쪽**이다. [정확한 입력·출력기록](../evidence/09-operation/example-input-output.json), [추출 본문](../evidence/09-operation/operating-example.txt), [전 페이지 검수](../evidence/09-operation/pdf-checks.json)를 함께 보존한다. SHA-256은 `a629910fcb85896769ec3466bf8dd765f4d7b8260542564ae8a7e7dc98c49801`다. 08 고정 응답 PDF 5종·53쪽은 이전 빌드의 합성 검수이며 이 운영 출력과 구분한다.

## PR·배포와 실패에서 수정까지

| 단계 | 결과와 정확한 범위 |
|---|---|
| [PR7](https://github.com/seungminyi-byte/Camp_It_Ralph/pull/7) | d042d69 → merge ecf1401. Ready/정적파일은 통과했으나 실제 정상 API7종 즉시502. [실패 본문](../evidence/09-operation/api-initial-failure.json)을 보존하고 운영 성공으로 수락하지 않음. |
| [PR8](https://github.com/seungminyi-byte/Camp_It_Ralph/pull/8) | ca1de63 → merge da8f9f7. 공통 fetch 두 곳의 redirect:error를 manual로 변경. 자동 이동 금지·3xx 취소·오류 비반사 유지. [원인 후보/반례/수정](09-edge-redirect-fix.md). 전후 응답은 개선을 확인하지만 Vercel 내부 예외 메시지는 비어 있어 직접 확정하지 못함. |
| [PR9](https://github.com/seungminyi-byte/Camp_It_Ralph/pull/9) | 135dd13 → merge bb18284. 담은 후보의 출처 표시만 ‘자동 조회 기준’으로 변경. [한 줄 변경 범위](09-report-source-label.md), [독립 빌드 diff](../evidence/09-operation/root-built-diff.json). |

세 PR 모두 현재 작업에 첨부했고 preview 통과·정확 head·merge 직전 원격 prototype 최신 상태를 확인한 뒤 merge commit으로 반영했다. 기존 PR6과 작업 브랜치는 보존했다. [PR/branch 이력](../evidence/09-operation/pr-history.json).

최종 [Actions35605415209](https://github.com/seungminyi-byte/Camp_It_Ralph/actions/runs/35605415209)는 타입·린트·전체47파일563개 테스트·자료·Vercel build/deploy/Ready를 통과했다. 배포ID `dpl_6CJbHBeRLfFJmD6YuuCG5mZG3VXo`, [배포 주소](https://grand-site-g2q949cjx-camp-it-ralph.vercel.app), production alias `grand-site-dc.vercel.app`이다. [기계 판독 배포기록](../evidence/09-operation/deployment.json), [workflow 단계](../evidence/09-operation/workflow.json), [Ready 발췌](../evidence/09-operation/ready-excerpt.txt), [정적34파일 해시](../evidence/09-operation/public-static-hashes.json). 인증을 포함한 전체 CI 로그는 저장소에 이관하지 않았다.

## 실제 API 본문과 한계

아래 7종 소량 직접 호출은 **22:18~22:19 KST, da8f9f7 배포**에서 수행했다. 최종 bb18284와 handler/helper 10파일이 바이트 동일함을 [소스 연속성](../evidence/09-operation/api-source-continuity.json)으로 확인했다. 이를 최종 버전에서 7종을 새로 호출했다고 바꿔 쓰지 않는다. 최종 비로그인 흐름은 bb18284에서 주소·좌표 조회를 다시 수행했고, PDF의 조회시각은 **22:27 KST**다.

| API | 실제 결과 | 의미와 제한 |
|---|---|---|
| geocode | JSON200, 시청대로180 → 보람동 좌표 | 실제 주소·좌표·version·fetchedAt 확인. 합성 반곡동 좌표 예시와 위치가 다름. |
| zoning | JSON200, 자연녹지지역1건, 4계층 조회 | complete=true, failed=[], 좌표/버전/시각 유효. 법적 건축 가능 확정 아님. |
| restrictions | JSON200, 6조회, hits0 | complete=true, failed=[]. 조회 범위 미해당이며 모든 법적 규제 없음은 아님. |
| disaster | JSON200, LT_C_UP201, hits0 | complete=true, failed=[]. 조회 지정구역 미해당이며 재해 안전 보장 아님. |
| nearby-sites | JSON200, 후보3, searchedTiles1 | truncated=true이므로 부분 탐색. 15km 전체 조사 완료·권리/매물 확인으로 쓰지 않음. |
| wms | WMS1.3.0 image/png200 | PNG256×256 실제 decode, 비투명 픽셀65008. 최초 점검자의1.1.1 요청은502 UPSTREAM_INVALID였고 별도 보존. 제품은1.3.0을 사용함. |
| generate | HTTP200이지만 `## ERROR / UPSTREAM_UNAVAILABLE` | 오류 본문31bytes. 생성 성공 아님. 실제 UI 한 번도 실패 안내로 종료했고 기본 보고서는 사용 가능. |

[전체 응답·SHA·계약](../evidence/09-operation/api-results.json), [첫 WMS1.1.1 오류 포함 원기록](../evidence/09-operation/api-first-after-redirect.json), [WMS 변형 비교](../evidence/09-operation/wms-variants.json), [PNG](../evidence/09-operation/wms.png), [AI 실제 오류 본문](../evidence/09-operation/generate.txt), [실제 IAB 실패 후 기본보고서](../evidence/09-operation/iab-ai-failure.json). 잘못된 좌표·빈 AI 입력은400 BAD_REQUEST/no-store였고 오류 원문이나 키를 반사하지 않았다.

공식 공개 OpenRouter 목록에서 whitelist4개가 존재하고 prompt/completion 가격이0인 점은 [root 조회](../evidence/09-operation/root-openrouter-public-models.json)로 확인했다. 모델 삭제·유료 전환을 실패 원인으로 주장할 근거는 없다. SSE 안의 공급자 오류를 확인했으나 세부 원인은 미확인이다. 키 값 읽기·모델 교체·권한 확대·유료 호출은 하지 않았다.

## 비로그인 UI와 새 운영 PDF

최종 제품 bb18284에서 세션/인증/저장 상태를 가져오지 않은 새 Chromium context로 4경로 직접 열기·새로고침, 실제 주소/좌표 조회, 빈 입력의 AI 없는 보고서, 수치 입력,2후보 담기/비교,프로젝트 소개 경로와 back·reload 복원,없는 API/asset/data의404를 확인했다. 합성 API route는0개이며16검사 통과·미처리 페이지 오류0이다. [실제 응답 포함 검사](../evidence/09-operation/browser-results.json), [비교 화면](../evidence/09-operation/comparison.png), [root 최종 IAB](../evidence/09-operation/root-iab-final-label.json). 검수 스크립트가 최초 담기를 secondary 버튼으로 잘못 지정한 실패는 [원기록](../evidence/09-operation/browser-selector-failure.json)으로 보존했고, 제품의 primary 버튼을 사용하도록 스크립트만 고쳤다.

첫 후보36.4967,127.3007에는 연면적30000㎡/용적률200%/건폐율50%/4층/대지10000㎡/평균차입1000억원/가운데금리6%/12개월을 넣었다. 두 번째36.4977,127.3007의 부지별 입력은 비워 두어 계산 보류를 확인했다. 보고서에 현재후보 최소대지15000㎡·부족5000㎡·금융60억원, 두번째후보 계산보류가 각각 유지된다. 금융 표3개27셀은18숫자셀을 독립 계산하고9미입력셀 보류를 확인했다. 사업비 항목은 모두 미입력으로 합계/차액 보류다. AI는 호출하지 않고 출력했다.

11쪽 전체를 Poppler110dpi로 렌더해 글리프·표·페이지 구분·출처·각 페이지 번호·잘림을 확인했다. 자동12항목은 A4/본문 경계/첫장5항목/15000·5000·60/AI없음/새출처문구/미입력/조회시각/독립금융을 통과했다. 이전 문구의 운영 PDF11쪽(SHA14b39f99…)과 그 검수는 로컬 before-label 기록으로 보존했다.

## 새 폴더 재현 기록 — 단계 A


2026-09-21 KST. 제품 HEAD `8ebad19540cd38eca1c33be726734df9a9f5eee8`를 새 폴더에 `git clone --no-local`로 복제해 설치·빌드·실행을 검증했다. Node24.20.0, Python3.12.14, macOS arm64. 새 `node_modules`와 별도 비어 있던 Playwright 브라우저 경로를 사용했으며 `.env`·`.vercel`·브라우저 세션을 복사하지 않았다. 이 절은 08 제품과 문서를 검수하던 배포 전 단계의 기록이다. 현재 운영 상태는 위 최종 결과를 따른다.

| 검사 | 결과 | 직접 근거 |
|---|---|---|
| clone/버전/설치 | 성공, 모든 종료0 | [명령·시각·종료·해시](../evidence/09-reproduction/results.json) |
| 타입·린트·Vitest·자료·빌드 | 모두 종료0, Vitest46파일551개 | [전체 테스트](../evidence/09-reproduction/vitest.log), [데이터](../evidence/09-reproduction/data.log), [빌드](../evidence/09-reproduction/build.log) |
| 새 Chromium 설치 | 다운로드 성공, 별도 캐시 | [설치](../evidence/09-reproduction/chromium-install.log) |
| production dist 합성 통합검사 | Playwright17개 통과 | [E2E](../evidence/09-reproduction/e2e.log) |
| 실제 브라우저 실행 | 메인 CTA→검토 앱, 자료 로드·검색창·빈후보0 확인 | [관찰](../evidence/09-reproduction/browser-start.json) |
| 이동 가능한 근거 | 기존 외부링크41개의 선별 사본/원본해시와 경로치환 | [이관 manifest](../evidence/transfer-manifest.json) |

이 E2E의 온라인 정상·실패는 **합성 응답**이다. 5209 개발화면 `/api`는 당시 구형 운영 배포로 전달되므로 이 단계에서 신규 API 성공을 주장하지 않는다. 서버5208은 E2E가 시작·종료하고 실제 화면 확인은 별도5209를 사용했다. 기존 root5199/탭2를 건드리지 않았다. 단계A 문서 커밋 d042d69의 새 clone에서 79파일과 87개 직접 local 링크를 확인했다. 최종 제품 커밋135dd13까지 해당 clone을 갱신하고 아래 최종 인계 파일을 복사해 상대링크를 재확인했다. 최종 문서 사본은 커밋 전 검수 대상이며 커밋 완료로 주장하지 않는다.

## 사용·재사용

- [새 폴더 실행](../../docs/RUNNING.md): 일반 Node24/Python3.12, 설치·전체검사·실행·Playwright 브라우저·고정5208 서버·PDF 명령·종료, 운영 연결 경계.
- [합성 예제 입력](../../docs/EXAMPLE_INPUT.md): 공개좌표와15,000㎡/5,000㎡/60억원 독립기대값, 미입력/0·비용차액의 경계.
- [책임별 구조와 재사용](../../docs/ARCHITECTURE_REUSE.md): 기준66e310b 대비 실제 제품152파일 diff, 계산/자료/유효기능 계승,03~08 변경,공개 서비스/프로젝트 독립 구현 표.
- [08 전체 품질 검수](08-integration-quality.md): 세폭 업무·26axe·5PDF53쪽 등 기존 로컬 검수. 08 기존 성능은1후보 조건이다. [총괄의 별도4후보 성능](../evidence/checks/root-08-four-pin-performance.json)은 같은8ebad19 dist·UI입력으로4핀을 구성해6회 모두 비교70억원셀4개/보고서후보상세4개를 확인했다. warm5 비교중앙98.9/최대105.5ms, 보고서36.4/38.6ms이며 cold조회12건/warm각0건이다. 로컬합성응답·CPU격리없음·동일호스트다른작업동시가능 조건으로 운영속도·실무절감과 구분한다.


## 인계와 남은 경계

최종 사용자는 [RUNNING](../../docs/RUNNING.md)과 [예제 입력](../../docs/EXAMPLE_INPUT.md)을 따른다. 이관된 [선별 증거 manifest](../evidence/09-operation/manifest.json)는 공개 응답·합성 입력·검수 요약을 포함하며 개인 세션 JSONL이나 인증 원본은 포함하지 않는다. 저장소 제어문서의 과거 `work/evidence` 경로는 로컬 감사 이력이며 새 실행의 필수 경로가 아니다.

로컬 작업 브랜치 HEAD는135dd1363b4ddb42baacf833907ec6079f0fd4ce, 원격prototype은bb1828450564813d9d91d23142409fa480529106이며 커밋 트리는 같다. 이 문서/선별 근거는 root 검토 후 별도 문서 커밋으로 반영할 인계 대상이다. root 소유 제어문서는 별도 검토한다. 원본 사진·private 설정·기존PR6·원본 작업폴더를 보존했고 추가 결제/권한·파괴 작업·대회 제출은 수행하지 않았다. 발표/원시로그 제출사본은10/11단계다.
