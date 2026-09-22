# 새 폴더 실행·검증 안내

2026-09-22 실행 안내입니다. 공개 저장소의 코드를 실행하고 검증할 개발자를 위한 문서이며, 운영 서비스는 [여기 DC 돼요?](https://grand-site-dc.vercel.app)입니다. 배포 확인은 아래 6절, 서버 환경변수는 [서버 설정](CONFIGURATION.md)을 따릅니다.

## 1. 준비와 설치

Node.js **24**, npm, Python **3.12**, Git이 필요합니다. macOS arm64에서 검증했으며 다른 OS의 성공을 대신 보증하지 않습니다. API 키·`.env`·`.vercel`·다른 폴더의 `node_modules`·브라우저 세션을 복사하지 않습니다. 현재 공개자료 번들은 저장소에 포함되어 있고 자료 재수집은 필요하지 않습니다.

```sh
git clone --branch prototype https://github.com/seungminyi-byte/Camp_It_Ralph.git Camp_It_Ralph
cd Camp_It_Ralph
node --version
python3 --version
npm --prefix prototype ci
```

특정 배포를 재현하려면 배포 검증 기록의 커밋을 `git checkout <확인한-SHA>`로 선택합니다. 비밀값은 명령·저장소·브라우저 입력에 넣지 않습니다. 새 계정·권한이나 Vercel 설정 변경은 이 절차의 전제가 아닙니다.

## 2. 품질 검사와 빌드

아래 명령은 모두 **저장소 루트**에서 실행합니다.

```sh
npm --prefix prototype run typecheck
npm --prefix prototype run lint
npm --prefix prototype test
python3 data-pack/scripts/validate_out.py
npm --prefix prototype run build
```

`typecheck`는 앱·API·사전 생성·E2E 코드를 검사합니다. Vitest의 외부 API 응답은 고정한 합성 응답입니다. 데이터 검사는 커밋된 번들의 구조·범위를 확인하며 최신 기관자료를 다시 수집하거나 개별 부지 공급 가능성을 검증하지 않습니다.

수동 AI 의견 생성은 [사전 생성 안내](PRECOMPUTED_MEMOS.md)를 따릅니다. `--help`는 외부 호출 없이 실행할 수 있고, 실제 생성은 키가 설정된 환경에서 OpenRouter에 직접 요청합니다. `--output`은 새 검수 후보를 만들며 빌드·배포나 기존 생성본 갱신을 수행하지 않습니다. 합성 시험 통과와 실제 생성 성공을 구분합니다.

## 3. 화면 실행

```sh
npm --prefix prototype run dev -- --host 127.0.0.1 --port 5209 --strictPort
```

브라우저에서 `http://127.0.0.1:5209/`를 열고 `/project`, `/team`, `/review`를 확인합니다. 종료는 서버 터미널에서 `Ctrl+C`입니다. 기존 서버가 있는 포트를 재사용하거나 다른 작업의 서버를 종료하지 않습니다.

개발 서버의 `/api/*`는 **실제 운영 Vercel로 전달**됩니다. 주소·좌표와 사용자가 선택한 AI 요청이 운영 API로 전송됩니다. `prototype/api/`의 로컬 수정은 Vite에서 실행되지 않습니다. 지도 타일과 온라인 조회에는 인터넷 연결이 필요합니다. HTTP 성공과 기관 응답의 완전성은 별개이며, 실패·부분·미확인은 화면에 그대로 표시됩니다. AI 없이 기본 검토와 보고서를 사용할 수 있습니다.

## 4. 합성 통합 회귀와 PDF

Playwright 패키지는 `npm ci`로 설치되지만 Chromium 바이너리는 별도 설치해야 합니다. 고정 개발 의존성은 Playwright 1.63.0, axe 4.13.0입니다.

```sh
npm --prefix prototype run test:e2e:install
npm --prefix prototype run build
npm --prefix prototype run test:e2e
```

`test:e2e`는 합성 입력 파일을 만들고 **5208** 서버를 자동 시작·종료합니다. 이 포트가 비어 있어야 다른 프로젝트 서버를 재사용하지 않습니다. 서버는 `dist`와 고정 응답을 제공하며 실제 API handler나 외부 공급자의 성공 검사가 아닙니다. Linux에서 필요한 OS 라이브러리는 [Playwright 공식 설치 안내](https://playwright.dev/docs/browsers#install-system-dependencies)를 따릅니다.

PDF·성능을 따로 검사할 때는 두 터미널을 사용합니다. 첫 터미널은 아래 서버를 켜 둡니다.

```sh
npm --prefix prototype run test:e2e:serve
```

다른 터미널에서 저장소 루트 기준으로 실행합니다.

```sh
npm --prefix prototype run test:performance
npm --prefix prototype run test:pdf
python3 prototype/e2e/inspect-pdf.py prototype/e2e/artifacts/pdf --render
node prototype/e2e/security-scan.mjs
```

PDF 추출에는 `pypdf`, `pdfplumber`, 이미지 렌더에는 Poppler의 `pdftoppm`이 필요합니다. 필요한 경우 별도 Python 가상환경에만 설치합니다. 추출 통과 후 **모든 페이지 PNG를 열어** 잘림·겹침·제목 분리를 확인합니다. 검사 완료 후 첫 터미널의 `Ctrl+C`로 5208 서버를 종료합니다. 결과는 `prototype/e2e/artifacts/`에 생성되며 커밋하지 않습니다. 자세한 고정 시나리오는 [통합 QA 안내](../prototype/e2e/README.md), 구현 전 기대값은 [독립 사례](../prototype/e2e/independent-cases.json)를 참조하세요.

운영 보고서는 합성 API를 쓰지 않고 공개 서비스에서 [예제 입력](EXAMPLE_INPUT.md)을 직접 넣어 출력합니다. 배포 SHA·출력시각·URL·온라인 실패 여부를 PDF와 함께 보관합니다. 합성 검수 PDF와 운영 조회 PDF를 구별합니다.

## 5. 검토 상태와 복구

주소·현재 후보·공통 입력·최대 4개 후보의 개별 입력은 이 탭의 `sessionStorage`에 허용한 필드만 보관합니다(24시간, 96KiB 상한). 소개 페이지 왕복과 새로고침에 복원하지만 탭 닫기·보관기한·브라우저 정책·저장 실패 시에는 유지되지 않을 수 있습니다. 온라인 자료와 AI 의견은 저장하지 않고 다시 확인합니다. 영구저장·계정·서버 협업 저장소가 아닙니다. ‘검토 내용 지우기’로 현재 입력과 후보를 지웁니다.

빈 입력과 명시적 0은 다릅니다. 실제로 0인 비용만 0을 입력하세요. 조회 중·실패·부분자료는 ‘제약 없음’이 아닙니다. 화면의 재시도로 다시 확인하고, 보고서는 열 때의 입력·근거를 고정합니다. 이후 입력·조회가 바뀌면 보고서를 다시 열어 최신 값을 반영하세요. AI 의견은 선택 사항이고 변경 시 무효화되며 전체 문장의 법률·사실 판단을 자동 보증하지 않습니다.

## 6. 배포·근거 경계

기존 `.github/workflows/vercel-prod.yml`은 `prototype/**` 또는 workflow 변경의 `prototype` push와 수동 실행에 반응합니다. Node24/Python3.12, 타입·린트·Vitest·데이터 검사, Vercel build/deploy/Ready를 실행하며 **Playwright E2E는 Actions에 포함하지 않습니다**. 문서만 바뀐 push는 이 Actions를 실행하지 않지만, 별도 Vercel Git 연동이 Production 배포를 만들 수 있습니다. 토큰 값 확인 없이 Actions 결과, 실제 운영 배포의 커밋·Ready·별칭, 공개 응답 본문을 각각 대조합니다.

선택형 AI는 HTTP 200 본문 안에서도 실패할 수 있습니다. 서버의 허용 필드만 기록하는 진단과 자체 합성 요청의 시간 구간별 확인 절차는 [AI 오류 운영 안내](AI_DIAGNOSTICS.md)를 따릅니다. 기본 보고서 정상, 연결 성공, AI 의견의 내용 검수는 서로 다른 결과입니다.

검증 산출물과 개인 작업 기록은 저장소 밖의 비공개 폴더에 보관합니다. 원본 세션 JSONL·비밀값·개인 경로는 공개 저장소에 포함하지 않습니다.
