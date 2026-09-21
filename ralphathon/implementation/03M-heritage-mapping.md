# 03M 국가유산 분류 구현·검사 인계

작성 기준: 2026-09-21 18:32 KST. 작업 시작 18:21 KST. 전체 마감은 2026-09-22 10:00 KST이며 작성 시점 잔여 약 15시간 28분이다. 기준 HEAD는 `059f782e8ad4bb020b1ff1ce037f7f7ce4eba991`, 작업 브랜치는 `codex/ralph-goal-20260921`다. 제품 변경은 아직 미커밋이며 커밋·푸시·PR·배포는 총괄 단계다.

## 1. 문제와 완료 범위

등록문화재·구 명칭 지정문화재·자연유산·유형 미상을 모두 문화유산법 제35조의 입지 금지로 취급하고, 직접 적중이 있으면 같은 레이어의 모든 주변 적중을 지우던 동작을 수정했다. 법적 적용 확인과 API 조회 성공을 분리하고, 직접 적중은 `review`, 주변 검색은 `reference`로 전달한다. 이번 결과는 감사 03L과 총괄 결정 G005의 제품 적용이며 개별 필지의 허가 가능성을 새로 판단한 법률의견이 아니다.

저장소 `AGENTS.md`를 읽고 적용했으며 원본은 수정하지 않았다. 런북·활성 목표·STATE/DECISIONS/EVIDENCE/HANDOFF·03L 전체·설계 02의 엔진/보고서 및 클라이언트 경계를 확인했다. 과거 메모리는 기존 코드와 40/15 정책 위치 파악에만 사용했고 법적 매핑의 근거는 현재 검수된 03L/G005다.

지정 실행 모델은 gpt-6-astra/xhigh다. 도구 설명상 복합 법률 경계·엔진·회귀 검수에 적합한 품질을 우선했고, Sol/Terra의 일반 구현 속도·비용 대안과 Luna의 작은 반복 작업 대안보다 이 패키지에서는 Astra를 유지했다. 별도 모델 벤치마크나 추가 하위 에이전트를 실행하지 않았고 전역 설정도 변경하지 않았다. 실제 모델 확인은 총괄의 세션 기록 검증과 연결한다.

## 2. 적용한 계약과 대안

| 항목 | 구현 결과 |
|---|---|
| 직접 적중 | 문화유산 유형과 무관하게 검토가 필요한 `review`; 무감점. 번들의 천연기념물·명승 지정구역 323개 도형도 같은 정책 |
| 숫자점수 | review가 하나라도 있으면 `requiresLegalReview=true`, 인허가 및 종합 숫자점수 `null`. 다른 금지가 없으면 등급과 상한 사유도 `null` |
| 다른 금지와 혼합 | 금지의 40점 1회·E 상한·`capReason=restriction` 유지. 문화유산 review 때문에 숫자점수는 `null`; E의 근거는 다른 prohibited만 표시 |
| 다른 conditional과 혼합 | 기존 15점 1회만 유지하고 숫자점수는 보류. review를 conditional로 승격하지 않음 |
| 주변 적중 | `reference/nearby`, 무감점·E 없음·거리만의 보류 없음. 기본 500m를 법정 보존지역으로 바꾸지 않음 |
| 감점 근거 분리 | `restriction.hits`는 모든 관찰, `scoringHits`는 prohibited/conditional만. 실제 감점 설명에는 해당 감점 수준의 hit만 사용 |
| 직접·주변 보존 | 중복 키가 source, layer/zoneId, type, rawName, relation을 포함. 같은 이름의 직접·주변도 보존하고 동일 대상 중복 가능성을 설명. 실제 유산 개수로 세지 않음 |
| 원문·이름 | `rawName`으로 null/빈 문자열을 포함한 원문명 보존. 표시용 이름은 별도. 공백/NFC/시·도 구분점만 정규화하고 유한 별칭에 정확 일치. 국가유산에는 includes 규칙 사용 금지 |
| 부분 조회 | `complete=false` 또는 failed가 있으면 partial. 전달받은 금지/review/reference는 보존. 전체 실패·번들 없음은 unknown |
| 근거·시간 | mappingVersion·법령 검토일·시행일·VWorld 문서 갱신일/URL과 API fetchedAt을 별도 전달. 법령 출처는 체크리스트/보고서 링크에 포함 |
| 표시 | review/reference가 체크리스트의 good으로 떨어지지 않음. 요약/보고서 머리의 미산정 사유, 지도 review 설명, AI 규칙을 최소 수정 |

03L의 대안 A를 구현했다. 별도 heritage 배열을 만드는 B는 모든 표시 경로를 두 배열로 합쳐야 하고, conditional 15점 재사용인 C는 허가 규정에서 획일 감점을 도출하는 문제를 남겨 선택하지 않았다. 새로운 라우터·상태 라이브러리·차트·서버 계약·기하 수집은 추가하지 않았다.

