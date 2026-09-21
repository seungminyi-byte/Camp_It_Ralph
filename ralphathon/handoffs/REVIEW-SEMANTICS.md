# 검토 의미·핵심 요약 구현 인계

작성: build_review_semantics, 2026-09-21. 기준 HEAD `389f0cd`. AGENTS.md, GOAL/STATUS/DECISIONS D005~D009, DESIGN-REVIEW/PROPOSAL, PRODUCT-ENTRY 인계를 읽고 적용했다. 하위 에이전트·브라우저·커밋·push·배포는 수행하지 않았다.

## 변경 계약

- `scoreSite()`의 기존 이슈 생성 분기에 `id`, `category`, `basis`, `nextAction`을 추가했다. 별도 판단 엔진·범용 evidence graph·새 점수/가중치/임계값을 만들지 않았다. `category`는 `confirmed_constraint / unknown / input_condition`, `basis`는 `public_data / public_estimate / user_input / calculation / unverified`다.
- 법적 제한·직접 조건부 구역·재해 지정 조회는 공개자료 해당 사실로 표시한다. 인허가 결과로 확장하지 않는다. 번들 제한+실시간 실패는 제한과 미확인을 함께 보존한다.
- 총괄 중간 검수 반영: buffer 추정과 격자 급경사는 `unknown/public_estimate`. 직접 구역과 buffer가 혼재하면 `restriction.prohibited` 또는 `restriction.conditional`과 `restriction.estimated`를 분리한다. 분리는 기존 결과를 표시하기 위한 것이며 원래 restriction.hits/감점/E 상한은 그대로다.
- `ScoreInput.landUseSource`를 현재 workspace 입력에 명시 전달한다. 비교의 `toScoreInput`은 보관 중인 manualLandUse와 일치하는 zoning 응답에서 원천을 전달한다. 기존 source 생략 입력은 엔진에서 공개조회로 추측하지 않는다.
- 수동/출처 생략의 용도지역은 evidence의 공개자료 확인 상태가 아니다. 현재 적용값과 출처를 detail에 적으며 기존 참고점수 계산은 유지한다. 명시적 auto도 유효한 조회값과 적용값이 일치해야 공개자료 확인 상태다.
- 조례 검토는 `input_condition`이며 출처별 basis가 붙는다. 중대 제약 문구는 `restriction.prohibited`에만 연결한다. tone/title 문자열로 제약을 분류하지 않는다.
- 전력·용수·통신 미확인은 시작 전에도 기본 요약에 남긴다. 유효한 사용자 확인 내용/날짜 규칙은 그대로다. 미입력 선택 면적·비용·차입잔액은 전체 issues/actions에는 보존하되 기본 요약에서 과도한 오류로 표시하지 않는다. 입력을 시작한 오류는 표시한다.
- 기존 `review.issues`/`review.overview.issues`를 분류 순서로 정렬하고 `nextAction`에서 actions를 만든다. 제약 → 필수 미확인 → 입력조건 순이며 분류 안의 기존 생성 순서는 유지한다. `review.overview.actions`는 기본 요약의 행동, `review.actions`는 선택 상세까지 포함한 전체 행동이다. 요약 이슈가 없으면 기존 일반 설계·인입 후속 행동을 표시한다.

## 화면

- ResultOverview를 현재 검토 상태 → 확인된 제약 → 미확인 → 입력조건(해당 시) → 다음 확인사항 순으로 재구성했다. 이슈별 세부 근거는 native details로 펼친다. 출처 성격을 제목 옆에 표시한다.
- 상단은 `공개자료의 해당 사실 ≠ 인허가 결과`, `제약 항목 없음 ≠ 사업 가능·안전 판정`, `사용자 확인 ≠ 기관 확약 검증`을 짧게 알린다.
- 다음 행동은 엔진 overview.actions의 앞 3개, 전체 행동은 별도 접힘이다. 점수·분야별 가중치·감점·산식은 보조 `참고점수와 산정 근거` 접힘 안에 유지했다. 기존 면적 충족률과 children BusinessInputs도 보존했다.
- 바로 접근할 수 있는 `출처·자료 상태` 접힘에 기존 EvidenceList를 재사용했다. 기존 AnalysisDetails의 근거 표시도 유지했다. 후속 단계에서 중복된 근거 입구를 정리할 수 있으나 데이터를 분리 저장하지 않는다.
- 총괄의 실제 화면 검수 후 `용도지역 및 부지 정보`의 일괄 ‘확인됨’을 출처에 따라 ‘사용자 선택 적용 / 공개 조회값 적용 / 출처 확인 필요’로 바꿨다.
- workspace.css에 결과 요약 범위의 읽을 크기·행간·접힘 터치 목표·모바일 줄바꿈을 추가했다. 페이지 전체 모바일 스크롤·보고서·비교 재배치는 다음 단계 범위다.

## 검증과 남은 작업

자세한 기대·실패·수정은 `../evidence/review-semantics/CONTRACT.md`. 최종 타입 검사·린트·전체 19파일 182테스트·production build 통과. 기존 166개 대비 16개가 추가되었고 첫 기존 테스트의 ‘초기 공급 미확인 숨김’ 기대만 새 요구로 교체했다. 대표 15,000㎡/60억원/null·0/골든 점수·규제·재해·자료범위·후보 source/18항목 보고서와 SSR 통합 회귀를 포함한다. 상수·공개 데이터 diff 없음. 기존 전체 자료 수집은 실행하지 않았다.

총괄의 중간 실제 검수에서 1440px 덕이동의 제약 없음/규제 추정 미확인/전력·용수·통신/다음 행동과 390px scrollWidth=390을 확인했다는 인계를 받았다. 이 에이전트의 직접 브라우저 검증은 아니다. 남은 390/768/1440 전체 흐름과 details 키보드 접근, 긴 제한 근거/출처, 조건 변경 시 현재/후보/보고서 원천 일치의 독립검수가 필요하다. 실제 A4 PDF·axe·Lighthouse·실시간 실패 상호작용은 이 단계에서 통과를 주장하지 않는다.

다음 보고서/비교 단계는 `review.overview.issues`의 category/basis와 `review.overview.actions`를 재사용하면 된다. 기존 보고서 첫 장의 actions.slice(-2), 비교 행동, 상세 입력 재배치, 보고서·AI 동선, 검색 경쟁/API/부가 데이터 실패는 변경하지 않았다.

## 파일 소유권 인계

이 에이전트의 변경은 아래 파일이며 총괄에게 인계한다. 총괄의 STATUS/DECISIONS/MEDIA-PLAN/DEPLOYMENT-PLAN/SUBMISSION-NARRATIVE 및 다른 기존 문서 변경은 수정하지 않았다.

- prototype/src/types.ts
- prototype/src/scoring/engine.ts, engine.test.ts
- prototype/src/compare/pins.ts, pins.test.ts
- prototype/src/pages/ReviewWorkspace.tsx (현재 입력 source 연결·용도지역 출처 문구)
- prototype/src/components/ResultOverview.tsx, integration.test.tsx
- prototype/src/report/checklist.test.ts
- prototype/src/styles/workspace.css (요약 범위 CSS)
- ralphathon/evidence/review-semantics/*
- ralphathon/handoffs/REVIEW-SEMANTICS.md
