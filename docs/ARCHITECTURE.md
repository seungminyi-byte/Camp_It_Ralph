# 구조와 기술 선택

사용자의 입력, 자료의 확인 상태, 계산 결과와 표현을 분리해 같은 근거를 화면·후보 비교·보고서에 일관되게 사용합니다.

| 영역 | 경로 | 역할 |
|---|---|---|
| 계산 | `prototype/src/scoring/` | `scoreSite()`에서 공간·규제·면적·사업비·금융비용과 다음 확인사항을 계산합니다. |
| 자료·상수 | `data-pack/curated/`, `data-pack/out/` | 자료 출처와 판단 기준을 관리하고 검증 후 `prototype/public/data/`로 동기화합니다. |
| 온라인 조회 | `prototype/api/`, `prototype/shared/` | VWorld 조회와 AI 요청의 형식·시간제한·부분 응답·오류를 처리합니다. 서버 키는 브라우저로 보내지 않습니다. |
| 입력·조회 상태 | `prototype/src/review/`, `lib/`, `hooks/` | 입력과 후보를 관리하고, 늦게 도착한 응답·만료·실패를 구분합니다. 허용한 입력만 탭 세션에 보관합니다. |
| 페이지 | `prototype/src/App.tsx`, `site/` | 메인·프로젝트·팀·검토의 네 경로와 반응형 화면을 구성합니다. |
| 비교 | `prototype/src/compare/`, `components/` | 최대 네 후보를 같은 조건으로 다시 계산하고, 비용 범위가 일치할 때 차액을 표시합니다. |
| 보고서 | `prototype/src/report/`, `components/ChecklistReport.tsx` | 열기 시점의 입력·근거를 고정해 요약·18항목·출처·다음 확인·A4 인쇄를 구성합니다. |
| AI 의견 | `prototype/src/genai/`, `prototype/api/_gemini.ts` | 전체 문맥 서명과 생성 형식·수치·표현을 확인하고 사용자가 선택한 의견을 부록에 연결합니다. |
| 검증 | `prototype/src/test/`, `*.test.*`, `prototype/e2e/` | 단위 회귀와 고정 응답 기반 브라우저·접근성·PDF 검사를 수행합니다. |
| 배포 | `.github/workflows/vercel-prod.yml` | Node.js 24·Python 3.12 품질 검사 후 Vercel에 배포하고 Ready를 확인합니다. |

## AI 처리

`GEMINI_API_KEY`가 설정되면 Google 네이티브 SSE와 고정 모델 `gemini-3.5-flash-lite`를 사용합니다. 종합 의견·18개 항목·후속 조치·유의사항의 JSON 스키마와 명시적인 완료 상태를 확인한 뒤 보고서 형식으로 전달합니다. 생성 중인 JSON과 추론 내용은 화면에 표시하지 않습니다.

Google 키가 없는 기존 환경은 OpenRouter 경로를 사용합니다. Google 경로에서 실패했을 때 다른 공급자로 자동 전환하지 않습니다. 입력·근거가 바뀌면 의견을 해제하며, 기본 조회·계산·보고서는 독립적으로 사용할 수 있습니다. 설정은 [서버 설정](CONFIGURATION.md), 시간제한과 실패 확인은 [AI 오류 진단](AI_DIAGNOSTICS.md)을 참조합니다.

## 참고한 서비스와 설계 원칙

| 참고 자료 | 적용한 원칙 |
|---|---|
| [Paces](https://www.paces.com/) | 해결할 문제에서 실제 결과 예시와 검토 시작으로 이어지는 소개 흐름 |
| [Felt](https://felt.com/product) | 지도·레이어 조작·선택 결과를 구분하는 화면 구성 |
| [Glint Solar](https://knowledgebase.glintsolar.com/en/article/how-to-start-using-glint-solar) | 선택 위치에서 후속 보고로 이어지는 업무 흐름 |
| getdesign의 [IBM](https://getdesign.md/ibm/design-md), [Airtable](https://getdesign.md/airtable/design-md), [Linear](https://getdesign.md/linear.app/design-md) 분석 | 제목 위계, 표 정렬, 실제 화면과 짧은 설명, 간결한 상태명 |
| [Kepler.gl](https://github.com/keplergl/kepler.gl), [TerriaJS](https://github.com/TerriaJS/terriajs), [uMap](https://github.com/umap-project/umap) | 데이터·표시·상태·내보내기의 책임 분리 |

위 자료는 설계 원리를 비교한 참고 자료입니다. 제품 화면과 흐름은 이 프로젝트에서 독립적으로 구현했으며 외부 서비스의 소스·폰트·로고를 복제하지 않았습니다. 런타임 의존성과 실제 사용 라이브러리는 [package.json](../prototype/package.json)과 잠금 파일에 기록합니다.
