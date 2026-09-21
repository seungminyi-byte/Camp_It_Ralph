# 책임별 구조와 기존 구현 재사용

기준선 `66e310b9f889b9dca4de5cd1b79e5830d69063b1`에서 08 제품 커밋 `8ebad19540cd38eca1c33be726734df9a9f5eee8`까지의 실제 diff를 기준으로 합니다. 152개 파일 변경에는 검사·문서·이미지도 포함됩니다. 새 서버·데이터를 전부 만든 것으로 계산하지 않습니다. 09는 실행 문서·재현과 운영 검증 단계입니다.

| 책임·경로 | 기존 구현에서 계승 | 03~08 변경 |
|---|---|---|
| `prototype/src/scoring/` | `scoreSite()` 단일 계산, 면적·비용·금융·출처 결과 | 온라인 완전성/만료 경계, 문화유산의 직접 review·주변 reference 분류 보완. 대표 산식 유지 |
| `data-pack/curated/constants.json` → `prototype/public/data/` | 기존 상수의 단일 원본, SGIS·지형·주변자료 번들 | 좁은 문화유산 분류 정책·메타데이터·검증 동기화. 대규모 신규 수집 없음 |
| `prototype/api/`, `prototype/shared/` | 기존 VWorld 6경로와 AI, Edge 서울 지역, HTTP fetch | 요청 크기·형식, 본문 시간제한, pagination/부분 실패, 버전/좌표/조회시각 계약, 무료 AI 경계 |
| `prototype/src/lib/`, `hooks/` | 기존 공개자료 읽기와 조회 | bounded JSON, bundle 소비형태 검증·실패 retry, 독립 consumer/cache·늦은 응답 차단·TTL |
| `prototype/src/genai/` | v4 전체 문맥 서명, 기존 체크리스트·프롬프트 | 실행 revision, 65초 경계, 구조/대표 수치·주장 대조, 중단/빈값·실패 표시, 안전 URL |
| `prototype/src/App.tsx`, `site/` | 기존 React/Vite 진입점·GS 오렌지 | 공통 shell, 네 URL, 소개·팀, 검토 lazy 오류 복구, 반응형 페이지 |
| `prototype/src/review/` | 기존 검토 화면의 계산·선택 기능 | App 소유 입력 store, 제한된 session 복원, 현재/핀 재조회 큐, 검토 앱 책임 분리 |
| `prototype/src/compare/`, `components/` | 최대 4개 후보, 비용 방식/완전성 비교 | 최신 유효 근거 재평가, 정보 순서·카드/표, 키보드 모달 순환, 입력 대비 |
| `prototype/src/report/`, `ChecklistReport` | 근거표·민감도·인쇄 경로 | 열기 시점 고정 snapshot, 첫 장 요약·출처·미확인·다음 확인, AI 선택 부록, 제목 쪽나눔 |
| `prototype/public/images/` | 사용자 원본 사진 별도 보존 | 비율 유지한 WebP7개, 실제 제품의 합성 조건 캡처2개·생성 명세 |
| `prototype/e2e/`, 기존 `*.test.*` | 기존 19파일166 회귀를 출발점으로 사용 | 최종46파일551 Vitest·17 E2E·26 axe·실제 3폭·새 A4 5종53쪽 검수. 운영 연결과 구분 |
| `.github/workflows/vercel-prod.yml` | Node24/Python3.12·Vercel CLI59.16.0·기존 secret·Ready 확인 | 워크플로와 권한 확대 없음. production rewrite는 네 경로/없는 자원404에 맞춤 |

새 라우터·상태관리·차트·지도 엔진 런타임을 넣지 않았습니다. 새 개발 의존성은 Playwright/axe 등 검사 도구입니다. 공급 가능량 확인, 기관 협의, 허가 신청, 비용 절감 실측, 후속 기후·IC 원자료 수집은 이번 완료 기능이 아닙니다.

## 공개 서비스·프로젝트에서 참고한 부분

[조사 원문과 확인일·라이선스](../ralphathon/research/01-problem-references.md) 및 [설계 대안](../ralphathon/design/02-architecture-challenge.md)을 따릅니다. 아래는 원리를 참고한 **독립 구현**이며 외부 프로젝트 소스·폰트·로고를 복제한 것이 아닙니다.

| 출처 | 실제 적용 | 미적용·경계 |
|---|---|---|
| [Paces](https://www.paces.com/) | 메인의 문제→실제 결과 예시→검토 시작과 후속 행동 | 미국 자료·계통해석·전문가 신청 지원을 기능으로 가져오지 않음 |
| [Felt](https://felt.com/product) | 지도·레이어/조작·선택 결과/목록을 구분 | 협업 백엔드·업로드·권한 관리 없음 |
| [Glint Solar](https://knowledgebase.glintsolar.com/en/article/how-to-start-using-glint-solar) | 선택 위치→후속 보고 흐름의 비교 참고 | 태양광/BESS 설계·수익/절감 수치 미사용 |
| getdesign [IBM](https://getdesign.md/ibm/design-md) / [Airtable](https://getdesign.md/airtable/design-md) / [Linear](https://getdesign.md/linear.app/design-md) | 정보 위계·구분선/정렬, 실제 화면과 짧은 설명, 간결한 상태명 | 정확히 3개 보조 후보. 전면 IBM/다크 Linear 복제·예시 성과/고객 인용 없음 |
| [Kepler.gl](https://github.com/keplergl/kepler.gl) — MIT | 데이터/표시/화면 책임과 내보내기 상태 구분 | Redux/deck.gl/소스 도입 없음 |
| [TerriaJS](https://github.com/TerriaJS/terriajs) — Apache-2.0 | 레이어 출처 설명, 계산과 UI 분리 | 플랫폼·소스 도입 없음 |
| [uMap](https://github.com/umap-project/umap) — AGPL v3+ | 지도 데이터·화면·저장 책임 비교 | 서버/소스 복제 없음. MIT로 취급하지 않음 |

[08 검수 범위](../ralphathon/implementation/08-integration-quality.md)와 [09 재현·배포](../ralphathon/implementation/09-reproduction-deployment.md)를 구분해 읽습니다. 고정 회귀 통과를 기관 원자료의 정확성이나 실제 공급·법률 판단으로 확대하지 않습니다.
