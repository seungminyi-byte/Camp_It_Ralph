# 최종 품질 측정 경로

2026-09-21. 아래는 도구 준비 계획이며 측정 결과가 아니다.

- Lighthouse: 최종 공개 배포의 홈과 #review를 Google PageSpeed Insights에서 mobile/performance/accessibility/best-practices 동일 조건으로 각각 3회 측정한다. 원본 JSON의 requestedUrl/finalUrl/fetchTime/lighthouseVersion/configSettings/environment/runWarnings 및 점수를 보존하고 중앙값을 계산한다. URL fragment가 실제 앱 화면 측정으로 유지되는지 finalUrl·screenshot audit로 검수한다. 원본 보고서 없이 점수를 추정하지 않는다.
- 공식 API는 키 없이 사용 가능하므로 기존 키 검색·신규 키 발급 없이 우선 시도한다. 할당량 등 실패 시 실제 공식 웹 UI로 같은 측정을 수행한다. 실행 실패를 0점이나 통과로 집계하지 않는다.
- axe: 실제 지정 브라우저에서 홈/기본 검토/상세 입력/비교/보고서의 렌더된 DOM을 검사한다. 도구의 read-only evaluate에서 스크립트를 주입하지 않는다. 필요하면 소스에 분리된 로컬 QA 진입을 구현해 axe-core를 실행하고 결과를 화면·JSON으로 제공하며, 그 QA 패키지가 일반 production 번들에 들어가지 않게 검사한다. 자동 검사와 키보드·반응형 수동 검수는 별도 증거다.
- 새로운 브라우저 런타임·headless 자동화로 현재 지정 Chrome 확장 브라우저 제약을 우회하지 않는다.

근거: [Google PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started), [axe-core 공식 API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md), 2026-09-21 열람. Tavily 도구 검색 결과 노출 없음으로 허용된 web.run을 사용했다.