`summarizeRestriction(result, detailed=false)`는 비교에 필요한 원문명·관계·반경·보류/상한 원인·partial·중복 가능성을 남긴 압축 표현이다. `detailed=true`는 관련 규정·행위 확인 문구·법령 검토일·시행일·API 조회시각을 추가하며 AnalysisDetails와 체크리스트/보고서가 사용한다. 엔진의 `describeRestrictionHits`가 제공 관찰만 서식화하며 UI에 새로운 판정식을 두지 않았다.

별칭은 03L §4의 등록/국가등록/시도등록/명시 문화유산/구 국가지정문화재/시도 지정·자료/자연/시도 자연·자료/역사환경/임시 구분에서, 해당 명칭 자체와 `구역`·`보호구역`을 명시한 유한 문자열만 등록했다. 이들은 분류기 회귀 입력이며 실제 VWorld가 모든 별칭을 출력한다는 주장이 아니다. 실관찰 명칭은 총괄의 등록문화재구역, 공식 문서 샘플은 국가지정문화재구역이다. 해제·비등록·새 명칭은 미상 review로 남긴다.

## 3. 검사와 실패 보존

환경: Node 24.20.0을 실행별 PATH로 지정, Python 3.12.14는 번들 절대경로를 지정했다. 설치·전역 설정 변경 없음. [명령·시각·종료 코드](../../../evidence/03M-check-results.json)에 최종 검사를 기록했다.

| 검사 | 결과 | 근거 |
|---|---|---|
| 구현 전 L01~L25 | 25건 중 23실패/2통과. production constants로 기존 결함 확인 | [03M-red.log](../../../evidence/03M-red.log) |
| 최초 상수 동기화 | 기존 validator가 review/reference enum을 거부하여 1실패. 실패를 숨기지 않고 enum 허용·G005 자료검증 추가 | [03M-sync.log](../../../evidence/03M-sync.log) |
| 정상 경로 상수 동기화 | curated→`build_all.py --sync-only` 검증·복사 성공. 기존 indent=1 유지, 앱 복사본 직접 편집 없음 | [03M-sync-final.log](../../../evidence/03M-sync-final.log) |
| 첫 관련 검사 | restriction/engine/checklist/heritage 4파일 80건 통과 | [03M-related.log](../../../evidence/03M-related.log) |
| 추가 분류·소비자 검사 | L01~L25 + 표기정규화·날짜·반경·partial·비교/AI/면적/금융 5건 = 30건 통과 | [03M-extra-check.log](../../../evidence/03M-extra-check.log) |
| 최종 전체 Vitest | **24파일 336건 통과**. 원래 306건과 신규 30건. 기존 공원 E/40, 재해15, 농업보호15, 해상/범위 밖, 비용 비교 포함 | [03M-all-tests-final.log](../../../evidence/03M-all-tests-final.log) |
| 타입·린트 | 앱/API/스크립트 타입검사 및 lint 종료0 | [타입](../../../evidence/03M-typecheck-final.log), [린트](../../../evidence/03M-lint-final.log) |
| 데이터 검증 | VALIDATION PASSED. 전국 자료/323 공통유형·정확 이름 규칙·법령 source ID 연결 검증 | [데이터](../../../evidence/03M-data-validation-final.log) |
| 프로덕션 빌드·diff | 빌드 성공, `git diff --check` 종료0 | [빌드](../../../evidence/03M-build-final.log), [diff](../../../evidence/03M-diff-check-final.log) |

테스트 기대값을 현재 출력으로 바꾸지 않았다. L24의 엔진 회귀는 실제 반경 1000m와 명시 0 우선, queried 반경 fallback을 검사한다. 기존 서버 회귀 `vworld-boundaries.test.ts`는 buffer0에서 upstream 5회·주변 query/hit 없음도 확인하므로 엔진 테스트의 합성 queried 배열만으로 API 동작을 주장하지 않는다. 변경 내용 때문에 전체 재검사를 했으며 이후 제품 변화가 없으면 반복하지 않는다.

총괄의 독립검수는 별도 근거다. [문화유산 13probe](../../../evidence/root-heritage-green-initial.json), [독립 산식/비교 12건](../../../evidence/independent-engine-after-03M-initial.json), [서울시청 실제 브라우저](../../../evidence/root-heritage-browser-initial.json)를 읽었다. 총괄은 기존 운영 API 응답에 등록문화재구역이 있는 상태에서 새 로컬 UI의 법적 적용 확인 필요·숫자점수 미산정·잘못된 E 미표시를 확인했다. 실행자가 실브라우저를 직접 재조작한 것으로 기록하지 않는다. 이 검사는 배포 변경, 전 반응형 폭, PDF 전체페이지 검증을 뜻하지 않는다.

