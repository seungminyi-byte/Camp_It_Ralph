# N04 — PR12 배포와 실제 오류 분류

검수: 2026-09-22T00:43:00.099263+09:00. [PR12](https://github.com/seungminyi-byte/Camp_It_Ralph/pull/12)는 `e7a33e7d37f3a9e42937cea043cb153f80cc1e89`로 병합됐다. [Actions 35619286414](https://github.com/seungminyi-byte/Camp_It_Ralph/actions/runs/35619286414)가 성공했고 완료 로그의 배포 URL을 `dpl_4HD35TeM7fcaeFhqMqSpkrzqKedM` READY·운영 별칭과 대조했다. 배포 전·후 운영 별칭의 대상도 동일했다. Vercel Git 배포는 별도로 생성됐으며 Actions 배포가 뒤에 별칭을 갱신했다.

00:33의 실서비스 기본 API 6종은 본문·버전·좌표·조회시각 및 WMS 실제 PNG를 검증했다. 용도지역은 자연녹지지역, 규제·재해 레이어는 조회 완료이며 일치 도형 없음이다. 이는 인허가 적합성 확인이 아니다. 인근 3후보는 `truncated=true`인 일부 탐색 결과다. 익명 새 브라우저 16검사·정적 34파일 바이트 일치가 통과했다. 기본 보고서는 AI 없이 생성됐고 면적 부족 5,000㎡·금융비용 60억원·입력 보존·후보 비교를 확인했다. 이전 PDF 검수를 새로 수행했다고 표시하지 않는다.

## AI 관측과 한계

자체 합성 프롬프트 1회는 00:33:24 시작, 11.207초 후 HTTP200 본문 `UPSTREAM_UNAVAILABLE`로 끝났다. 안전 진단은 텍스트 출력 전 상위 SSE 오류, 외부 HTTP200·code504·`timeout`, 서버경과10,909ms다. 따라서 이 관측은 로컬55초/15초 제한 도달과 다르다. 실제 선택 모델·제공자·fallback 시도·계정 정책 원인은 여전히 미확인이다. 성공 복구로 판정하지 않는다.

초기 넓은 시간창 수집은 4추출/2유일값으로 미확인 처리했다. Vercel JSON이 top-level message와 logs 배열에 같은 기록을 복제하는 점, 후속 자체 잘못된 입력 요청까지 시간창에 포함되는 점을 확인했다. 원본 결과는 보존했다. 새 AI 호출 없이 정확한 이전 요청 시간창을 조회한 v2는 요청 envelope 1개·logs 이벤트 1개이며 배포·도메인·POST·경로·HTTP 상태가 일치했다. 응답 헤더와 플랫폼 trace/id의 완전 일치는 false이므로 고유 ID로 확정 연결됐다고 주장하지 않는다. raw 로그·원문 오류는 저장하지 않고 12개 허용 필드·일치 불리언·원본 SHA만 보존했다.

## 다음 변경 결정

G027은 기본 우선순위 세 모델을 유지하면서 이미 허용된 `openrouter/free`를 네 번째 후보로 추가하는 작은 회복 시도를 승인한다. [공식 fallback](https://openrouter.ai/docs/guides/routing/model-fallbacks)은 오류 때 우선순위에 따라 다음 모델을 시도한다. [공식 무료 라우터](https://openrouter.ai/docs/guides/routing/routers/free-router)는 사용 가능한 무료 모델에서 고르므로 실제 모델·가용성·속도는 달라진다. 이 문서들은 이 계정의 복구 성공을 보장하지 않는다. 서버 추가 fetch·재시도·제한시간 확대·환경값 변경은 하지 않는다. 명시된 다른 모델은 단일 경로를 유지한다. 별도 회귀·독립 검수·실배포 확인 전 완료를 표시하지 않는다.

근거: [배포](../../../overnight/N04/release-provenance.json), [운영 검사](../../../overnight/N04/root-acceptance.json), [첫 진단](../../../overnight/N04/api/safe-runtime-diagnostic.json), [상관 대조](../../../overnight/N04/api/safe-runtime-diagnostic-v2.json).
