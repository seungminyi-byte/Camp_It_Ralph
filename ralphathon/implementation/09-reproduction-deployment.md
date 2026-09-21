# 09 새 폴더 재현·운영 배포 검증

## 현재 상태 — 단계 A

2026-09-21 KST. 제품 HEAD `8ebad19540cd38eca1c33be726734df9a9f5eee8`를 새 폴더에 `git clone --no-local`로 복제해 설치·빌드·실행을 검증했다. Node24.20.0, Python3.12.14, macOS arm64. 새 `node_modules`와 별도 비어 있던 Playwright 브라우저 경로를 사용했으며 `.env`·`.vercel`·브라우저 세션을 복사하지 않았다. 소스는 08 검수 제품과 같고 09의 실행 문서는 별도 검토 중이다. GitHub 원격을 수정하지 않은 단계다.

| 검사 | 결과 | 직접 근거 |
|---|---|---|
| clone/버전/설치 | 성공, 모든 종료0 | [명령·시각·종료·해시](../evidence/09-reproduction/results.json) |
| 타입·린트·Vitest·자료·빌드 | 모두 종료0, Vitest46파일551개 | [전체 테스트](../evidence/09-reproduction/vitest.log), [데이터](../evidence/09-reproduction/data.log), [빌드](../evidence/09-reproduction/build.log) |
| 새 Chromium 설치 | 다운로드 성공, 별도 캐시 | [설치](../evidence/09-reproduction/chromium-install.log) |
| production dist 합성 통합검사 | Playwright17개 통과 | [E2E](../evidence/09-reproduction/e2e.log) |
| 실제 브라우저 실행 | 메인 CTA→검토 앱, 자료 로드·검색창·빈후보0 확인 | [관찰](../evidence/09-reproduction/browser-start.json) |
| 이동 가능한 근거 | 기존 외부링크41개의 선별 사본/원본해시와 경로치환 | [이관 manifest](../evidence/transfer-manifest.json) |

이 E2E의 온라인 정상·실패는 **합성 응답**이다. 5209 개발화면 `/api`는 당시 구형 운영 배포로 전달되므로 이 단계에서 신규 API 성공을 주장하지 않는다. 서버5208은 E2E가 시작·종료하고 실제 화면 확인은 별도5209를 사용했다. 기존 root5199/탭2를 건드리지 않았다. 단계A의 폴더는 08 커밋 제품 재현이며 최종 root 문서 커밋 뒤 새 clone에 최종문서·링크도 확인한다.

## 사용·재사용

- [새 폴더 실행](../../docs/RUNNING.md): 일반 Node24/Python3.12, 설치·전체검사·실행·Playwright 브라우저·고정5208 서버·PDF 명령·종료, 운영 연결 경계.
- [합성 예제 입력](../../docs/EXAMPLE_INPUT.md): 공개좌표와15,000㎡/5,000㎡/60억원 독립기대값, 미입력/0·비용차액의 경계.
- [책임별 구조와 재사용](../../docs/ARCHITECTURE_REUSE.md): 기준66e310b 대비 실제 제품152파일 diff, 계산/자료/유효기능 계승,03~08 변경,공개 서비스/프로젝트 독립 구현 표.
- [08 전체 품질 검수](08-integration-quality.md): 세폭 업무·26axe·5PDF53쪽 등 기존 로컬 검수. 08 기존 성능은1후보 조건이다. [총괄의 별도4후보 성능](../evidence/checks/root-08-four-pin-performance.json)은 같은8ebad19 dist·UI입력으로4핀을 구성해6회 모두 비교70억원셀4개/보고서후보상세4개를 확인했다. warm5 비교중앙98.9/최대105.5ms, 보고서36.4/38.6ms이며 cold조회12건/warm각0건이다. 로컬합성응답·CPU격리없음·동일호스트다른작업동시가능 조건으로 운영속도·실무절감과 구분한다.

## 단계 B에서 확인할 것

root가 단계A 파일과 제어문서를 검토·커밋한 다음 이미 승인된 push→PR→현재 작업 첨부→PR반영→기존 Actions/VercelReady/alias를 수행한다. 원격prototype은 사전조회에서66e310b와 같고 저장소private·기존secret이름만 확인했다. 배포 커밋·실제 배포ID·URL·Ready·운영assets/본문을 연결한다. 기존HTTP200으로 새배포를 입증하지 않는다.

geocode/zoning/restrictions/disaster/nearby-sites/wms/generate7개 실제응답의 정상/부분/실패,버전·좌표·조회시각·queried/failed/complete/hit,PNG픽셀decode,AI빈값/오류를 구분한다. 새 비로그인 context에서네경로direct/reload/back과기본검토·입력·담기/비교·AI없는보고서를확인한다. 합성사업조건과실제공개좌표/온라인응답으로새A4PDF를출력하고전페이지검수한다. 해당 운영검증은 **아직 미완료**다.

신규권한/결제·비밀값조회·저장소공개전환·원본변경·파괴작업·대회최종제출은 수행하지 않는다. 발표자료/실제JSONL제출사본은 다음10/11단계다.
