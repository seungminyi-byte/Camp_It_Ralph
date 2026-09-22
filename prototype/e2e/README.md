# 통합 품질 검수 재현

08 단계는 `npm run build`로 만든 실제 제품 DOM을 검사한다. 별도 테스트 서버가 공개자료 번들과 합성 온라인 API 응답을 공급한다. 실제 Vercel/API 연결 검수는 09 단계이며, 이 서버의 200 응답을 실제 기관 연결 성공으로 사용하지 않는다. 테스트 서버와 fixture는 production import에 포함되지 않는다.

## 준비

Node 24로 `prototype`에서 실행한다. `package-lock.json`의 정확한 개발 의존성은 Playwright 1.63.0, axe-core/playwright 4.13.0이다. 이 검수의 Chromium은 153.0.8010.12 / Playwright build 1243이다.

```sh
npm ci
npm run test:e2e:install
npm run build
npm run test:e2e
```

브라우저 설치는 프로젝트 CLI가 수행한다. 기존 호스트의 캐시가 없어도 `test:e2e:install`로 해당 잠금 버전을 받는다. Linux 환경에서 OS 라이브러리가 추가로 필요하면 Playwright 공식 설치 안내에 따라 별도로 준비한다. 이 검수는 macOS arm64에서 수행했으며 Linux 실행 성공을 주장하지 않는다.

`test:e2e`는 테스트 모듈이 fixture를 읽기 전에 합성 입력 파일을 생성한다. Playwright가 5208 테스트 서버를 시작한다. 로컬에서는 이미 실행 중인 서버를 재사용하므로 해당 포트가 이 프로젝트 서버인지 확인한다. CI에서는 기존 서버를 재사용하지 않는다. 테스트 입력은 공개·가상 값만 사용한다. 실행 결과와 실패 trace/screenshot은 `e2e/artifacts/`에 저장되고 Git에 넣지 않는다.

## 별도 성능·인쇄

```sh
# 첫 터미널: production dist를 제공하는 합성 서버
npm run test:e2e:serve
# 다른 터미널
npm run test:performance
npm run test:pdf
python e2e/inspect-pdf.py e2e/artifacts/pdf --render
node e2e/security-scan.mjs
```

PDF 검사에는 Python의 `pypdf`, `pdfplumber`, 렌더에는 Poppler `pdftoppm`이 필요하다. 도구가 설치된 경로를 PATH에 추가한다. 고정 높이나 텍스트 숨김을 사용하지 않고 실제 제품 `#print-root`와 print CSS를 Chromium A4로 출력한다. 자동 추출 통과 후 생성된 모든 페이지 PNG를 사람이 열어 제목 분리·잘림·겹침을 확인해야 한다. IAB는 실제 업무 동선 확인에 사용하며 IAB의 CDP PDF 기능을 가정하지 않는다.

성능은 production 1440×1000, CPU/네트워크 처리량 제한 없음, loopback 서버, 각 API 요청에 100ms 지연, 외부 요청 차단 조건이다. cold 1회는 새 browser context와 실제 API 요청, warm 5회는 같은 context의 검토 초기화 후 동일 좌표를 재입력한 메모리 캐시 경로다. `apiRequestsByPath`와 `onlineLookupRequests`로 실제 요청 횟수를 구분한다. warm에도 지도 WMS/주변 후보 요청은 발생하지만 판정 근거 3종은 캐시 적중으로 요청0이다. `firstResultMs`는 검색 Enter→첫 결과 DOM/프레임이며 `settledMs`는 용도지역·규제구역·재해 3개 상태 완료→다음 프레임이다. 지도와 주변 후보의 로딩 완료 시간은 아니다. 첫 앱 데이터 준비 시간은 `coldAppReadyMs`로 별도 기록한다. 비교는 공통 금리 입력 이벤트→비교창의 70억원 셀/다음 프레임(자동 비교 열기 동작 포함), 보고서는 열기 클릭→고정 미리보기/인쇄 DOM/다음 프레임이다. 250ms/500ms는 로컬 개선 목표이고 운영 보증·업무 절감 수치가 아니다.

## 주요 검사

- `workflow`: 3폭의 메인 CTA, 읍면동 키보드/주소/좌표, 기본/상세, 4핀·5번째 차단·삭제/재추가, E 제외, 라우트/새로고침/뒤·앞, snapshot 및 지원 밖 위치.
- `numbers`: 독립 기대값 15,000㎡/5,000㎡/60억원·9셀, ㎡/평, 원/억원, 명시 0/미입력, 완전 2,000/2,300 차액300, 불완전·혼합 보류, 공통 변경.
- `lifecycle`, `ai-pending`: strict wire, partial known hit, 이전 no-hit 무효화, 실제15초, 지연역전, 비선택핀10분, AI 빈/실패/중단/195초·변경/되돌림/근거갱신/언마운트. 195초와 TTL은 가상 브라우저 시계이며 실제 wall time은 별도 과거 증거로 구분한다.
- `recovery`: production lazy chunk 하나 실패→shell 유지→명시적 새로고침→저장 후보·조건 복원. React lazy만 다시 mount하는 재시도는 사용하지 않는다.
- `accessibility`: 3폭 주요 상태의 axe 원본과 가로 넘침. keyboard/focus는 workflow 및 실제 IAB에서 별도 검수.
- `security`: 잘못된 core 자료→오류→재시도, 외부 HTML 명칭 literal 표시와 unsafe URL 제외. 실제 API handler의 입력 크기/중복/스트림 경계는 `npm test`의 `src/test/api`가 검증한다. 테스트 서버 자체는 실제 API handler가 아니다.

기대값은 [독립 기대값](independent-cases.json)과 고정 수기 식을 기준으로 한다. fixture 생성은 입력/session만 만들며 계산 엔진의 출력을 기대값으로 복사하지 않는다. 실제 서비스·PDF 확인은 [품질 확인 절차](../../docs/QA.md)를 따른다. 검사 산출물은 Git에서 제외한 `e2e/artifacts/`에 보관한다.