## 4. 수정 파일과 보존 근거

[파일 SHA-256 manifest](../../../evidence/03M-changed-files.json)에 기준 HEAD, 아래 변경 파일, 동기화 상수 동일성, AGENTS·보호지역 번들의 기준 HEAD와 동일성을 기록했다.

- `data-pack/curated/constants.json`, `prototype/public/data/constants.json`: 공통 분류·출처·별칭·주의문. 수치 40/15/500과 다른 규제유형 유지.
- `data-pack/scripts/validate_out.py`: 신상태 및 문화유산 매핑 자료 검증.
- `prototype/src/types.ts`: review/reference, 원문·공간관계·scoringHits·법적 검토·근거 메타데이터.
- `prototype/src/scoring/restriction.ts`, `prototype/src/scoring/engine.ts`: 분류·집계·산정 보류·감점 근거 분리·설명.
- `prototype/src/scoring/restriction.test.ts`, `prototype/src/scoring/heritage.test.ts`: 수정된 직접/주변 계약과 독립 30회귀.
- `prototype/src/report/checklist.ts`: caution 처리, 상세 근거와 공식 출처 URL.
- `prototype/src/components/AnalysisDetails.tsx`, `ResultOverview.tsx`, `ChecklistReport.tsx`, `MapView.tsx`: 새로운 엔진 상태의 최소 표시 연결.
- `prototype/src/genai/prompts.ts`: review/reference로 금지·가능성을 단정하거나 E 원인을 바꾸지 않는 지침.
- `prototype/api/restrictions.ts`: buffer 설명 주석만 수정. 런타임 계약·로직 변경 없음.
- `docs/DATA.md`, 본 문서: 자료/법적/검증 범위와 다음 패키지 인계.

원본 사진·AGENTS·보호지역 도형·독립 probe·총괄 STATE/DECISIONS/EVIDENCE/AGENT_LOG는 수정하지 않았다. 신규 외부 법률조사·CaseNote 사용은 없으며 검수된 03L 근거만 구현했다. 커밋·푸시·PR·배포·대회 제출·유료 요청·키 조회는 수행하지 않았다.

## 5. 다음 실행자 인계와 미검증

1. **04 클라이언트/AI:** `RestrictionLookup.bufferM/fetchedAt`은 이번에 optional 타입과 엔진 소비만 추가했다. 현행 클라이언트 parser는 두 값을 아직 보존하지 않으므로 04에서 검증한 서버 envelope로 보존해야 한다. 반경은 현재도 queried의 `LT_C_UO301@반경`에서 보완된다. 새 version/coordinate/complete/failed 계약과 candidate revision 검증을 적용하고, 동일 후보의 이전 known hit를 재조회 실패 때 재확인 필요 snapshot으로 전달한다. 엔진은 전달받은 hit를 보존하지만 삭제된 과거 hit를 복구하거나 다른 후보와의 동일성을 판단하지 않는다. AI 입력의 전체 result에 mappingVersion과 관계가 포함되어 서명이 바뀌는 것은 검증했고, 스트림 생명주기·출력 주요 주장 대조는 여전히 04 범위다.
2. **06 결과·보고서:** 첫 장·4열 비교의 압축 요약과 상세 근거를 분리하되 review의 보류 사유, 다른 prohibited의 E 원인, 실제 검색 반경, 원문명/관계, partial 상태를 누락하지 않는다. 현재 detailed 근거는 길 수 있으므로 장문·혼합 제약·4후보의 A4 실제 PDF 모든 페이지를 검사해야 한다. `true` 상세에 버전·검토일·시행일·공식 링크가 있으므로 첫 장에 이를 반복할 필요는 없다. 실제 전체 PDF/390·768·1440폭/접근성 완료는 이번 패키지에서 주장하지 않는다.
3. **09 배포:** 로컬 Vite `/api`는 기존 운영 프록시다. 서버 주석 수정이나 로컬 화면 확인이 새 서버 배포를 뜻하지 않는다. 최종 배포 시 동일 커밋·Ready·운영 정적파일 및 응답을 따로 검증한다.
4. 개별 고시·조례·유산 identity·전체 ucode 대응·허가 가능성·최신 도형은 미확인으로 남긴다. 본 패키지는 다른 분야의 기존 prohibited 법적 정확성을 새로 감사하지 않았다.

03M 제품 파일 소유권은 총괄 검수에 반환한다. 다음 제품 수정은 총괄의 후속 요청이나 04 인계 이후의 지정 실행자가 맡는다.
